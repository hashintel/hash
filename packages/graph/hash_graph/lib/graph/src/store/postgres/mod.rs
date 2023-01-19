mod knowledge;
mod ontology;

mod migration;
mod pool;
mod query;
mod version_id;

use std::{
    collections::{hash_map::RawEntryMut, HashMap},
    fmt::Debug,
    hash::Hash,
};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
#[cfg(feature = "__internal_bench")]
use tokio_postgres::{binary_copy::BinaryCopyInWriter, types::Type};
use tokio_postgres::{error::SqlState, GenericClient};
use type_system::{
    uri::VersionedUri, DataTypeReference, EntityType, EntityTypeReference, PropertyType,
    PropertyTypeReference,
};

pub use self::pool::{AsClient, PostgresStorePool};
use crate::{
    identifier::{account::AccountId, ontology::OntologyTypeEditionId, EntityVertexId},
    ontology::OntologyElementMetadata,
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        error::VersionedUriAlreadyExists,
        postgres::{ontology::OntologyDatabaseType, version_id::VersionId},
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

    /// Creates a new [`VersionId`] from the provided [`VersionedUri`].
    ///
    /// # Errors
    ///
    /// - if [`VersionedUri::base_uri`] did already exist in the database
    #[tracing::instrument(level = "debug", skip(self))]
    async fn create_ontology_id(
        &self,
        uri: &VersionedUri,
        owned_by_id: OwnedById,
        updated_by_id: UpdatedById,
    ) -> Result<VersionId, InsertionError> {
        self.as_client()
            .query_one(
                r#"
                SELECT create_ontology_id(
                    base_uri := $1,
                    version := $2,
                    owned_by_id := $3,
                    updated_by_id := $4
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
                Some(&SqlState::UNIQUE_VIOLATION) => report
                    .change_context(BaseUriAlreadyExists)
                    .attach_printable(uri.base_uri().clone())
                    .change_context(InsertionError),
                _ => report
                    .change_context(InsertionError)
                    .attach_printable(uri.clone()),
            })
    }

    /// Creates a new [`VersionId`] from the provided [`VersionedUri`].
    ///
    /// # Errors
    ///
    /// - if [`VersionedUri::base_uri`] did not already exist in the database
    /// - if [`VersionedUri`] did already exist in the database
    #[tracing::instrument(level = "debug", skip(self))]
    async fn update_ontology_id(
        &self,
        uri: &VersionedUri,
        updated_by_id: UpdatedById,
    ) -> Result<(VersionId, OwnedById), UpdateError> {
        self.as_client()
            .query_opt(
                r#"
                SELECT
                    version_id,
                    owned_by_id
                FROM update_ontology_id(
                    base_uri := $1,
                    version := $2,
                    updated_by_id := $3
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
                _ => report
                    .change_context(UpdateError)
                    .attach_printable(uri.clone()),
            })?
            .map(|row| (row.get(0), OwnedById::new(row.get(1))))
            .ok_or_else(|| {
                Report::new(BaseUriDoesNotExist)
                    .attach_printable(uri.base_uri().clone())
                    .change_context(UpdateError)
            })
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
    #[tracing::instrument(level = "info", skip(self, database_type))]
    async fn create<T>(
        &self,
        database_type: T,
        owned_by_id: OwnedById,
        updated_by_id: UpdatedById,
    ) -> Result<(VersionId, OntologyElementMetadata), InsertionError>
    where
        T: OntologyDatabaseType,
    {
        let uri = database_type.id().clone();

        let version_id = self
            .create_ontology_id(&uri, owned_by_id, updated_by_id)
            .await?;

        self.insert_with_id(version_id, database_type).await?;

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
    #[tracing::instrument(level = "info", skip(self, database_type))]
    async fn update<T>(
        &self,
        database_type: T,
        updated_by_id: UpdatedById,
    ) -> Result<(VersionId, OntologyElementMetadata), UpdateError>
    where
        T: OntologyDatabaseType,
    {
        let uri = database_type.id();
        let edition_id = OntologyTypeEditionId::from(uri);

        let (version_id, owned_by_id) = self
            .update_ontology_id(uri, updated_by_id)
            .await
            .change_context(UpdateError)?;
        self.insert_with_id(version_id, database_type)
            .await
            .change_context(UpdateError)?;

        Ok((
            version_id,
            OntologyElementMetadata::new(
                edition_id,
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
    #[tracing::instrument(level = "debug", skip(self, database_type))]
    async fn insert_with_id<T>(
        &self,
        version_id: VersionId,
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
                        INSERT INTO {} (version_id, schema)
                        VALUES ($1, $2)
                        RETURNING version_id;
                    "#,
                    T::table()
                ),
                &[&version_id, &value],
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

    #[tracing::instrument(level = "debug", skip(self, entity_type))]
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
    #[tracing::instrument(level = "debug", skip(self, referenced_entity_types))]
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

    #[tracing::instrument(level = "debug", skip(self, referenced_property_types))]
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

    #[tracing::instrument(level = "debug", skip(self, referenced_data_types))]
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
    #[tracing::instrument(level = "debug", skip(self))]
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
        entity_type_version_id: VersionId,
        actor_id: UpdatedById,
    ) -> Result<Vec<EntityRecordId>, InsertionError> {
        self.client
            .simple_query(
                "CREATE TEMPORARY TABLE entity_editions_temp (
                    updated_by_id UUID NOT NULL,
                    archived BOOLEAN NOT NULL,
                    entity_type_version_id UUID NOT NULL,
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
                    updated_by_id,
                    archived,
                    entity_type_version_id,
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
                    &entity_type_version_id,
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
                    updated_by_id,
                    archived,
                    entity_type_version_id,
                    properties,
                    left_to_right_order,
                    right_to_left_order
                )
                SELECT
                    updated_by_id,
                    archived,
                    entity_type_version_id,
                    properties,
                    left_to_right_order,
                    right_to_left_order
                FROM entity_editions_temp
                RETURNING entity_record_id;",
                &[],
            )
            .await
            .into_report()
            .change_context(InsertionError)?
            .into_iter()
            .map(|row| EntityRecordId::new(row.get::<_, i64>(0)))
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
                "CREATE TEMPORARY TABLE entity_versions_temp (
                    owned_by_id UUID NOT NULL,
                    entity_uuid UUID NOT NULL,
                    entity_record_id BIGINT NOT NULL,
                    decision_time TIMESTAMP WITH TIME ZONE
                );",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        let sink = self
            .client
            .copy_in(
                "COPY entity_versions_temp (
                    owned_by_id,
                    entity_uuid,
                    entity_record_id,
                    decision_time
                ) FROM STDIN BINARY",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[
            Type::UUID,
            Type::UUID,
            Type::INT8,
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
                "INSERT INTO entity_versions (
                    owned_by_id,
                    entity_uuid,
                    entity_record_id,
                    decision_time,
                    transaction_time
                ) SELECT
                    owned_by_id,
                    entity_uuid,
                    entity_record_id,
                    tstzrange(
                        CASE WHEN decision_time IS NULL THEN now() ELSE decision_time END,
                        NULL,
                        '[)'
                    ),
                    tstzrange(now(), NULL, '[)')
                FROM entity_versions_temp
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
            .simple_query("DROP TABLE entity_versions_temp;")
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
