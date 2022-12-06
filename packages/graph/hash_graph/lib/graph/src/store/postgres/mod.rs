mod knowledge;
mod ontology;

mod context;
mod pool;
mod query;
mod version_id;

use std::{
    collections::{hash_map::RawEntryMut, HashMap},
    fmt::Debug,
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

use self::context::OntologyRecord;
pub use self::pool::{AsClient, PostgresStorePool};
use crate::{
    identifier::{
        account::AccountId,
        knowledge::{EntityEditionId, EntityId},
        ontology::OntologyTypeEditionId,
    },
    knowledge::{EntityMetadata, EntityProperties, EntityUuid, LinkData},
    ontology::OntologyElementMetadata,
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        error::VersionedUriAlreadyExists,
        postgres::{
            context::PostgresContext, ontology::OntologyDatabaseType, version_id::VersionId,
        },
        AccountStore, BaseUriAlreadyExists, BaseUriDoesNotExist, InsertionError, QueryError,
        UpdateError,
    },
    subgraph::edges::GraphResolveDepths,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum DependencyStatus {
    Unresolved,
    Resolved,
}

pub struct DependencyMap<K> {
    resolved: HashMap<K, GraphResolveDepths>,
}

impl<K> Default for DependencyMap<K> {
    fn default() -> Self {
        Self {
            resolved: HashMap::default(),
        }
    }
}

impl<K> DependencyMap<K>
where
    K: Eq + Hash + Clone,
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
    pub fn insert(
        &mut self,
        identifier: &K,
        resolved_depth: GraphResolveDepths,
    ) -> DependencyStatus {
        match self.resolved.raw_entry_mut().from_key(identifier) {
            RawEntryMut::Vacant(entry) => {
                entry.insert(identifier.clone(), resolved_depth);
                DependencyStatus::Unresolved
            }
            RawEntryMut::Occupied(entry) => {
                if entry.into_mut().update(resolved_depth) {
                    DependencyStatus::Unresolved
                } else {
                    DependencyStatus::Resolved
                }
            }
        }
    }
}

#[derive(Default)]
pub struct DependencyContext {
    pub ontology_dependency_map: DependencyMap<OntologyTypeEditionId>,
    pub knowledge_dependency_map: DependencyMap<EntityEditionId>,
}

/// A Postgres-backed store
pub struct PostgresStore<C> {
    client: C,
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
        updated_by_id: UpdatedById,
    ) -> Result<(VersionId, OntologyElementMetadata), InsertionError>
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

        self.insert_with_id(version_id, database_type, owned_by_id, updated_by_id)
            .await?;

        Ok((
            version_id,
            OntologyElementMetadata::new(
                OntologyTypeEditionId::from(&uri),
                ProvenanceMetadata::new(updated_by_id),
                owned_by_id,
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
    ) -> Result<(VersionId, OntologyElementMetadata), UpdateError>
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

        let OntologyRecord { owned_by_id, .. } = previous_ontology_type;

        let version_id = VersionId::new(Uuid::new_v4());
        self.insert_version_id(version_id)
            .await
            .change_context(UpdateError)?;
        self.insert_uri(&uri, version_id)
            .await
            .change_context(UpdateError)?;
        self.insert_with_id(version_id, database_type, owned_by_id, updated_by_id)
            .await
            .change_context(UpdateError)?;

        Ok((
            version_id,
            OntologyElementMetadata::new(
                OntologyTypeEditionId::from(&uri),
                ProvenanceMetadata::new(updated_by_id),
                owned_by_id,
            ),
        ))
    }

    /// Inserts an [`OntologyDatabaseType`] identified by [`VersionId`], and associated with an
    /// [`OwnedById`] and [`UpdatedById`], into the database.
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    async fn insert_with_id<T>(
        &self,
        version_id: VersionId,
        database_type: T,
        owned_by_id: OwnedById,
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
                        INSERT INTO {} (version_id, schema, owned_by_id, updated_by_id)
                        VALUES ($1, $2, $3, $4)
                        RETURNING version_id;
                    "#,
                    T::table()
                ),
                &[
                    &version_id,
                    &value,
                    &owned_by_id.as_account_id(),
                    &updated_by_id.as_account_id(),
                ],
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
        entities: impl IntoIterator<Item = EntityProperties, IntoIter: Send> + Send,
        link_datas: impl IntoIterator<Item = Option<LinkData>, IntoIter: Send> + Send,
        entity_type_version_id: VersionId,
        owned_by_id: OwnedById,
        updated_by_id: UpdatedById,
    ) -> Result<u64, InsertionError> {
        let sink = self
            .client
            .copy_in(
                "COPY latest_entities (entity_uuid, entity_type_version_id, properties, \
                 owned_by_id, updated_by_id, left_owned_by_id, left_entity_uuid, \
                 right_owned_by_id, right_entity_uuid, left_to_right_order, right_to_left_order) \
                 FROM STDIN BINARY",
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
            Type::UUID,
            Type::UUID,
            Type::UUID,
            Type::INT4,
            Type::INT4,
        ]);
        futures::pin_mut!(writer);
        for ((entity_uuid, entity), link_data) in
            entity_uuids.into_iter().zip(entities).zip(link_datas)
        {
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
                    &updated_by_id.as_account_id(),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.left_entity_id().owned_by_id().as_account_id()),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.left_entity_id().entity_uuid().as_uuid()),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.right_entity_id().owned_by_id().as_account_id()),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.right_entity_id().entity_uuid().as_uuid()),
                    &link_data.as_ref().and_then(LinkData::left_to_right_order),
                    &link_data.as_ref().and_then(LinkData::right_to_left_order),
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
