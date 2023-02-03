mod knowledge;
mod ontology;

mod migration;
mod pool;
mod query;

use std::{
    collections::{hash_map::RawEntryMut, HashMap},
    fmt::Debug,
    hash::Hash,
};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use interval_ops::Interval;
#[cfg(feature = "__internal_bench")]
use tokio_postgres::{binary_copy::BinaryCopyInWriter, types::Type};
use tokio_postgres::{error::SqlState, GenericClient};
use type_system::{
    uri::VersionedUri, DataTypeReference, EntityType, EntityTypeReference, PropertyType,
    PropertyTypeReference,
};

pub use self::pool::{AsClient, PostgresStorePool};
use crate::{
    identifier::{
        account::AccountId,
        ontology::OntologyTypeEditionId,
        time::{ProjectedTime, TimeInterval},
        EntityVertexId,
    },
    ontology::OntologyElementMetadata,
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        error::{VersionedUriAlreadyExists, WrongOntologyVersion},
        postgres::ontology::{OntologyDatabaseType, OntologyId},
        AccountStore, BaseUriAlreadyExists, BaseUriDoesNotExist, InsertionError, QueryError, Store,
        StoreError, Transaction, UpdateError,
    },
    subgraph::edges::GraphResolveDepths,
};
#[cfg(feature = "__internal_bench")]
use crate::{
    identifier::{
        knowledge::{EntityId, EntityRecordId, EntityVersion},
        time::{DecisionTime, Timestamp, VersionInterval},
    },
    knowledge::{EntityProperties, LinkOrder},
};

/// Status of a traversal of the graph.
///
/// This is used to determine whether a traversal should continue or stop. If a traversal is
/// resolved for a sufficient depths and a large enough interval, [`DependencyStatus::Resolved`]
/// will be returned from [`DependencyMap::update`], otherwise [`DependencyStatus::Unresolved`] will
/// be returned with the [`GraphResolveDepths`] and [`TimeInterval`] that the traversal should
/// continue with.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DependencyStatus {
    Unresolved(GraphResolveDepths, TimeInterval<ProjectedTime>),
    Resolved,
}

pub struct DependencyMap<K> {
    resolved: HashMap<K, (GraphResolveDepths, TimeInterval<ProjectedTime>)>,
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
    K: Eq + Hash + Clone + Debug,
{
    /// Inserts a dependency into the map.
    ///
    /// If the dependency does not already exist in the dependency map, it will be inserted with the
    /// provided `new_resolve_depth` and `new_interval`. If the dependency was already resolved it
    /// is checked whether the new resolve depth and interval are more general than the existing
    /// resolve depth and interval. If they are, the existing resolve depth and interval are updated
    /// to cover the new resolve depth and interval.
    ///
    /// If the traversed entry has to be resolved further, [`DependencyStatus::Unresolved`] is
    /// returned with the new resolve depth and interval that the traversal should continue with.
    pub fn update(
        &mut self,
        identifier: &K,
        new_resolve_depth: GraphResolveDepths,
        new_interval: TimeInterval<ProjectedTime>,
    ) -> DependencyStatus {
        match self.resolved.raw_entry_mut().from_key(identifier) {
            RawEntryMut::Vacant(entry) => {
                entry.insert(
                    identifier.clone(),
                    (new_resolve_depth, new_interval.clone()),
                );
                DependencyStatus::Unresolved(new_resolve_depth, new_interval)
            }
            RawEntryMut::Occupied(entry) => {
                let (current_depths, current_interval) = entry.into_mut();
                let old_interval = current_interval.clone();

                // Ideally, we want to use a `union` here instead, as we only want to resolve
                // elements contained in either sets of intervals. However, the current
                // implementation doesn't have the necessary support to handle a bigger set of
                // multiple intervals so we use a `merge` instead to make sure we're covering
                // _at least_ the intervals requested. This does imply that in some cases the
                // subgraph will contain more information than requested, where we'll also be
                // querying the space between the two intervals when they're not adjacent or
                // overlapping.
                *current_interval = current_interval.clone().merge(new_interval.clone());

                if current_depths.update(new_resolve_depth) {
                    // We currently don't have a way to store different resolve depths for different
                    // intervals for the same identifier. For simplicity, we require to resolve the
                    // full interval with the updated resolve depths.
                    DependencyStatus::Unresolved(*current_depths, current_interval.clone())
                } else if old_interval.contains_interval(&new_interval) {
                    // The dependency is already resolved for the required interval
                    // old: [-----)
                    // new:  [---)
                    DependencyStatus::Resolved
                } else if new_interval.contains_interval(&old_interval)
                    || new_interval.is_adjacent_to(&old_interval)
                {
                    // The dependency is already resolved, but not for the required interval. If the
                    // old interval is contained in the new interval, this means, that a portion of
                    // the new interval has already been resolved, but not all of it. Ideally we
                    // only want to resolve the difference of `new - old`, but we don't have a way
                    // to store different resolve depths for different intervals for the same
                    // identifier. For simplicity, we require to resolve the full interval.
                    //
                    //         |  contains   |  adjacent
                    // old     |    [---)    | [---)
                    // new     | [---------) |     [---)
                    // ========|=============|===========
                    // optimal | [--)   [--) |     [---)
                    // current | [---------) |     [---)
                    DependencyStatus::Unresolved(*current_depths, new_interval)
                } else if old_interval.overlaps(&new_interval) {
                    // This is a similar case to the above, but as the old interval is not contained
                    // in the new interval, we can resolve the difference of `new - old`.
                    // old:     [-----)
                    // new:       [-------)
                    // resolve:       [---)
                    let difference = new_interval.difference(old_interval);
                    // The intervals do overlap and the current interval is not a subset of
                    // the required interval, so the difference must be a single interval
                    debug_assert_eq!(difference.len(), 1, "difference must be a single interval");

                    DependencyStatus::Unresolved(
                        *current_depths,
                        difference
                            .into_iter()
                            .next()
                            .expect("difference must be a single interval"),
                    )
                } else {
                    // The time intervals are disjoint and not adjacent. Ideally, we only would
                    // resolve the new interval, but we did not come up with a good way to store the
                    // different intervals in the dependency map. So we resolve the full interval
                    // for now.
                    //
                    // We only require this logic when traversing edges of the graph, so the roots
                    // of the graph are always precisely resolved correctly. By this implementation,
                    // we may get more dependencies resolved than necessary, which will appear as
                    // vertices/edges in the subgraph. until we have decided, if we consider this a
                    // bug or not, we keep the current behavior
                    // see https://app.asana.com/0/0/1203774687353264/f.
                    //
                    // Ideally, we want to track this occurrence in production, but utilizing our
                    // current logging strategy does not work well as we would have to log with a
                    // high severity. see https://app.asana.com/0/0/1203774687353266/f
                    //
                    // However, we only have to resolve the difference of the merge of the two, as
                    // the old interval is already resolved. and the intervals are disjoint:
                    // Examples |      1      |      B
                    // =========|=============|=============
                    // old      | [---)       |       [---)
                    // new      |       [---) | [---)
                    // ---------|-------------|-------------
                    // optimal  |       [---) | [---)
                    // current  |     [-----) | [-----)
                    let difference = old_interval
                        .clone()
                        .merge(new_interval)
                        .difference(old_interval);
                    debug_assert_eq!(difference.len(), 1, "difference must be a single interval");

                    DependencyStatus::Unresolved(
                        *current_depths,
                        difference
                            .into_iter()
                            .next()
                            .expect("difference must be a single interval"),
                    )
                }
            }
        }
    }
}

#[derive(Default)]
pub struct DependencyContext {
    pub ontology_dependency_map: DependencyMap<OntologyTypeEditionId>,
    pub knowledge_dependency_map: DependencyMap<EntityVertexId>,
}

/// A Postgres-backed store
pub struct PostgresStore<C> {
    client: C,
}

#[async_trait]
impl<C: AsClient> Store for PostgresStore<C> {
    type Transaction<'t>
    where
        C: 't,
    = PostgresStore<tokio_postgres::Transaction<'t>>;

    async fn transaction(&mut self) -> Result<Self::Transaction<'_>, StoreError> {
        Ok(PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(StoreError)?,
        ))
    }
}

#[async_trait]
impl Transaction for PostgresStore<tokio_postgres::Transaction<'_>> {
    async fn commit(self) -> Result<(), StoreError> {
        self.client
            .commit()
            .await
            .into_report()
            .change_context(StoreError)
    }

    async fn rollback(self) -> Result<(), StoreError> {
        self.client
            .rollback()
            .await
            .into_report()
            .change_context(StoreError)
    }
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

    /// Creates a new [`OntologyId`] from the provided [`VersionedUri`].
    ///
    /// # Errors
    ///
    /// - if [`VersionedUri::base_uri`] did already exist in the database
    #[tracing::instrument(level = "debug", skip(self))]
    async fn create_owned_ontology_id(
        &self,
        uri: &VersionedUri,
        owned_by_id: OwnedById,
        updated_by_id: UpdatedById,
    ) -> Result<OntologyId, InsertionError> {
        self.as_client()
            .query_one(
                r#"
                SELECT
                    ontology_id
                FROM create_owned_ontology_id(
                    base_uri := $1,
                    version := $2,
                    owned_by_id := $3,
                    record_created_by_id := $4
                );"#,
                &[
                    &uri.base_uri().as_str(),
                    &i64::from(uri.version()),
                    &owned_by_id,
                    &updated_by_id,
                ],
            )
            .await
            .into_report()
            .map(|row| row.get(0))
            .map_err(|report| match report.current_context().code() {
                Some(&SqlState::EXCLUSION_VIOLATION | &SqlState::UNIQUE_VIOLATION) => report
                    .change_context(BaseUriAlreadyExists)
                    .attach_printable(uri.base_uri().clone())
                    .change_context(InsertionError),
                _ => report
                    .change_context(InsertionError)
                    .attach_printable(uri.clone()),
            })
    }

    /// Updates the latest version of [`VersionedUri::base_uri`] and creates a new [`OntologyId`]
    /// for it.
    ///
    /// # Errors
    ///
    /// - if [`VersionedUri::base_uri`] did not already exist in the database
    /// - if [`VersionedUri`] did already exist in the database
    #[tracing::instrument(level = "debug", skip(self))]
    async fn update_owned_ontology_id(
        &self,
        uri: &VersionedUri,
        updated_by_id: UpdatedById,
    ) -> Result<(OntologyId, OwnedById), UpdateError> {
        let row = self
            .as_client()
            .query_one(
                r#"
                SELECT
                    ontology_id,
                    owned_by_id
                FROM update_owned_ontology_id(
                    base_uri := $1,
                    version := $2,
                    record_created_by_id := $3
                );"#,
                &[
                    &uri.base_uri().as_str(),
                    &i64::from(uri.version()),
                    &updated_by_id,
                ],
            )
            .await
            .into_report()
            .map_err(|report| match report.current_context().code() {
                Some(&SqlState::UNIQUE_VIOLATION) => report
                    .change_context(VersionedUriAlreadyExists)
                    .attach_printable(uri.clone())
                    .change_context(UpdateError),
                Some(&SqlState::INVALID_PARAMETER_VALUE) => report
                    .change_context(WrongOntologyVersion)
                    .attach_printable(uri.clone())
                    .change_context(UpdateError),
                Some(&SqlState::RESTRICT_VIOLATION) => report
                    .change_context(BaseUriDoesNotExist)
                    .attach_printable(uri.base_uri().clone())
                    .change_context(UpdateError),
                _ => report
                    .change_context(UpdateError)
                    .attach_printable(uri.clone()),
            })?;

        Ok((row.get(0), OwnedById::new(row.get(1))))
    }

    /// Inserts the specified [`OntologyDatabaseType`].
    ///
    /// This first extracts the [`BaseUri`] from the [`VersionedUri`] and attempts to insert it into
    /// the database. It will create a new [`OntologyId`] for this [`VersionedUri`] and then finally
    /// inserts the entry.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUri`] already exists
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    #[tracing::instrument(level = "info", skip(self, database_type))]
    async fn create<T>(
        &self,
        database_type: T,
        owned_by_id: OwnedById,
        updated_by_id: UpdatedById,
    ) -> Result<(OntologyId, OntologyElementMetadata), InsertionError>
    where
        T: OntologyDatabaseType,
    {
        let uri = database_type.id().clone();

        let ontology_id = self
            .create_owned_ontology_id(&uri, owned_by_id, updated_by_id)
            .await?;

        self.insert_with_id(ontology_id, database_type).await?;

        Ok((
            ontology_id,
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
    /// new [`OntologyId`] from the contained [`VersionedUri`] and inserts the type.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUri`] does not already exist
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    #[tracing::instrument(level = "info", skip(self, database_type))]
    async fn update<T>(
        &self,
        database_type: T,
        updated_by_id: UpdatedById,
    ) -> Result<(OntologyId, OntologyElementMetadata), UpdateError>
    where
        T: OntologyDatabaseType,
    {
        let uri = database_type.id();
        let edition_id = OntologyTypeEditionId::from(uri);

        let (ontology_id, owned_by_id) = self
            .update_owned_ontology_id(uri, updated_by_id)
            .await
            .change_context(UpdateError)?;
        self.insert_with_id(ontology_id, database_type)
            .await
            .change_context(UpdateError)?;

        Ok((
            ontology_id,
            OntologyElementMetadata::new(
                edition_id,
                ProvenanceMetadata::new(updated_by_id),
                owned_by_id,
            ),
        ))
    }

    /// Inserts an [`OntologyDatabaseType`] identified by [`OntologyId`], and associated with an
    /// [`OwnedById`] and [`UpdatedById`], into the database.
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    #[tracing::instrument(level = "debug", skip(self, database_type))]
    async fn insert_with_id<T>(
        &self,
        ontology_id: OntologyId,
        database_type: T,
    ) -> Result<(), InsertionError>
    where
        T: OntologyDatabaseType,
    {
        let value_repr = T::Representation::from(database_type);
        let value = serde_json::to_value(value_repr)
            .into_report()
            .change_context(InsertionError)?;
        // Generally bad practice to construct a query without preparation, but it's not possible to
        // pass a table name as a parameter and `T::table()` is well-defined, so this is a safe
        // usage.
        self.as_client()
            .query_one(
                &format!(
                    r#"
                        INSERT INTO {} (ontology_id, schema)
                        VALUES ($1, $2)
                        RETURNING ontology_id;
                    "#,
                    T::table()
                ),
                &[&ontology_id, &value],
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
    }

    #[tracing::instrument(level = "debug", skip(self, property_type))]
    async fn insert_property_type_references(
        &self,
        property_type: &PropertyType,
        ontology_id: OntologyId,
    ) -> Result<(), InsertionError> {
        let property_type_ids = self
            .property_type_reference_ids(property_type.property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            self.as_client().query_one(
                r#"
                        INSERT INTO property_type_property_type_references (source_property_type_ontology_id, target_property_type_ontology_id)
                        VALUES ($1, $2)
                        RETURNING source_property_type_ontology_id;
                    "#,
                &[&ontology_id, &target_id],
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
                        INSERT INTO property_type_data_type_references (source_property_type_ontology_id, target_data_type_ontology_id)
                        VALUES ($1, $2)
                        RETURNING source_property_type_ontology_id;
                    "#,
                &[&ontology_id, &target_id],
            )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    #[tracing::instrument(level = "debug", skip(self, entity_type))]
    async fn insert_entity_type_references(
        &self,
        entity_type: &EntityType,
        ontology_id: OntologyId,
    ) -> Result<(), InsertionError> {
        let property_type_ids = self
            .property_type_reference_ids(entity_type.property_type_references())
            .await
            .change_context(InsertionError)
            .attach_printable("Could not find referenced property types")?;

        for target_id in property_type_ids {
            self.as_client().query_one(
                r#"
                        INSERT INTO entity_type_property_type_references (source_entity_type_ontology_id, target_property_type_ontology_id)
                        VALUES ($1, $2)
                        RETURNING source_entity_type_ontology_id;
                    "#,
                &[&ontology_id, &target_id],
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
                            source_entity_type_ontology_id,
                            target_entity_type_ontology_id
                        )
                        VALUES ($1, $2)
                        RETURNING source_entity_type_ontology_id;
                    "#,
                    &[&ontology_id, &target_id],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    // TODO: Tidy these up by having an `Into<VersionedUri>` method or something for the references
    #[tracing::instrument(level = "debug", skip(self, referenced_entity_types))]
    async fn entity_type_reference_ids<'p, I>(
        &self,
        referenced_entity_types: I,
    ) -> Result<Vec<OntologyId>, QueryError>
    where
        I: IntoIterator<Item = &'p EntityTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_entity_types = referenced_entity_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_entity_types.size_hint().0);
        for reference in referenced_entity_types {
            ids.push(self.ontology_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    #[tracing::instrument(level = "debug", skip(self, referenced_property_types))]
    async fn property_type_reference_ids<'p, I>(
        &self,
        referenced_property_types: I,
    ) -> Result<Vec<OntologyId>, QueryError>
    where
        I: IntoIterator<Item = &'p PropertyTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_property_types = referenced_property_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_property_types.size_hint().0);
        for reference in referenced_property_types {
            ids.push(self.ontology_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    #[tracing::instrument(level = "debug", skip(self, referenced_data_types))]
    async fn data_type_reference_ids<'p, I>(
        &self,
        referenced_data_types: I,
    ) -> Result<Vec<OntologyId>, QueryError>
    where
        I: IntoIterator<Item = &'p DataTypeReference> + Send,
        I::IntoIter: Send,
    {
        let referenced_data_types = referenced_data_types.into_iter();
        let mut ids = Vec::with_capacity(referenced_data_types.size_hint().0);
        for reference in referenced_data_types {
            ids.push(self.ontology_id_by_uri(reference.uri()).await?);
        }
        Ok(ids)
    }

    /// Fetches the [`OntologyId`] of the specified [`VersionedUri`].
    ///
    /// # Errors:
    ///
    /// - if the entry referred to by `uri` does not exist.
    #[tracing::instrument(level = "debug", skip(self))]
    async fn ontology_id_by_uri(&self, uri: &VersionedUri) -> Result<OntologyId, QueryError> {
        let version = i64::from(uri.version());
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                SELECT ontology_id
                FROM ontology_ids
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
}

impl PostgresStore<tokio_postgres::Transaction<'_>> {
    #[doc(hidden)]
    #[cfg(feature = "__internal_bench")]
    async fn insert_entity_ids(
        &self,
        entity_uuids: impl IntoIterator<
            Item = (EntityId, Option<EntityId>, Option<EntityId>),
            IntoIter: Send,
        > + Send,
    ) -> Result<u64, InsertionError> {
        let sink = self
            .client
            .copy_in(
                "COPY entity_ids (
                    owned_by_id,
                    entity_uuid,
                    left_owned_by_id,
                    left_entity_uuid,
                    right_owned_by_id,
                    right_entity_uuid
                ) FROM STDIN BINARY",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[
            Type::UUID,
            Type::UUID,
            Type::UUID,
            Type::UUID,
            Type::UUID,
            Type::UUID,
        ]);

        futures::pin_mut!(writer);
        for (entity_id, left_entity_id, right_entity_id) in entity_uuids {
            writer
                .as_mut()
                .write(&[
                    &entity_id.owned_by_id(),
                    &entity_id.entity_uuid(),
                    &left_entity_id.as_ref().map(EntityId::owned_by_id),
                    &left_entity_id.as_ref().map(EntityId::entity_uuid),
                    &right_entity_id.as_ref().map(EntityId::owned_by_id),
                    &right_entity_id.as_ref().map(EntityId::entity_uuid),
                ])
                .await
                .into_report()
                .change_context(InsertionError)
                .attach_printable(entity_id.entity_uuid())?;
        }

        writer
            .finish()
            .await
            .into_report()
            .change_context(InsertionError)
    }

    #[doc(hidden)]
    #[cfg(feature = "__internal_bench")]
    async fn insert_entity_records(
        &self,
        entities: impl IntoIterator<
            Item = (EntityProperties, Option<LinkOrder>, Option<LinkOrder>),
            IntoIter: Send,
        > + Send,
        entity_type_ontology_id: OntologyId,
        actor_id: UpdatedById,
    ) -> Result<Vec<EntityRecordId>, InsertionError> {
        self.client
            .simple_query(
                "CREATE TEMPORARY TABLE entity_editions_temp (
                    record_created_by_id UUID NOT NULL,
                    archived BOOLEAN NOT NULL,
                    entity_type_ontology_id UUID NOT NULL,
                    properties JSONB NOT NULL,
                    left_to_right_order INT,
                    right_to_left_order INT
                );",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        let sink = self
            .client
            .copy_in(
                "COPY entity_editions_temp (
                    record_created_by_id,
                    archived,
                    entity_type_ontology_id,
                    properties,
                    left_to_right_order,
                    right_to_left_order
                ) FROM STDIN BINARY",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[
            Type::UUID,
            Type::BOOL,
            Type::UUID,
            Type::JSONB,
            Type::INT4,
            Type::INT4,
        ]);
        futures::pin_mut!(writer);
        for (properties, left_to_right_order, right_to_left_order) in entities {
            let properties = serde_json::to_value(properties)
                .into_report()
                .change_context(InsertionError)?;

            writer
                .as_mut()
                .write(&[
                    &actor_id,
                    &false,
                    &entity_type_ontology_id,
                    &properties,
                    &left_to_right_order,
                    &right_to_left_order,
                ])
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        writer
            .finish()
            .await
            .into_report()
            .change_context(InsertionError)?;

        let entity_record_ids = self
            .client
            .query(
                "INSERT INTO entity_editions (
                    entity_edition_id,
                    record_created_by_id,
                    archived,
                    entity_type_ontology_id,
                    properties,
                    left_to_right_order,
                    right_to_left_order
                )
                SELECT
                    gen_random_uuid(),
                    record_created_by_id,
                    archived,
                    entity_type_ontology_id,
                    properties,
                    left_to_right_order,
                    right_to_left_order
                FROM entity_editions_temp
                RETURNING entity_edition_id;",
                &[],
            )
            .await
            .into_report()
            .change_context(InsertionError)?
            .into_iter()
            .map(|row| EntityRecordId::new(row.get(0)))
            .collect();

        self.client
            .simple_query("DROP TABLE entity_editions_temp;")
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(entity_record_ids)
    }

    #[doc(hidden)]
    #[cfg(feature = "__internal_bench")]
    async fn insert_entity_versions(
        &self,
        entities: impl IntoIterator<
            Item = (EntityId, EntityRecordId, Option<Timestamp<DecisionTime>>),
            IntoIter: Send,
        > + Send,
    ) -> Result<Vec<EntityVersion>, InsertionError> {
        self.client
            .simple_query(
                "CREATE TEMPORARY TABLE entity_temporal_metadata_temp (
                    owned_by_id UUID NOT NULL,
                    entity_uuid UUID NOT NULL,
                    entity_edition_id UUID NOT NULL,
                    decision_time TIMESTAMP WITH TIME ZONE
                );",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        let sink = self
            .client
            .copy_in(
                "COPY entity_temporal_metadata_temp (
                    owned_by_id,
                    entity_uuid,
                    entity_edition_id,
                    decision_time
                ) FROM STDIN BINARY",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[
            Type::UUID,
            Type::UUID,
            Type::UUID,
            Type::TIMESTAMPTZ,
        ]);
        futures::pin_mut!(writer);
        for (entity_id, entity_record_id, decision_time) in entities {
            writer
                .as_mut()
                .write(&[
                    &entity_id.owned_by_id(),
                    &entity_id.entity_uuid(),
                    &entity_record_id,
                    &decision_time,
                ])
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        writer
            .finish()
            .await
            .into_report()
            .change_context(InsertionError)?;

        let entity_versions = self
            .client
            .query(
                "INSERT INTO entity_temporal_metadata (
                    owned_by_id,
                    entity_uuid,
                    entity_edition_id,
                    decision_time,
                    transaction_time
                ) SELECT
                    owned_by_id,
                    entity_uuid,
                    entity_edition_id,
                    tstzrange(
                        CASE WHEN decision_time IS NULL THEN now() ELSE decision_time END,
                        NULL,
                        '[)'
                    ),
                    tstzrange(now(), NULL, '[)')
                FROM entity_temporal_metadata_temp
                RETURNING decision_time, transaction_time;",
                &[],
            )
            .await
            .into_report()
            .change_context(InsertionError)?
            .into_iter()
            .map(|row| {
                EntityVersion::new(
                    VersionInterval::from_anonymous(row.get(0)),
                    VersionInterval::from_anonymous(row.get(1)),
                )
            })
            .collect();

        self.client
            .simple_query("DROP TABLE entity_temporal_metadata_temp;")
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(entity_versions)
    }
}

#[async_trait]
impl<C: AsClient> AccountStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self))]
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
