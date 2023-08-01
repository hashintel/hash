mod knowledge;
mod ontology;

mod migration;
mod pool;
mod query;
mod traversal_context;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use time::OffsetDateTime;
#[cfg(hash_graph_test_environment)]
use tokio_postgres::{binary_copy::BinaryCopyInWriter, types::Type};
use tokio_postgres::{error::SqlState, GenericClient};
use type_system::{
    repr,
    url::{BaseUrl, VersionedUrl},
    DataTypeReference, EntityType, EntityTypeReference, PropertyType, PropertyTypeReference,
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
    ontology::{CustomOntologyMetadata, OntologyElementMetadata},
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
    store::{
        error::{OntologyTypeIsNotOwned, OntologyVersionDoesNotExist, VersionedUrlAlreadyExists},
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
    store::error::DeletionError,
};

/// A Postgres-backed store
pub struct PostgresStore<C> {
    client: C,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum OntologyLocation {
    Owned,
    External,
}

impl PostgresStore<tokio_postgres::Transaction<'_>> {
    async fn create_base_url(
        &mut self,
        base_url: &BaseUrl,
        on_conflict: ConflictBehavior,
        location: OntologyLocation,
    ) -> Result<(), InsertionError> {
        const INSERTION_QUERY: &str = r#"
            INSERT INTO base_urls (base_url) VALUES ($1);
        "#;
        match on_conflict {
            ConflictBehavior::Fail => {
                self.as_client()
                    .query(INSERTION_QUERY, &[&base_url.as_str()])
                    .await
                    .into_report()
                    .map_err(|report| match report.current_context().code() {
                        Some(&SqlState::UNIQUE_VIOLATION) => report
                            .change_context(BaseUrlAlreadyExists)
                            .attach_printable(base_url.clone())
                            .change_context(InsertionError),
                        _ => report
                            .change_context(InsertionError)
                            .attach_printable(base_url.clone()),
                    })?;
            }
            ConflictBehavior::Skip => {
                let savepoint = self
                    .client
                    .savepoint("insert_base_url")
                    .await
                    .into_report()
                    .change_context(InsertionError)?;

                let result = savepoint
                    .as_client()
                    .query(INSERTION_QUERY, &[&base_url.as_str()])
                    .await;

                if let Err(error) = result {
                    savepoint
                        .rollback()
                        .await
                        .into_report()
                        .change_context(InsertionError)?;

                    if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                        let query = match location {
                            OntologyLocation::Owned => {
                                r#"
                                    SELECT EXISTS (SELECT 1
                                    FROM ontology_owned_metadata
                                    NATURAL JOIN ontology_ids
                                    WHERE base_url = $1);
                                "#
                            }
                            OntologyLocation::External => {
                                r#"
                                    SELECT EXISTS (SELECT 1
                                    FROM ontology_external_metadata
                                    NATURAL JOIN ontology_ids
                                    WHERE base_url = $1);
                                "#
                            }
                        };

                        let is_correct: bool = self
                            .as_client()
                            .query_one(query, &[&base_url.as_str()])
                            .await
                            .into_report()
                            .change_context(InsertionError)
                            .map(|row| row.get(0))?;
                        if !is_correct {
                            return Err(Report::new(BaseUrlAlreadyExists)
                                .attach_printable(base_url.clone())
                                .change_context(InsertionError));
                        }
                    }
                } else {
                    savepoint
                        .commit()
                        .await
                        .into_report()
                        .change_context(InsertionError)?;
                }
            }
        }

        Ok(())
    }

    /// Inserts the specified [`OntologyDatabaseType`].
    ///
    /// This first extracts the [`BaseUrl`] from the [`VersionedUrl`] and attempts to insert it into
    /// the database. It will create a new [`OntologyId`] for this [`VersionedUrl`] and then finally
    /// inserts the entry.
    ///
    /// # Errors
    ///
    /// - If the [`BaseUrl`] already exists and `on_conflict` is [`ConflictBehavior::Fail`]
    /// - If the [`VersionedUrl`] already exists and `on_conflict` is [`ConflictBehavior::Fail`]
    ///
    /// [`BaseUrl`]: type_system::url::BaseUrl
    #[tracing::instrument(level = "info", skip(self))]
    async fn create_ontology_metadata(
        &mut self,
        metadata: &OntologyElementMetadata,
        on_conflict: ConflictBehavior,
    ) -> Result<Option<OntologyId>, InsertionError> {
        match metadata.custom {
            CustomOntologyMetadata::Owned {
                provenance,
                owned_by_id,
                ..
            } => {
                self.create_base_url(
                    &metadata.record_id.base_url,
                    on_conflict,
                    OntologyLocation::Owned,
                )
                .await?;
                let ontology_id = self
                    .create_ontology_id(
                        &metadata.record_id,
                        provenance.record_created_by_id,
                        on_conflict,
                    )
                    .await?;
                if let Some(ontology_id) = ontology_id {
                    self.create_ontology_temporal_metadata(ontology_id).await?;
                    self.create_ontology_owned_metadata(ontology_id, owned_by_id)
                        .await?;
                }
                Ok(ontology_id)
            }
            CustomOntologyMetadata::External {
                provenance,
                fetched_at,
                ..
            } => {
                self.create_base_url(
                    &metadata.record_id.base_url,
                    ConflictBehavior::Skip,
                    OntologyLocation::External,
                )
                .await?;
                let ontology_id = self
                    .create_ontology_id(
                        &metadata.record_id,
                        provenance.record_created_by_id,
                        on_conflict,
                    )
                    .await?;
                if let Some(ontology_id) = ontology_id {
                    self.create_ontology_temporal_metadata(ontology_id).await?;
                    self.create_ontology_external_metadata(ontology_id, fetched_at)
                        .await?;
                }
                Ok(ontology_id)
            }
        }
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

        Ok((ontology_id, OntologyElementMetadata {
            record_id,
            custom: CustomOntologyMetadata::Owned {
                provenance: ProvenanceMetadata::new(record_created_by_id),
                owned_by_id,
                temporal_versioning: None,
            },
        }))
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
        let Some(owned_by_id) = self
            .as_client()
            .query_opt(
                r#"
                  SELECT owned_by_id
                  FROM ontology_owned_metadata
                  NATURAL JOIN ontology_ids
                  WHERE base_url = $1
                    AND version = $2
                  LIMIT 1 -- There might be multiple versions of the same ontology, but we only
                          -- care about the `owned_by_id` which does not change when (un-)archiving.
                ;"#,
                &[&url.base_url.as_str(), &i64::from(url.version - 1)],
            )
            .await
            .into_report()
            .change_context(UpdateError)?
            .map(|row| row.get(0))
        else {
            let exists: bool = self
                .as_client()
                .query_one(
                    r#"
                  SELECT EXISTS (
                    SELECT 1
                    FROM ontology_ids
                    WHERE base_url = $1
                      AND version = $2
                  );"#,
                    &[&url.base_url.as_str(), &i64::from(url.version - 1)],
                )
                .await
                .into_report()
                .change_context(UpdateError)
                .map(|row| row.get(0))?;
            return Err(if exists {
                Report::new(OntologyTypeIsNotOwned)
                    .attach_printable(url.clone())
                    .change_context(UpdateError)
            } else {
                Report::new(OntologyVersionDoesNotExist)
                    .attach_printable(url.clone())
                    .change_context(UpdateError)
            });
        };

        let ontology_id = self
            .create_ontology_id(
                &OntologyTypeRecordId::from(url.clone()),
                record_created_by_id,
                ConflictBehavior::Fail,
            )
            .await
            .change_context(UpdateError)?
            .expect("ontology id should have been created");

        self.create_ontology_temporal_metadata(ontology_id)
            .await
            .change_context(UpdateError)?;
        self.create_ontology_owned_metadata(ontology_id, owned_by_id)
            .await
            .change_context(UpdateError)?;

        Ok((ontology_id, owned_by_id))
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

    async fn create_ontology_id(
        &self,
        record_id: &OntologyTypeRecordId,
        record_created_by_id: RecordCreatedById,
        on_conflict: ConflictBehavior,
    ) -> Result<Option<OntologyId>, InsertionError> {
        let query: &str = match on_conflict {
            ConflictBehavior::Skip => {
                r#"
                  INSERT INTO ontology_ids (
                    ontology_id,
                    base_url,
                    version,
                    record_created_by_id
                  ) VALUES (gen_random_uuid(), $1, $2, $3)
                  ON CONFLICT DO NOTHING
                  RETURNING ontology_ids.ontology_id;
                "#
            }
            ConflictBehavior::Fail => {
                r#"
                  INSERT INTO ontology_ids (
                    ontology_id,
                    base_url,
                    version,
                    record_created_by_id
                  ) VALUES (gen_random_uuid(), $1, $2, $3)
                  RETURNING ontology_ids.ontology_id;
                "#
            }
        };
        self.as_client()
            .query_opt(query, &[
                &record_id.base_url.as_str(),
                &record_id.version,
                &record_created_by_id,
            ])
            .await
            .into_report()
            .map_err(|report| match report.current_context().code() {
                Some(&SqlState::UNIQUE_VIOLATION) => report
                    .change_context(VersionedUrlAlreadyExists)
                    .attach_printable(VersionedUrl::from(record_id.clone()))
                    .change_context(InsertionError),
                _ => report
                    .change_context(InsertionError)
                    .attach_printable(VersionedUrl::from(record_id.clone())),
            })
            .map(|optional| optional.map(|row| row.get(0)))
    }

    async fn create_ontology_temporal_metadata(
        &self,
        ontology_id: OntologyId,
    ) -> Result<(), InsertionError> {
        let query: &str = r#"
              INSERT INTO ontology_temporal_metadata (
                ontology_id,
                transaction_time
              ) VALUES ($1, tstzrange(now(), NULL, '[)'));
            "#;

        self.as_client()
            .query(query, &[&ontology_id])
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn create_ontology_owned_metadata(
        &self,
        ontology_id: OntologyId,
        owned_by_id: OwnedById,
    ) -> Result<(), InsertionError> {
        let query: &str = r#"
              INSERT INTO ontology_owned_metadata (
                ontology_id,
                owned_by_id
              ) VALUES ($1, $2);
            "#;

        self.as_client()
            .query(query, &[&ontology_id, &owned_by_id])
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn create_ontology_external_metadata(
        &self,
        ontology_id: OntologyId,
        fetched_at: OffsetDateTime,
    ) -> Result<(), InsertionError> {
        let query: &str = r#"
              INSERT INTO ontology_external_metadata (
                ontology_id,
                fetched_at
              ) VALUES ($1, $2);
            "#;

        self.as_client()
            .query(query, &[&ontology_id, &fetched_at])
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
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

    /// Inserts a [`EntityType`] identified by [`OntologyId`], and associated with an
    /// [`OwnedById`], [`RecordCreatedById`], and the optional label property, into the database.
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    #[tracing::instrument(level = "debug", skip(self, entity_type))]
    async fn insert_entity_type_with_id(
        &self,
        ontology_id: OntologyId,
        entity_type: EntityType,
        label_property: Option<&BaseUrl>,
    ) -> Result<Option<OntologyId>, InsertionError> {
        let value_repr = repr::EntityType::from(entity_type);
        let value = serde_json::to_value(value_repr)
            .into_report()
            .change_context(InsertionError)?;

        let label_property = label_property.map(BaseUrl::as_str);

        Ok(self
            .as_client()
            .query_opt(
                r#"
                    INSERT INTO entity_types (ontology_id, schema, label_property)
                    VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING
                    RETURNING ontology_id;
                "#,
                &[&ontology_id, &value, &label_property],
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
