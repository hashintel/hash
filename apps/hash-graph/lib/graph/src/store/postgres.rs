mod knowledge;
mod ontology;

mod migration;
mod pool;
mod query;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
#[cfg(feature = "__internal_bench")]
use tokio_postgres::{binary_copy::BinaryCopyInWriter, types::Type};
use tokio_postgres::{error::SqlState, GenericClient};
use type_system::{
    url::VersionedUrl, DataTypeReference, EntityType, EntityTypeReference, PropertyType,
    PropertyTypeReference,
};

pub use self::pool::{AsClient, PostgresStorePool};
use crate::{
    identifier::{account::AccountId, ontology::OntologyTypeRecordId},
    ontology::{
        ExternalOntologyElementMetadata, OntologyElementMetadata, OwnedOntologyElementMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        error::{OntologyTypeIsNotOwned, OntologyVersionDoesNotExist, VersionedUrlAlreadyExists},
        postgres::ontology::{OntologyDatabaseType, OntologyId},
        AccountStore, BaseUrlAlreadyExists, InsertionError, QueryError, StoreError, UpdateError,
    },
};
#[cfg(feature = "__internal_bench")]
use crate::{
    identifier::{
        knowledge::{EntityEditionId, EntityId, EntityTemporalMetadata},
        time::{DecisionTime, Timestamp},
    },
    knowledge::{EntityProperties, LinkOrder},
};

#[derive(Default)]
pub struct TraversalContext;

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

    /// Creates a new owned [`OntologyId`] from the provided [`VersionedUrl`].
    ///
    /// # Errors
    ///
    /// - if [`VersionedUrl::base_url`] did already exist in the database
    #[tracing::instrument(level = "debug", skip(self))]
    async fn create_owned_ontology_id(
        &self,
        metadata: &OwnedOntologyElementMetadata,
    ) -> Result<OntologyId, InsertionError> {
        self.as_client()
            .query_one(
                r#"
                SELECT
                    ontology_id
                FROM create_owned_ontology_id(
                    base_url := $1,
                    version := $2,
                    record_created_by_id := $3,
                    owned_by_id := $4
                );"#,
                &[
                    &metadata.record_id().base_url.as_str(),
                    &metadata.record_id().version,
                    &metadata.provenance_metadata().updated_by_id(),
                    &metadata.owned_by_id(),
                ],
            )
            .await
            .into_report()
            .map(|row| row.get(0))
            .map_err(|report| match report.current_context().code() {
                Some(&SqlState::UNIQUE_VIOLATION) => report
                    .change_context(BaseUrlAlreadyExists)
                    .attach_printable(metadata.record_id().base_url.clone())
                    .change_context(InsertionError),
                _ => report
                    .change_context(InsertionError)
                    .attach_printable(VersionedUrl::from(metadata.record_id().clone())),
            })
    }

    /// Creates a new external [`OntologyId`] from the provided [`VersionedUrl`].
    ///
    /// # Errors
    ///
    /// - [`BaseUrlAlreadyExists`] if [`VersionedUrl::base_url`] is an owned base url
    /// - [`VersionedUrlAlreadyExists`] if [`VersionedUrl::version`] is already used for the base
    ///   url
    #[tracing::instrument(level = "debug", skip(self))]
    async fn create_external_ontology_id(
        &self,
        metadata: &ExternalOntologyElementMetadata,
    ) -> Result<OntologyId, InsertionError> {
        self.as_client()
            .query_one(
                r#"
                SELECT
                    ontology_id
                FROM create_external_ontology_id(
                    base_url := $1,
                    version := $2,
                    record_created_by_id := $3,
                    fetched_at := $4
                );"#,
                &[
                    &metadata.record_id().base_url.as_str(),
                    &metadata.record_id().version,
                    &metadata.provenance_metadata().updated_by_id(),
                    &metadata.fetched_at(),
                ],
            )
            .await
            .into_report()
            .map(|row| row.get(0))
            .map_err(|report| match report.current_context().code() {
                Some(&SqlState::INVALID_PARAMETER_VALUE) => report
                    .change_context(BaseUrlAlreadyExists)
                    .attach_printable(metadata.record_id().base_url.clone())
                    .change_context(InsertionError),
                Some(&SqlState::UNIQUE_VIOLATION) => report
                    .change_context(VersionedUrlAlreadyExists)
                    .attach_printable(metadata.record_id().base_url.clone())
                    .change_context(InsertionError),
                _ => report
                    .change_context(InsertionError)
                    .attach_printable(VersionedUrl::from(metadata.record_id().clone())),
            })
    }

    /// Updates the latest version of [`VersionedUrl::base_url`] and creates a new [`OntologyId`]
    /// for it.
    ///
    /// # Errors
    ///
    /// - [`VersionedUrlAlreadyExists`] if [`VersionedUrl`] does already exist in the database
    /// - [`OntologyVersionDoesNotExist`] if the previous version does not exist
    /// - [`OntologyTypeIsNotOwned`] if ontology type is an external ontology type
    #[tracing::instrument(level = "debug", skip(self))]
    async fn update_owned_ontology_id(
        &self,
        url: &VersionedUrl,
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
                    base_url := $1,
                    version := $2,
                    version_to_update := $3,
                    record_created_by_id := $4
                );"#,
                &[
                    &url.base_url.as_str(),
                    &i64::from(url.version),
                    &i64::from(url.version - 1),
                    &updated_by_id,
                ],
            )
            .await
            .into_report()
            .map_err(|report| match report.current_context().code() {
                Some(&SqlState::UNIQUE_VIOLATION) => report
                    .change_context(VersionedUrlAlreadyExists)
                    .attach_printable(url.clone())
                    .change_context(UpdateError),
                Some(&SqlState::INVALID_PARAMETER_VALUE) => report
                    .change_context(OntologyVersionDoesNotExist)
                    .attach_printable(url.base_url.clone())
                    .change_context(UpdateError),
                Some(&SqlState::RESTRICT_VIOLATION) => report
                    .change_context(OntologyTypeIsNotOwned)
                    .attach_printable(url.base_url.clone())
                    .change_context(UpdateError),
                _ => report
                    .change_context(UpdateError)
                    .attach_printable(url.clone()),
            })?;

        Ok((row.get(0), OwnedById::new(row.get(1))))
    }

    /// Inserts the specified [`OntologyDatabaseType`].
    ///
    /// This first extracts the [`BaseUrl`] from the [`VersionedUrl`] and attempts to insert it into
    /// the database. It will create a new [`OntologyId`] for this [`VersionedUrl`] and then finally
    /// inserts the entry.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUrl`] already exists
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    #[tracing::instrument(level = "info", skip(self, database_type))]
    async fn create<T>(
        &self,
        database_type: T,
        metadata: &OntologyElementMetadata,
    ) -> Result<OntologyId, InsertionError>
    where
        T: OntologyDatabaseType + Send,
        T::Representation: Send,
    {
        let ontology_id = match metadata {
            OntologyElementMetadata::Owned(metadata) => {
                self.create_owned_ontology_id(metadata).await?
            }
            OntologyElementMetadata::External(metadata) => {
                self.create_external_ontology_id(metadata).await?
            }
        };

        self.insert_with_id(ontology_id, database_type).await?;

        Ok(ontology_id)
    }

    /// Updates the specified [`OntologyDatabaseType`].
    ///
    /// First this ensures the [`BaseUrl`] of the type already exists. It then creates a
    /// new [`OntologyId`] from the contained [`VersionedUrl`] and inserts the type.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUrl`] does not already exist
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    #[tracing::instrument(level = "info", skip(self, database_type))]
    async fn update<T>(
        &self,
        database_type: T,
        updated_by_id: UpdatedById,
    ) -> Result<(OntologyId, OntologyElementMetadata), UpdateError>
    where
        T: OntologyDatabaseType + Send,
        T::Representation: Send,
    {
        let url = database_type.id();
        let record_id = OntologyTypeRecordId::from(url.clone());

        let (ontology_id, owned_by_id) = self.update_owned_ontology_id(url, updated_by_id).await?;
        self.insert_with_id(ontology_id, database_type)
            .await
            .change_context(UpdateError)?;

        Ok((
            ontology_id,
            OntologyElementMetadata::Owned(OwnedOntologyElementMetadata::new(
                record_id,
                ProvenanceMetadata::new(updated_by_id),
                owned_by_id,
            )),
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
        T: OntologyDatabaseType + Send,
        T::Representation: Send,
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

    // TODO: Tidy these up by having an `Into<VersionedUrl>` method or something for the references
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
            ids.push(self.ontology_id_by_url(reference.url()).await?);
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
            ids.push(self.ontology_id_by_url(reference.url()).await?);
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
            ids.push(self.ontology_id_by_url(reference.url()).await?);
        }
        Ok(ids)
    }

    /// Fetches the [`OntologyId`] of the specified [`VersionedUrl`].
    ///
    /// # Errors:
    ///
    /// - if the entry referred to by `url` does not exist.
    #[tracing::instrument(level = "debug", skip(self))]
    async fn ontology_id_by_url(&self, url: &VersionedUrl) -> Result<OntologyId, QueryError> {
        let version = i64::from(url.version);
        Ok(self
            .client
            .as_client()
            .query_one(
                r#"
                SELECT ontology_id
                FROM ontology_ids
                WHERE base_url = $1 AND version = $2;
                "#,
                &[&url.base_url.as_str(), &version],
            )
            .await
            .into_report()
            .change_context(QueryError)
            .attach_printable_lazy(|| url.clone())?
            .get(0))
    }

    /// # Errors
    ///
    /// - if the underlying client cannot start a transaction
    pub async fn transaction(
        &mut self,
    ) -> Result<PostgresStore<tokio_postgres::Transaction<'_>>, StoreError> {
        Ok(PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(StoreError)?,
        ))
    }
}

impl PostgresStore<tokio_postgres::Transaction<'_>> {
    /// # Errors
    ///
    /// - if the underlying client cannot commit the transaction
    pub async fn commit(self) -> Result<(), StoreError> {
        self.client
            .commit()
            .await
            .into_report()
            .change_context(StoreError)
    }

    /// # Errors
    ///
    /// - if the underlying client cannot rollback the transaction
    pub async fn rollback(self) -> Result<(), StoreError> {
        self.client
            .rollback()
            .await
            .into_report()
            .change_context(StoreError)
    }

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
                    &entity_id.owned_by_id,
                    &entity_id.entity_uuid,
                    &left_entity_id
                        .as_ref()
                        .map(|entity_id| entity_id.owned_by_id),
                    &left_entity_id
                        .as_ref()
                        .map(|entity_id| entity_id.entity_uuid),
                    &right_entity_id
                        .as_ref()
                        .map(|entity_id| entity_id.owned_by_id),
                    &right_entity_id
                        .as_ref()
                        .map(|entity_id| entity_id.entity_uuid),
                ])
                .await
                .into_report()
                .change_context(InsertionError)
                .attach_printable(entity_id.entity_uuid)?;
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
    ) -> Result<Vec<EntityEditionId>, InsertionError> {
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

        let entity_edition_ids = self
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
            .map(|row| EntityEditionId::new(row.get(0)))
            .collect();

        self.client
            .simple_query("DROP TABLE entity_editions_temp;")
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(entity_edition_ids)
    }

    #[doc(hidden)]
    #[cfg(feature = "__internal_bench")]
    async fn insert_entity_versions(
        &self,
        entities: impl IntoIterator<
            Item = (EntityId, EntityEditionId, Option<Timestamp<DecisionTime>>),
            IntoIter: Send,
        > + Send,
    ) -> Result<Vec<EntityTemporalMetadata>, InsertionError> {
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
        for (entity_id, entity_edition_id, decision_time) in entities {
            writer
                .as_mut()
                .write(&[
                    &entity_id.owned_by_id,
                    &entity_id.entity_uuid,
                    &entity_edition_id,
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
            .map(|row| EntityTemporalMetadata {
                decision_time: row.get(0),
                transaction_time: row.get(1),
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
