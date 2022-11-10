mod knowledge;
mod ontology;

mod context;
mod pool;
mod query;
mod version_id;

use std::{
    collections::{hash_map::RawEntryMut, HashMap, HashSet},
    future::Future,
    hash::Hash,
};

use async_trait::async_trait;
use error_stack::{Context, IntoReport, Report, Result, ResultExt};
#[cfg(feature = "__internal_bench")]
use tokio_postgres::{binary_copy::BinaryCopyInWriter, types::Type};
use tokio_postgres::{GenericClient, Transaction};
use type_system::{
    uri::{BaseUri, VersionedUri},
    DataTypeReference, EntityType, EntityTypeReference, PropertyType, PropertyTypeReference,
};
use uuid::Uuid;

use self::context::{OntologyRecord, PostgresContext};
pub use self::pool::{AsClient, PostgresStorePool};
use crate::{
    identifier::knowledge::{EntityEditionId, EntityId},
    knowledge::{
        Entity, EntityUuid, KnowledgeGraphQueryDepth, LinkEntityMetadata, PersistedEntity,
        PersistedEntityMetadata,
    },
    ontology::{
        OntologyQueryDepth, PersistedDataType, PersistedEntityType, PersistedOntologyIdentifier,
        PersistedOntologyMetadata, PersistedPropertyType,
    },
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::identifier::{account::AccountId, GraphElementIdentifier},
    store::{
        error::VersionedUriAlreadyExists,
        postgres::{ontology::OntologyDatabaseType, version_id::VersionId},
        AccountStore, BaseUriAlreadyExists, BaseUriDoesNotExist, InsertionError, QueryError,
        UpdateError,
    },
    subgraph::{Edges, GraphResolveDepths, Subgraph, Vertex},
};

pub struct DependencyMap<V, T, D> {
    resolved: HashMap<V, (T, Option<D>)>,
}

impl<V, T, D> Default for DependencyMap<V, T, D> {
    fn default() -> Self {
        Self {
            resolved: HashMap::default(),
        }
    }
}

impl<V, T, D> DependencyMap<V, T, D> {
    pub fn new() -> Self {
        Self::default()
    }
}

impl<V, T, D> DependencyMap<V, T, D>
where
    V: Eq + Hash + Clone + Send + Sync,
    T: Send,
    D: PartialOrd + Send,
{
    /// Inserts a dependency into the map.
    ///
    /// If the dependency does not already exist in the dependency map, it will be inserted with the
    /// provided `resolved_depth` and a reference to this dependency will be returned in order to
    /// continue resolving it. In the case, that the dependency already exists, the
    /// `resolved_depth` will be compared with depth used when inserting it before:
    /// - If the previous `resolved_depth` was `None`, the dependency was not resolved yet and the
    ///   value is returned
    /// - If the new depth is higher, the depth will be updated and a reference to the dependency
    ///   will be returned in order to keep resolving it
    /// - Otherwise, `None` will be returned as no further resolution is needed
    pub fn insert(&mut self, identifier: &V, resolved_depth: Option<D>, value: T) -> Option<&T> {
        match self.resolved.raw_entry_mut().from_key(identifier) {
            RawEntryMut::Vacant(entry) => {
                let (_id, (value, _depth)) =
                    entry.insert(identifier.clone(), (value, resolved_depth));
                Some(value)
            }
            RawEntryMut::Occupied(entry) => {
                let (value, used_depth) = entry.into_mut();
                match (used_depth, resolved_depth) {
                    (None, Some(_)) => Some(value),
                    (Some(used_depth), Some(resolved_depth)) if *used_depth < resolved_depth => {
                        *used_depth = resolved_depth;
                        Some(value)
                    }
                    _ => None,
                }
            }
        }
    }

    /// Lazily inserts a dependency into the map.
    ///
    /// This behaves like [`insert`], but uses `resolver` to read the value to be inserted.
    ///
    /// [`insert`]: Self::insert
    pub async fn insert_with<F, R>(
        &mut self,
        identifier: &V,
        resolved_depth: Option<D>,
        resolver: F,
    ) -> Result<Option<&T>, QueryError>
    where
        F: Fn() -> R + Send + Sync,
        R: Future<Output = Result<T, QueryError>> + Send,
    {
        Ok(match self.resolved.raw_entry_mut().from_key(identifier) {
            RawEntryMut::Vacant(entry) => {
                let value = resolver().await?;
                let (_id, (value, _depth)) =
                    entry.insert(identifier.clone(), (value, resolved_depth));
                Some(value)
            }
            RawEntryMut::Occupied(entry) => {
                let (value, used_depth) = entry.into_mut();
                match (used_depth, resolved_depth) {
                    (None, Some(_)) => Some(value),
                    (Some(used_depth), Some(resolved_depth)) if *used_depth < resolved_depth => {
                        *used_depth = resolved_depth;
                        Some(value)
                    }
                    _ => None,
                }
            }
        })
    }

    pub fn into_values(self) -> impl Iterator<Item = T> {
        self.resolved.into_values().map(|value| value.0)
    }

    pub fn into_vec(self) -> Vec<T> {
        self.into_values().collect()
    }
}

pub struct DependencySet<T, D> {
    resolved: HashMap<T, Option<D>>,
}

impl<T, D> Default for DependencySet<T, D> {
    fn default() -> Self {
        Self {
            resolved: HashMap::default(),
        }
    }
}

impl<T, D> DependencySet<T, D> {
    pub fn new() -> Self {
        Self::default()
    }
}

impl<T, D> DependencySet<T, D>
where
    T: Eq + Hash + Clone,
    D: PartialOrd + Send,
{
    /// Inserts a dependency into the map.
    ///
    /// If the dependency does not already exist in the dependency map, it will be inserted with the
    /// provided `resolved_depth` and a reference to this dependency will be returned in order to
    /// continue resolving it. In the case, that the dependency already exists, the
    /// `resolved_depth` will be compared with depth used when inserting it before:
    /// - If the previous `resolved_depth` was `None`, the dependency was not resolved yet and the
    ///   value is returned
    /// - If the new depth is higher, the depth will be updated and a reference to the dependency
    ///   will be returned in order to keep resolving it
    /// - Otherwise, `None` will be returned as no further resolution is needed
    pub fn insert<'t, 's: 't>(
        &'s mut self,
        identifier: &'t T,
        resolved_depth: Option<D>,
    ) -> Option<&'t T> {
        match self.resolved.raw_entry_mut().from_key(identifier) {
            RawEntryMut::Vacant(entry) => {
                let (value, _depth) = entry.insert(identifier.clone(), resolved_depth);
                Some(value)
            }
            RawEntryMut::Occupied(entry) => {
                let (value, used_depth) = entry.into_key_value();
                match (used_depth, resolved_depth) {
                    (None, Some(_)) => Some(value),
                    (Some(used_depth), Some(resolved_depth)) if *used_depth < resolved_depth => {
                        *used_depth = resolved_depth;
                        Some(value)
                    }
                    _ => None,
                }
            }
        }
    }

    pub fn into_vec(self) -> Vec<T> {
        self.into_iter().collect()
    }

    pub fn remove(&mut self, value: &T) -> Option<T> {
        self.resolved.remove_entry(value).map(|(value, _)| value)
    }
}

impl<T, D> IntoIterator for DependencySet<T, D>
where
    T: Eq + Hash + Clone,
{
    type Item = T;

    type IntoIter = impl Iterator<Item = T>;

    fn into_iter(self) -> Self::IntoIter {
        self.resolved.into_keys()
    }
}

pub struct DependencyContext {
    pub edges: Edges,
    pub referenced_data_types: DependencyMap<VersionedUri, PersistedDataType, OntologyQueryDepth>,
    pub referenced_property_types:
        DependencyMap<VersionedUri, PersistedPropertyType, OntologyQueryDepth>,
    pub referenced_entity_types:
        DependencyMap<VersionedUri, PersistedEntityType, OntologyQueryDepth>,
    pub linked_entities: DependencyMap<EntityId, PersistedEntity, KnowledgeGraphQueryDepth>,
    pub graph_resolve_depths: GraphResolveDepths,
}

impl DependencyContext {
    #[must_use]
    pub fn new(graph_resolve_depths: GraphResolveDepths) -> Self {
        Self {
            edges: Edges::new(),
            referenced_data_types: DependencyMap::new(),
            referenced_property_types: DependencyMap::new(),
            referenced_entity_types: DependencyMap::new(),
            linked_entities: DependencyMap::new(),
            graph_resolve_depths,
        }
    }

    #[must_use]
    pub fn as_ref_object(&mut self) -> DependencyContextRef {
        DependencyContextRef {
            edges: &mut self.edges,
            referenced_data_types: &mut self.referenced_data_types,
            referenced_property_types: &mut self.referenced_property_types,
            referenced_entity_types: &mut self.referenced_entity_types,
            linked_entities: &mut self.linked_entities,
            graph_resolve_depths: self.graph_resolve_depths,
        }
    }

    #[must_use]
    pub fn into_subgraph(self, roots: HashSet<GraphElementIdentifier>) -> Subgraph {
        let vertices = self
            .referenced_data_types
            .into_values()
            .map(|data_type| {
                (
                    GraphElementIdentifier::OntologyElementId(
                        data_type.metadata().identifier().uri().clone(),
                    ),
                    Vertex::DataType(data_type),
                )
            })
            .chain(
                self.referenced_property_types
                    .into_values()
                    .map(|property_type| {
                        (
                            GraphElementIdentifier::OntologyElementId(
                                property_type.metadata().identifier().uri().clone(),
                            ),
                            Vertex::PropertyType(property_type),
                        )
                    }),
            )
            .chain(
                self.referenced_entity_types
                    .into_values()
                    .map(|entity_type| {
                        (
                            GraphElementIdentifier::OntologyElementId(
                                entity_type.metadata().identifier().uri().clone(),
                            ),
                            Vertex::EntityType(entity_type),
                        )
                    }),
            )
            .chain(self.linked_entities.into_values().map(|entity| {
                (
                    GraphElementIdentifier::KnowledgeGraphElementId(
                        entity.metadata().identifier().base_id(),
                    ),
                    Vertex::Entity(entity),
                )
            }))
            .collect();

        Subgraph {
            roots,
            vertices,
            edges: self.edges,
            depths: self.graph_resolve_depths,
        }
    }
}

pub struct DependencyContextRef<'a> {
    pub edges: &'a mut Edges,
    pub referenced_data_types:
        &'a mut DependencyMap<VersionedUri, PersistedDataType, OntologyQueryDepth>,
    pub referenced_property_types:
        &'a mut DependencyMap<VersionedUri, PersistedPropertyType, OntologyQueryDepth>,
    pub referenced_entity_types:
        &'a mut DependencyMap<VersionedUri, PersistedEntityType, OntologyQueryDepth>,
    pub linked_entities: &'a mut DependencyMap<EntityId, PersistedEntity, KnowledgeGraphQueryDepth>,
    pub graph_resolve_depths: GraphResolveDepths,
}

impl<'a> DependencyContextRef<'a> {
    pub fn change_depth(
        &mut self,
        graph_resolve_depths: GraphResolveDepths,
    ) -> DependencyContextRef<'_>
where {
        DependencyContextRef {
            edges: self.edges,
            referenced_data_types: self.referenced_data_types,
            referenced_property_types: self.referenced_property_types,
            referenced_entity_types: self.referenced_entity_types,
            linked_entities: self.linked_entities,
            graph_resolve_depths,
        }
    }
}

/// A Postgres-backed store
pub struct PostgresStore<C> {
    client: C,
}

/// Describes what context the historic move is done in.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum HistoricMove {
    ForNewVersion,
    ForArchival,
}

impl<C> PostgresStore<C>
where
    C: AsClient,
{
    /// Creates a new `PostgresDatabase` object.
    #[must_use]
    pub const fn new(client: C) -> Self {
        Self { client }
    }

    /// Checks if the specified [`BaseUri`] exists in the database.
    ///
    /// # Errors
    ///
    /// - if checking for the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn contains_base_uri(&self, base_uri: &BaseUri) -> Result<bool, QueryError> {
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                    SELECT EXISTS(
                        SELECT 1
                        FROM base_uris
                        WHERE base_uri = $1
                    );
                "#,
                &[&base_uri.as_str()],
            )
            .await
            .into_report()
            .change_context(QueryError)
            .attach_printable_lazy(|| base_uri.clone())?
            .get(0))
    }

    /// Checks if the specified [`VersionedUri`] exists in the database.
    ///
    /// # Errors
    ///
    /// - if checking for the [`VersionedUri`] failed.
    async fn contains_uri(&self, uri: &VersionedUri) -> Result<bool, QueryError> {
        let version = i64::from(uri.version());
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                    SELECT EXISTS(
                        SELECT 1
                        FROM type_ids
                        WHERE base_uri = $1 AND version = $2
                    );
                "#,
                &[&uri.base_uri().as_str(), &version],
            )
            .await
            .into_report()
            .change_context(QueryError)
            .attach_printable_lazy(|| uri.clone())?
            .get(0))
    }

    /// Inserts the specified [`EntityUuid`] into the database.
    ///
    /// # Errors
    ///
    /// - if inserting the [`EntityUuid`] failed.
    async fn insert_entity_uuid(&self, entity_uuid: EntityUuid) -> Result<(), InsertionError> {
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO entity_uuids (entity_uuid)
                    VALUES ($1)
                    RETURNING entity_uuid;
                "#,
                &[&entity_uuid.as_uuid()],
            )
            .await
            .into_report()
            .change_context(InsertionError)
            .attach_printable(entity_uuid)?;

        Ok(())
    }

    /// Inserts the specified [`VersionedUri`] into the database.
    ///
    /// # Errors
    ///
    /// - if inserting the [`VersionedUri`] failed.
    async fn insert_uri(
        &self,
        uri: &VersionedUri,
        version_id: VersionId,
    ) -> Result<(), InsertionError> {
        let version = i64::from(uri.version());
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO type_ids (base_uri, version, version_id)
                    VALUES ($1, $2, $3)
                    RETURNING version_id;
                "#,
                &[&uri.base_uri().as_str(), &version, &version_id],
            )
            .await
            .into_report()
            .change_context(InsertionError)
            .attach_printable_lazy(|| uri.clone())?;

        Ok(())
    }

    /// Inserts the specified [`BaseUri`] into the database.
    ///
    /// # Errors
    ///
    /// - if inserting the [`BaseUri`] failed.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn insert_base_uri(&self, base_uri: &BaseUri) -> Result<(), InsertionError> {
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO base_uris (base_uri)
                    VALUES ($1)
                    RETURNING base_uri;
                "#,
                &[&base_uri.as_str()],
            )
            .await
            .into_report()
            .change_context(InsertionError)
            .attach_printable_lazy(|| base_uri.clone())?;

        Ok(())
    }

    /// Inserts the specified [`VersionId`] into the database.
    ///
    /// # Errors
    ///
    /// - if inserting the [`VersionId`] failed.
    async fn insert_version_id(&self, version_id: VersionId) -> Result<(), InsertionError> {
        self.as_client()
            .query_one(
                r#"
                    INSERT INTO version_ids (version_id)
                    VALUES ($1)
                    RETURNING version_id;
                "#,
                &[&version_id],
            )
            .await
            .into_report()
            .change_context(InsertionError)
            .attach_printable(version_id)?;

        Ok(())
    }

    /// Inserts the specified [`OntologyDatabaseType`].
    ///
    /// This first extracts the [`BaseUri`] from the [`VersionedUri`] and attempts to insert it into
    /// the database. It will create a new [`VersionId`] for this [`VersionedUri`] and then finally
    /// inserts the entry.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUri`] already exists
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn create<T>(
        &self,
        database_type: T,
        owned_by_id: OwnedById,
        created_by_id: CreatedById,
    ) -> Result<(VersionId, PersistedOntologyMetadata), InsertionError>
    where
        T: OntologyDatabaseType + Send + Sync + Into<serde_json::Value>,
    {
        let uri = database_type.versioned_uri().clone();

        if self
            .contains_base_uri(uri.base_uri())
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(BaseUriAlreadyExists)
                .attach_printable(uri.base_uri().clone())
                .change_context(InsertionError));
        }

        self.insert_base_uri(uri.base_uri()).await?;

        if self
            .contains_uri(&uri)
            .await
            .change_context(InsertionError)?
        {
            return Err(Report::new(InsertionError)
                .attach_printable(VersionedUriAlreadyExists)
                .attach(uri.clone()));
        }

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id).await?;
        self.insert_uri(&uri, version_id).await?;

        self.insert_with_id(
            version_id,
            database_type,
            owned_by_id,
            created_by_id,
            UpdatedById::new(created_by_id.as_account_id()),
        )
        .await?;

        Ok((
            version_id,
            PersistedOntologyMetadata::new(
                PersistedOntologyIdentifier::new(uri, owned_by_id),
                created_by_id,
                UpdatedById::new(created_by_id.as_account_id()),
                None,
            ),
        ))
    }

    /// Updates the specified [`OntologyDatabaseType`].
    ///
    /// First this ensures the [`BaseUri`] of the type already exists. It then creates a
    /// new [`VersionId`] from the contained [`VersionedUri`] and inserts the type.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUri`] does not already exist
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn update<T>(
        &self,
        database_type: T,
        updated_by_id: UpdatedById,
    ) -> Result<(VersionId, PersistedOntologyMetadata), UpdateError>
    where
        T: OntologyDatabaseType
            + Send
            + Sync
            + Into<serde_json::Value>
            + TryFrom<serde_json::Value, Error: Context>,
    {
        let uri = database_type.versioned_uri().clone();

        if !self
            .contains_base_uri(uri.base_uri())
            .await
            .change_context(UpdateError)?
        {
            return Err(Report::new(BaseUriDoesNotExist)
                .attach_printable(uri.base_uri().clone())
                .change_context(UpdateError));
        }

        let base_uri = uri.base_uri();

        // TODO - address potential race condition
        //  https://app.asana.com/0/1202805690238892/1203201674100967/f

        let previous_ontology_type = self
            .read_latest_ontology_type::<T>(base_uri)
            .await
            .change_context(UpdateError)?;

        let OntologyRecord {
            owned_by_id,
            created_by_id,
            ..
        } = previous_ontology_type;

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id)
            .await
            .change_context(UpdateError)?;
        self.insert_uri(&uri, version_id)
            .await
            .change_context(UpdateError)?;
        self.insert_with_id(
            version_id,
            database_type,
            owned_by_id,
            created_by_id,
            updated_by_id,
        )
        .await
        .change_context(UpdateError)?;

        Ok((
            version_id,
            PersistedOntologyMetadata::new(
                PersistedOntologyIdentifier::new(uri, owned_by_id),
                created_by_id,
                updated_by_id,
                None,
            ),
        ))
    }

    /// Inserts an [`OntologyDatabaseType`] identified by [`VersionId`], and associated with an
    /// [`OwnedById`], [`CreatedById`], and [`UpdatedById`], into the database.
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    async fn insert_with_id<T>(
        &self,
        version_id: VersionId,
        database_type: T,
        owned_by_id: OwnedById,
        created_by_id: CreatedById,
        updated_by_id: UpdatedById,
    ) -> Result<(), InsertionError>
    where
        T: OntologyDatabaseType + Send + Sync + Into<serde_json::Value>,
    {
        let value: serde_json::Value = database_type.into();
        // Generally bad practice to construct a query without preparation, but it's not possible to
        // pass a table name as a parameter and `T::table()` is well-defined, so this is a safe
        // usage.
        self.as_client()
            .query_one(
                &format!(
                    r#"
                        INSERT INTO {} (version_id, schema, owned_by_id, created_by_id, updated_by_id)
                        VALUES ($1, $2, $3, $4, $5)
                        RETURNING version_id;
                    "#,
                    T::table()
                ),
                &[&version_id, &value, &owned_by_id.as_account_id(), &created_by_id.as_account_id(), &updated_by_id.as_account_id()],
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn insert_property_type_references(
        &self,
        property_type: &PropertyType,
        version_id: VersionId,
    ) -> Result<(), InsertionError> {
        let property_type_ids = self
            .property_type_reference_ids(property_type.property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            self.as_client().query_one(
                r#"
                        INSERT INTO property_type_property_type_references (source_property_type_version_id, target_property_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_property_type_version_id;
                    "#,
                &[&version_id, &target_id],
            )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        let data_type_ids = self
            .data_type_reference_ids(property_type.data_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced data types")?;

        for target_id in data_type_ids {
            self.as_client().query_one(
                r#"
                        INSERT INTO property_type_data_type_references (source_property_type_version_id, target_data_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_property_type_version_id;
                    "#,
                &[&version_id, &target_id],
            )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    async fn insert_entity_type_references(
        &self,
        entity_type: &EntityType,
        version_id: VersionId,
    ) -> Result<(), InsertionError> {
        let property_type_ids = self
            .property_type_reference_ids(entity_type.property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            self.as_client().query_one(
                r#"
                        INSERT INTO entity_type_property_type_references (source_entity_type_version_id, target_property_type_version_id)
                        VALUES ($1, $2)
                        RETURNING source_entity_type_version_id;
                    "#,
                &[&version_id, &target_id],
            )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        // TODO: should we check that the `link_entity_type_ref` is a link entity type?
        //   see https://app.asana.com/0/1202805690238892/1203277018227719/f
        // TODO: `collect` is not needed but due to a higher-ranked lifetime error, this would fail
        //       otherwise. This is expected to be solved in future Rust versions.
        let entity_type_references = entity_type
            .link_mappings()
            .into_keys()
            .chain(
                entity_type
                    .link_mappings()
                    .into_values()
                    .flatten()
                    .flatten(),
            )
            .chain(entity_type.inherits_from().all_of())
            .collect::<Vec<_>>();

        let entity_type_reference_ids = self
            .entity_type_reference_ids(entity_type_references)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced entity types")?;

        for target_id in entity_type_reference_ids {
            self.as_client()
                .query_one(
                    r#"
                        INSERT INTO entity_type_entity_type_references (
                            source_entity_type_version_id,
                            target_entity_type_version_id
                        )
                        VALUES ($1, $2)
                        RETURNING source_entity_type_version_id;
                    "#,
                    &[&version_id, &target_id],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    // TODO: Tidy these up by having an `Into<VersionedUri>` method or something for the references
    async fn entity_type_reference_ids<'p, I>(
        &self,
        referenced_entity_types: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p EntityTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_entity_types = referenced_entity_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_entity_types.size_hint().0);
        for reference in referenced_entity_types {
            ids.push(self.version_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn property_type_reference_ids<'p, I>(
        &self,
        referenced_property_types: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p PropertyTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_property_types = referenced_property_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_property_types.size_hint().0);
        for reference in referenced_property_types {
            ids.push(self.version_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn data_type_reference_ids<'p, I>(
        &self,
        referenced_data_types: I,
    ) -> Result<Vec<VersionId>, QueryError>
    where
        I: IntoIterator<Item = &'p DataTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_data_types = referenced_data_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_data_types.size_hint().0);
        for reference in referenced_data_types {
            ids.push(self.version_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    async fn insert_entity(
        &self,
        entity_id: EntityId,
        entity: Entity,
        entity_type_id: VersionedUri,
        created_by_id: CreatedById,
        updated_by_id: UpdatedById,
        link_metadata: Option<LinkEntityMetadata>,
    ) -> Result<PersistedEntityMetadata, InsertionError> {
        let entity_type_version_id = self
            .version_id_by_uri(&entity_type_id)
            .await
            .change_context(InsertionError)?;

        // TODO: Validate entity against entity type
        //  https://app.asana.com/0/0/1202629282579257/f

        let value = serde_json::to_value(entity)
            .into_report()
            .change_context(InsertionError)?;
        let version = self
            .as_client()
            .query_one(
                r#"
                INSERT INTO latest_entities (
                    owned_by_id, entity_uuid, version,
                    entity_type_version_id,
                    properties,
                    left_owned_by_id, left_entity_uuid,
                    right_owned_by_id, right_entity_uuid,
                    left_order, right_order,
                    created_by_id, updated_by_id
                )
                VALUES ($1, $2, clock_timestamp(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING version;
                "#,
                &[
                    &entity_id.owned_by_id().as_account_id(),
                    &entity_id.entity_uuid().as_uuid(),
                    &entity_type_version_id,
                    &value,
                    &link_metadata
                        .as_ref()
                        .map(|metadata| metadata.left_entity_id().owned_by_id().as_account_id()),
                    &link_metadata
                        .as_ref()
                        .map(|metadata| metadata.left_entity_id().entity_uuid().as_uuid()),
                    &link_metadata
                        .as_ref()
                        .map(|metadata| metadata.right_entity_id().owned_by_id().as_account_id()),
                    &link_metadata
                        .as_ref()
                        .map(|metadata| metadata.right_entity_id().entity_uuid().as_uuid()),
                    &link_metadata.as_ref().map(LinkEntityMetadata::left_order),
                    &link_metadata.as_ref().map(LinkEntityMetadata::right_order),
                    &created_by_id.as_account_id(),
                    &updated_by_id.as_account_id(),
                ],
            )
            .await
            .into_report()
            .change_context(InsertionError)?
            .get(0);

        Ok(PersistedEntityMetadata::new(
            EntityEditionId::new(entity_id, version),
            entity_type_id,
            created_by_id,
            updated_by_id,
            link_metadata,
            // TODO: only the historic table would have an `archived` field.
            //   Consider what we should do about that.
            false,
        ))
    }

    async fn lock_latest_entity_for_update(&self, entity_id: EntityId) -> Result<(), QueryError> {
        // TODO - address potential serializability issue.
        //   We don't have a data race per se, but the transaction isolation level of postgres would
        //   make new entries of the `entities` table inaccessible to peer lock-waiters.
        //   https://www.postgresql.org/docs/9.2/transaction-iso.html#XACT-READ-COMMITTED
        //   https://app.asana.com/0/1202805690238892/1203201674100967/f

        self.as_client()
            .query_one(
                // TODO: consider if this row locking is problematic with Citus.
                //   `FOR UPDATE` is only allowed in single-shard queries.
                //   https://docs.citusdata.com/en/stable/develop/reference_workarounds.html#sql-support-and-workarounds
                //   see: https://app.asana.com/0/0/1203284257408542/f
                r#"
                SELECT * FROM latest_entities
                WHERE entity_uuid = $1 AND owned_by_id = $2
                FOR UPDATE;
                "#,
                &[
                    &entity_id.entity_uuid().as_uuid(),
                    &entity_id.owned_by_id().as_account_id(),
                ],
            )
            .await
            .into_report()
            .change_context(QueryError)?;

        Ok(())
    }

    async fn move_latest_entity_to_histories(
        &self,
        entity_id: EntityId,
        historic_move: HistoricMove,
    ) -> Result<PersistedEntityMetadata, InsertionError> {
        let historic_entity = self
            .as_client()
            .query_one(
                r#"
                -- First we delete the _latest_ entity from the entities table.
                WITH to_move_to_historic AS (
                    DELETE FROM latest_entities
                    WHERE entity_uuid = $1 AND owned_by_id = $2
                    RETURNING
                        owned_by_id, entity_uuid, version,
                        entity_type_version_id,
                        properties,
                        left_owned_by_id, left_entity_uuid,
                        right_owned_by_id, right_entity_uuid,
                        left_order, right_order,
                        created_by_id, updated_by_id
                ),
                inserted_in_historic AS (
                    -- We immediately put this deleted entity into the historic table.
                    -- As this should be done in a transaction, we should be safe that this move
                    -- doesn't produce invalid state.
                    INSERT INTO entity_histories(
                        owned_by_id, entity_uuid, version,
                        entity_type_version_id,
                        properties,
                        left_owned_by_id, left_entity_uuid,
                        right_owned_by_id, right_entity_uuid,
                        left_order, right_order,
                        created_by_id, updated_by_id,
                        archived
                    )
                    SELECT
                        owned_by_id, entity_uuid, version,
                        entity_type_version_id,
                        properties,
                        left_owned_by_id, left_entity_uuid,
                        right_owned_by_id, right_entity_uuid,
                        left_order, right_order,
                        created_by_id, updated_by_id,
                        $3::boolean
                    FROM to_move_to_historic
                    -- We only return metadata
                    RETURNING
                        owned_by_id, entity_uuid, version,
                        entity_type_version_id,
                        left_owned_by_id, left_entity_uuid,
                        right_owned_by_id, right_entity_uuid,
                        left_order, right_order,
                        created_by_id, updated_by_id
                )
                SELECT
                    owned_by_id, entity_uuid, inserted_in_historic.version,
                    base_uri, type_ids.version,
                    left_owned_by_id, left_entity_uuid,
                    right_owned_by_id, right_entity_uuid,
                    left_order, right_order,
                    created_by_id, updated_by_id
                FROM inserted_in_historic
                INNER JOIN type_ids ON inserted_in_historic.entity_type_version_id = type_ids.version_id;
                "#,
                &[
                    &entity_id.entity_uuid().as_uuid(),
                    &entity_id.owned_by_id().as_account_id(),
                    &(historic_move == HistoricMove::ForArchival),
                ],
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        let link_metadata = match (
            historic_entity.get(5),
            historic_entity.get(6),
            historic_entity.get(7),
            historic_entity.get(8),
            historic_entity.get(9),
            historic_entity.get(10),
        ) {
            (
                Some(left_owned_by_id),
                Some(left_entity_uuid),
                Some(right_owned_by_id),
                Some(right_entity_uuid),
                left_order,
                right_order,
            ) => Some(LinkEntityMetadata::new(
                EntityId::new(
                    OwnedById::new(left_owned_by_id),
                    EntityUuid::new(left_entity_uuid),
                ),
                EntityId::new(
                    OwnedById::new(right_owned_by_id),
                    EntityUuid::new(right_entity_uuid),
                ),
                left_order,
                right_order,
            )),
            (None, None, None, None, None, None) => None,
            _ => {
                unreachable!("incomplete link information was found in the DB table, this is fatal")
            }
        };

        let base_uri = BaseUri::new(historic_entity.get(3))
            .into_report()
            .change_context(InsertionError)?;
        let entity_type_id = VersionedUri::new(base_uri, historic_entity.get::<_, i64>(4) as u32);

        Ok(PersistedEntityMetadata::new(
            EntityEditionId::new(
                EntityId::new(
                    OwnedById::new(historic_entity.get(0)),
                    EntityUuid::new(historic_entity.get(1)),
                ),
                historic_entity.get(2),
            ),
            entity_type_id,
            CreatedById::new(historic_entity.get(11)),
            UpdatedById::new(historic_entity.get(12)),
            link_metadata,
            // TODO: only the historic table would have an `archived` field.
            //   Consider what we should do about that.
            false,
        ))
    }

    /// Fetches the [`VersionId`] of the specified [`VersionedUri`].
    ///
    /// # Errors:
    ///
    /// - if the entry referred to by `uri` does not exist.
    async fn version_id_by_uri(&self, uri: &VersionedUri) -> Result<VersionId, QueryError> {
        let version = i64::from(uri.version());
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                SELECT version_id
                FROM type_ids
                WHERE base_uri = $1 AND version = $2;
                "#,
                &[&uri.base_uri().as_str(), &version],
            )
            .await
            .into_report()
            .change_context(QueryError)
            .attach_printable_lazy(|| uri.clone())?
            .get(0))
    }

    /// TODO - DOC
    #[expect(clippy::missing_const_for_fn, reason = "Compile error")]
    pub fn into_client(self) -> C {
        self.client
    }
}

impl PostgresStore<Transaction<'_>> {
    #[doc(hidden)]
    #[cfg(feature = "__internal_bench")]
    async fn insert_entity_uuids(
        &self,
        entity_uuids: impl IntoIterator<Item = EntityUuid, IntoIter: Send> + Send,
    ) -> Result<u64, InsertionError> {
        let sink = self
            .client
            .copy_in("COPY entity_uuids (entity_uuid) FROM STDIN BINARY")
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[Type::UUID]);

        futures::pin_mut!(writer);
        for entity_uuid in entity_uuids {
            writer
                .as_mut()
                .write(&[&entity_uuid.as_uuid()])
                .await
                .into_report()
                .change_context(InsertionError)
                .attach_printable(entity_uuid)?;
        }

        writer
            .finish()
            .await
            .into_report()
            .change_context(InsertionError)
    }

    #[doc(hidden)]
    #[cfg(feature = "__internal_bench")]
    async fn insert_entity_batch_by_type(
        &self,
        entity_uuids: impl IntoIterator<Item = EntityUuid, IntoIter: Send> + Send,
        entities: impl IntoIterator<Item = Entity, IntoIter: Send> + Send,
        entity_type_version_id: VersionId,
        owned_by_id: OwnedById,
        created_by: CreatedById,
        updated_by_id: UpdatedById,
    ) -> Result<u64, InsertionError> {
        let sink = self
            .client
            .copy_in(
                "COPY entities (entity_uuid, entity_type_version_id, properties, owned_by_id, \
                 updated_by_id, created_by_id) FROM STDIN BINARY",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[
            Type::UUID,
            Type::UUID,
            Type::JSONB,
            Type::UUID,
            Type::UUID,
            Type::UUID,
        ]);
        futures::pin_mut!(writer);
        for (entity_uuid, entity) in entity_uuids.into_iter().zip(entities) {
            let value = serde_json::to_value(entity)
                .into_report()
                .change_context(InsertionError)?;
            writer
                .as_mut()
                .write(&[
                    &entity_uuid.as_uuid(),
                    &entity_type_version_id,
                    &value,
                    &owned_by_id.as_account_id(),
                    &created_by.as_account_id(),
                    &updated_by_id.as_account_id(),
                ])
                .await
                .into_report()
                .change_context(InsertionError)
                .attach_printable(entity_uuid)?;
        }

        writer
            .finish()
            .await
            .into_report()
            .change_context(InsertionError)
    }
}

#[async_trait]
impl<C: AsClient> AccountStore for PostgresStore<C> {
    async fn insert_account_id(&mut self, account_id: AccountId) -> Result<(), InsertionError> {
        self.as_client()
            .query_one(
                r#"
                INSERT INTO accounts (account_id)
                VALUES ($1)
                RETURNING account_id;
                "#,
                &[&account_id],
            )
            .await
            .into_report()
            .change_context(InsertionError)
            .attach_printable(account_id)?;

        Ok(())
    }
}
