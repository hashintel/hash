mod knowledge;
mod ontology;

mod migration;
mod pool;
mod query;
mod traversal_context;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
#[cfg(hash_graph_test_environment)]
use tokio_postgres::{binary_copy::BinaryCopyInWriter, types::Type};
use tokio_postgres::{error::SqlState, GenericClient};
use type_system::{
    url::VersionedUrl, DataTypeReference, EntityType, EntityTypeReference, PropertyType,
    PropertyTypeReference,
};

pub use self::{
    pool::{AsClient, PostgresStorePool},
    traversal_context::TraversalContext,
};
use crate::{
    identifier::{
        account::AccountId,
        ontology::{OntologyTypeRecordId, OntologyTypeVersion},
    },
    ontology::{
        ExternalOntologyElementMetadata, OntologyElementMetadata, OwnedOntologyElementMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
    store::{
        error::{
            DeletionError, OntologyTypeIsNotOwned, OntologyVersionDoesNotExist,
            VersionedUrlAlreadyExists,
        },
        postgres::ontology::{OntologyDatabaseType, OntologyId},
        AccountStore, BaseUrlAlreadyExists, ConflictBehavior, InsertionError, QueryError,
        StoreError, UpdateError,
    },
};
#[cfg(hash_graph_test_environment)]
use crate::{
    identifier::{
        knowledge::{EntityEditionId, EntityId, EntityTemporalMetadata},
        time::{DecisionTime, Timestamp},
    },
    knowledge::{EntityProperties, LinkOrder},
};

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
        on_conflict: ConflictBehavior,
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
                    owned_by_id := $4,
                    resume_on_conflict := $5
                );"#,
                &[
                    &metadata.record_id().base_url.as_str(),
                    &metadata.record_id().version,
                    &metadata.provenance_metadata().record_created_by_id(),
                    &metadata.owned_by_id(),
                    &(on_conflict == ConflictBehavior::Skip),
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
                    .attach_printable(VersionedUrl::from(metadata.record_id().clone()))
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
        on_conflict: ConflictBehavior,
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
                    fetched_at := $4,
                    resume_on_conflict := $5
                );"#,
                &[
                    &metadata.record_id().base_url.as_str(),
                    &metadata.record_id().version,
                    &metadata.provenance_metadata().record_created_by_id(),
                    &metadata.fetched_at(),
                    &(on_conflict == ConflictBehavior::Skip),
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
                    .attach_printable(VersionedUrl::from(metadata.record_id().clone()))
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
        record_created_by_id: RecordCreatedById,
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
                    &record_created_by_id,
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
        on_conflict: ConflictBehavior,
    ) -> Result<Option<OntologyId>, InsertionError>
    where
        T: OntologyDatabaseType + Send,
        T::Representation: Send,
    {
        let ontology_id = match metadata {
            OntologyElementMetadata::Owned(metadata) => {
                self.create_owned_ontology_id(metadata, on_conflict).await?
            }
            OntologyElementMetadata::External(metadata) => {
                self.create_external_ontology_id(metadata, on_conflict)
                    .await?
            }
        };
        self.insert_with_id(ontology_id, database_type).await?;

        Ok(Some(ontology_id))
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
        record_created_by_id: RecordCreatedById,
    ) -> Result<(OntologyId, OntologyElementMetadata), UpdateError>
    where
        T: OntologyDatabaseType + Send,
        T::Representation: Send,
    {
        let url = database_type.id();
        let record_id = OntologyTypeRecordId::from(url.clone());

        let (ontology_id, owned_by_id) = self
            .update_owned_ontology_id(url, record_created_by_id)
            .await?;
        self.insert_with_id(ontology_id, database_type)
            .await
            .change_context(UpdateError)?;

        Ok((
            ontology_id,
            OntologyElementMetadata::Owned(OwnedOntologyElementMetadata::new(
                record_id,
                ProvenanceMetadata::new(record_created_by_id),
                owned_by_id,
            )),
        ))
    }

    /// Inserts an [`OntologyDatabaseType`] identified by [`OntologyId`], and associated with an
    /// [`OwnedById`] and [`RecordCreatedById`], into the database.
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    #[tracing::instrument(level = "debug", skip(self, database_type))]
    async fn insert_with_id<T>(
        &self,
        ontology_id: OntologyId,
        database_type: T,
    ) -> Result<Option<OntologyId>, InsertionError>
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
        Ok(self
            .as_client()
            .query_opt(
                &format!(
                    r#"
                        INSERT INTO {} (ontology_id, schema)
                        VALUES ($1, $2)
                        ON CONFLICT DO NOTHING
                        RETURNING ontology_id;
                    "#,
                    T::table()
                ),
                &[&ontology_id, &value],
            )
            .await
            .into_report()
            .change_context(InsertionError)?
            .map(|row| row.get(0)))
    }

    #[tracing::instrument(level = "debug", skip(self, property_type))]
    async fn insert_property_type_references(
        &self,
        property_type: &PropertyType,
        ontology_id: OntologyId,
    ) -> Result<(), InsertionError> {
        for property_type in property_type.property_type_references() {
            self.as_client()
                .query_one(
                r#"
                        INSERT INTO property_type_constrains_properties_on (
                            source_property_type_ontology_id,
                            target_property_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version = $3)
                        ) RETURNING target_property_type_ontology_id;
                    "#,
                    &[
                        &ontology_id,
                        &property_type.url().base_url.as_str(),
                        &OntologyTypeVersion::new(property_type.url().version),
                    ],
            )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        for data_type in property_type.data_type_references() {
            self.as_client()
                .query_one(
                r#"
                        INSERT INTO property_type_constrains_values_on (
                            source_property_type_ontology_id,
                            target_data_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version = $3)
                        ) RETURNING target_data_type_ontology_id;
                    "#,
                    &[
                        &ontology_id,
                        &data_type.url().base_url.as_str(),
                        &OntologyTypeVersion::new(data_type.url().version),
                    ],
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
        for property_type in entity_type.property_type_references() {
            self.as_client()
                .query_one(
                    r#"
                        INSERT INTO entity_type_constrains_properties_on (
                            source_entity_type_ontology_id,
                            target_property_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version = $3)
                        ) RETURNING source_entity_type_ontology_id;
                    "#,
                    &[
                        &ontology_id,
                        &property_type.url().base_url.as_str(),
                        &OntologyTypeVersion::new(property_type.url().version),
                    ],
                )
            .await
                .into_report()
                .change_context(InsertionError)?;
        }

        for inherits_from in entity_type.inherits_from().all_of() {
            self.as_client()
                .query_one(
                r#"
                        INSERT INTO entity_type_inherits_from (
                            source_entity_type_ontology_id,
                            target_entity_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version = $3)
                        ) RETURNING target_entity_type_ontology_id;
                    "#,
                    &[
                        &ontology_id,
                        &inherits_from.url().base_url.as_str(),
                        &OntologyTypeVersion::new(inherits_from.url().version),
                    ],
            )
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        // TODO: should we check that the `link_entity_type_ref` is a link entity type?
        //   see https://app.asana.com/0/0/1203277018227719/f
        for (link_reference, destinations) in entity_type.link_mappings() {
            self.as_client()
                .query_one(
                    r#"
                        INSERT INTO entity_type_constrains_links_on (
                            source_entity_type_ontology_id,
                            target_entity_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version = $3)
                        ) RETURNING target_entity_type_ontology_id;
                    "#,
                    &[
                        &ontology_id,
                        &link_reference.url().base_url.as_str(),
                        &OntologyTypeVersion::new(link_reference.url().version),
                    ],
            )
            .await
                .into_report()
                .change_context(InsertionError)?;

            if let Some(destinations) = destinations {
                for destination in destinations {
                    self.as_client()
                .query_one(
                    r#"
                        INSERT INTO entity_type_constrains_link_destinations_on (
                        source_entity_type_ontology_id,
                        target_entity_type_ontology_id
                            ) VALUES (
                                $1,
                                (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version = $3)
                            ) RETURNING target_entity_type_ontology_id;
                        "#,
                        &[
                            &ontology_id,
                            &destination.url().base_url.as_str(),
                            &OntologyTypeVersion::new(destination.url().version),
                        ],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;
                }
            }
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
    #[cfg(hash_graph_test_environment)]
    async fn insert_entity_ids(
        &self,
        entity_uuids: impl IntoIterator<Item = EntityId, IntoIter: Send> + Send,
    ) -> Result<u64, InsertionError> {
        let sink = self
            .client
            .copy_in(
                "COPY entity_ids (
                    owned_by_id,
                    entity_uuid
                ) FROM STDIN BINARY",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[Type::UUID, Type::UUID]);

        futures::pin_mut!(writer);
        for entity_id in entity_uuids {
            writer
                .as_mut()
                .write(&[&entity_id.owned_by_id, &entity_id.entity_uuid])
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
    #[cfg(hash_graph_test_environment)]
    async fn insert_entity_is_of_type(
        &self,
        entity_edition_ids: impl IntoIterator<Item = EntityEditionId, IntoIter: Send> + Send,
        entity_type_ontology_id: OntologyId,
    ) -> Result<u64, InsertionError> {
        let sink = self
            .client
            .copy_in(
                "COPY entity_is_of_type (
                    entity_edition_id,
                    entity_type_ontology_id
                ) FROM STDIN BINARY",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[Type::UUID, Type::UUID]);

        futures::pin_mut!(writer);
        for entity_edition_id in entity_edition_ids {
            writer
                .as_mut()
                .write(&[&entity_edition_id, &entity_type_ontology_id])
                .await
                .into_report()
                .change_context(InsertionError)?;
        }

        writer
            .finish()
            .await
            .into_report()
            .change_context(InsertionError)
    }

    #[doc(hidden)]
    #[cfg(hash_graph_test_environment)]
    async fn insert_entity_links(
        &self,
        left_right: &'static str,
        entity_ids: impl IntoIterator<Item = (EntityId, EntityId), IntoIter: Send> + Send,
    ) -> Result<u64, InsertionError> {
        let sink = self
            .client
            .copy_in(&format!(
                "COPY entity_has_{left_right}_entity (
                    owned_by_id,
                    entity_uuid,
                    {left_right}_owned_by_id,
                    {left_right}_entity_uuid
                ) FROM STDIN BINARY",
            ))
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer =
            BinaryCopyInWriter::new(sink, &[Type::UUID, Type::UUID, Type::UUID, Type::UUID]);

        futures::pin_mut!(writer);
        for (entity_id, link_entity_id) in entity_ids {
            writer
                .as_mut()
                .write(&[
                    &entity_id.owned_by_id,
                    &entity_id.entity_uuid,
                    &link_entity_id.owned_by_id,
                    &link_entity_id.entity_uuid,
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
    #[cfg(hash_graph_test_environment)]
    async fn insert_entity_records(
        &self,
        entities: impl IntoIterator<
            Item = (EntityProperties, Option<LinkOrder>, Option<LinkOrder>),
            IntoIter: Send,
        > + Send,
        actor_id: RecordCreatedById,
    ) -> Result<Vec<EntityEditionId>, InsertionError> {
        self.client
            .simple_query(
                "CREATE TEMPORARY TABLE entity_editions_temp (
                    properties JSONB NOT NULL,
                    left_to_right_order INT,
                    right_to_left_order INT,
                    record_created_by_id UUID NOT NULL,
                    archived BOOLEAN NOT NULL
                );",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        let sink = self
            .client
            .copy_in(
                "COPY entity_editions_temp (
                    properties,
                    left_to_right_order,
                    right_to_left_order,
                    record_created_by_id,
                    archived
                ) FROM STDIN BINARY",
            )
            .await
            .into_report()
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[
            Type::JSONB,
            Type::INT4,
            Type::INT4,
            Type::UUID,
            Type::BOOL,
        ]);
        futures::pin_mut!(writer);
        for (properties, left_to_right_order, right_to_left_order) in entities {
            let properties = serde_json::to_value(properties)
                .into_report()
                .change_context(InsertionError)?;

            writer
                .as_mut()
                .write(&[
                    &properties,
                    &left_to_right_order,
                    &right_to_left_order,
                    &actor_id,
                    &false,
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
                    properties,
                    left_to_right_order,
                    right_to_left_order,
                    record_created_by_id,
                    archived
                )
                SELECT
                    gen_random_uuid(),
                    properties,
                    left_to_right_order,
                    right_to_left_order,
                    record_created_by_id,
                    archived
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
    #[cfg(hash_graph_test_environment)]
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

impl<C: AsClient> PostgresStore<C> {
    #[tracing::instrument(level = "trace", skip(self))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_accounts(&mut self) -> Result<(), DeletionError> {
        self.as_client()
            .client()
            .simple_query("DELETE FROM accounts;")
            .await
            .into_report()
            .change_context(DeletionError)?;

        Ok(())
    }
}
