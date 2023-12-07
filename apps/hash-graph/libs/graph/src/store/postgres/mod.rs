mod knowledge;
mod ontology;

mod migration;
mod pool;
mod query;
mod traversal_context;

use std::fmt::Debug;

use async_trait::async_trait;
use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        AccountGroupAdministratorSubject, AccountGroupRelationAndSubject, WebDataTypeViewerSubject,
        WebEntityCreatorSubject, WebEntityEditorSubject, WebEntityTypeViewerSubject,
        WebOwnerSubject, WebPropertyTypeViewerSubject, WebRelationAndSubject, WebSubjectSet,
    },
    AuthorizationApi,
};
use error_stack::{Report, Result, ResultExt};
#[cfg(hash_graph_test_environment)]
use graph_types::knowledge::{
    entity::{EntityEditionId, EntityId, EntityProperties, EntityTemporalMetadata},
    link::LinkOrder,
};
use graph_types::{
    account::{AccountGroupId, AccountId},
    ontology::{
        CustomOntologyMetadata, OntologyElementMetadata, OntologyTemporalMetadata,
        OntologyTypeRecordId, OntologyTypeVersion, PartialCustomOntologyMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordArchivedById, RecordCreatedById},
};
use postgres_types::Json;
use serde::Serialize;
#[cfg(hash_graph_test_environment)]
use temporal_versioning::{DecisionTime, Timestamp};
use temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use time::OffsetDateTime;
#[cfg(hash_graph_test_environment)]
use tokio_postgres::{binary_copy::BinaryCopyInWriter, types::Type};
use tokio_postgres::{error::SqlState, GenericClient};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataTypeReference, EntityType, EntityTypeReference, PropertyType, PropertyTypeReference,
};

pub use self::{
    pool::{AsClient, PostgresStorePool},
    traversal_context::TraversalContext,
};
#[cfg(hash_graph_test_environment)]
use crate::store::error::DeletionError;
use crate::store::{
    error::{OntologyTypeIsNotOwned, OntologyVersionDoesNotExist, VersionedUrlAlreadyExists},
    postgres::ontology::{OntologyDatabaseType, OntologyId},
    AccountStore, BaseUrlAlreadyExists, ConflictBehavior, InsertionError, QueryError, StoreError,
    UpdateError,
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

impl<C> PostgresStore<C>
where
    C: AsClient,
{
    /// Creates a new `PostgresDatabase` object.
    #[must_use]
    pub const fn new(client: C) -> Self {
        Self { client }
    }

    async fn create_base_url(
        &self,
        base_url: &BaseUrl,
        on_conflict: ConflictBehavior,
        location: OntologyLocation,
    ) -> Result<(), InsertionError> {
        match on_conflict {
            ConflictBehavior::Fail => {
                self.as_client()
                    .query(
                        "INSERT INTO base_urls (base_url) VALUES ($1);",
                        &[&base_url.as_str()],
                    )
                    .await
                    .map_err(Report::new)
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
                let created = self
                    .as_client()
                    .query_opt(
                        "
                            INSERT INTO base_urls (base_url) VALUES ($1)
                            ON CONFLICT DO NOTHING
                            RETURNING 1;
                        ",
                        &[&base_url.as_str()],
                    )
                    .await
                    .change_context(InsertionError)?
                    .is_some();

                if !created {
                    let query = match location {
                        OntologyLocation::Owned => {
                            "
                                SELECT EXISTS (SELECT 1
                                FROM ontology_owned_metadata
                                NATURAL JOIN ontology_ids
                                WHERE base_url = $1);
                            "
                        }
                        OntologyLocation::External => {
                            "
                                SELECT EXISTS (SELECT 1
                                FROM ontology_external_metadata
                                NATURAL JOIN ontology_ids
                                WHERE base_url = $1);
                            "
                        }
                    };

                    let exists_in_specified_location: bool = self
                        .as_client()
                        .query_one(query, &[&base_url.as_str()])
                        .await
                        .change_context(InsertionError)
                        .map(|row| row.get(0))?;

                    if !exists_in_specified_location {
                        return Err(Report::new(BaseUrlAlreadyExists)
                            .attach_printable(base_url.clone())
                            .change_context(InsertionError));
                    }
                }
            }
        }

        Ok(())
    }

    async fn create_ontology_id(
        &self,
        record_id: &OntologyTypeRecordId,
        on_conflict: ConflictBehavior,
    ) -> Result<Option<OntologyId>, InsertionError> {
        let query: &str = match on_conflict {
            ConflictBehavior::Skip => {
                "
                  INSERT INTO ontology_ids (
                    ontology_id,
                    base_url,
                    version
                  ) VALUES ($1, $2, $3)
                  ON CONFLICT DO NOTHING
                  RETURNING ontology_ids.ontology_id;
                "
            }
            ConflictBehavior::Fail => {
                "
                  INSERT INTO ontology_ids (
                    ontology_id,
                    base_url,
                    version
                  ) VALUES ($1, $2, $3)
                  RETURNING ontology_ids.ontology_id;
                "
            }
        };
        self.as_client()
            .query_opt(
                query,
                &[
                    &OntologyId::from_record_id(record_id),
                    &record_id.base_url.as_str(),
                    &record_id.version,
                ],
            )
            .await
            .map_err(Report::new)
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
        record_created_by_id: RecordCreatedById,
    ) -> Result<LeftClosedTemporalInterval<TransactionTime>, InsertionError> {
        let query = "
              INSERT INTO ontology_temporal_metadata (
                ontology_id,
                transaction_time,
                record_created_by_id
              ) VALUES ($1, tstzrange(now(), NULL, '[)'), $2)
              RETURNING transaction_time;
            ";

        self.as_client()
            .query_one(query, &[&ontology_id, &record_created_by_id])
            .await
            .change_context(InsertionError)
            .map(|row| row.get(0))
    }

    async fn archive_ontology_type(
        &self,
        id: &VersionedUrl,
        record_archived_by_id: RecordArchivedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        let query = "
          UPDATE ontology_temporal_metadata
          SET
            transaction_time = tstzrange(lower(transaction_time), now(), '[)'),
            record_archived_by_id = $3
          WHERE ontology_id = (
            SELECT ontology_id
            FROM ontology_ids
            WHERE base_url = $1 AND version = $2
          ) AND transaction_time @> now()
          RETURNING transaction_time;
        ";

        let optional = self
            .as_client()
            .query_opt(
                query,
                &[
                    &id.base_url.as_str(),
                    &OntologyTypeVersion::new(id.version),
                    &record_archived_by_id,
                ],
            )
            .await
            .change_context(UpdateError)?;
        if let Some(row) = optional {
            Ok(OntologyTemporalMetadata {
                transaction_time: row.get(0),
            })
        } else {
            let exists = self
                .as_client()
                .query_one(
                    "
                        SELECT EXISTS (
                            SELECT 1
                            FROM ontology_ids
                            WHERE base_url = $1 AND version = $2
                        );
                    ",
                    &[&id.base_url.as_str(), &OntologyTypeVersion::new(id.version)],
                )
                .await
                .change_context(UpdateError)?
                .get(0);

            Err(if exists {
                Report::new(VersionedUrlAlreadyExists)
                    .attach_printable(id.clone())
                    .change_context(UpdateError)
            } else {
                Report::new(OntologyVersionDoesNotExist)
                    .attach_printable(id.clone())
                    .change_context(UpdateError)
            })
        }
    }

    async fn unarchive_ontology_type(
        &self,
        id: &VersionedUrl,
        record_created_by_id: RecordCreatedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        let query = "
          INSERT INTO ontology_temporal_metadata (
            ontology_id,
            transaction_time,
            record_created_by_id
          ) VALUES (
            (SELECT ontology_id FROM ontology_ids WHERE base_url = $1 AND version = $2),
            tstzrange(now(), NULL, '[)'),
            $3
          )
          RETURNING transaction_time;
        ";

        Ok(OntologyTemporalMetadata {
            transaction_time: self
                .as_client()
                .query_one(
                    query,
                    &[
                        &id.base_url.as_str(),
                        &OntologyTypeVersion::new(id.version),
                        &record_created_by_id,
                    ],
                )
                .await
                .map_err(Report::new)
                .map_err(|report| match report.current_context().code() {
                    Some(&SqlState::EXCLUSION_VIOLATION) => report
                        .change_context(VersionedUrlAlreadyExists)
                        .attach_printable(id.clone())
                        .change_context(UpdateError),
                    Some(&SqlState::NOT_NULL_VIOLATION) => report
                        .change_context(OntologyVersionDoesNotExist)
                        .attach_printable(id.clone())
                        .change_context(UpdateError),
                    _ => report
                        .change_context(UpdateError)
                        .attach_printable(id.clone()),
                })
                .change_context(UpdateError)?
                .get(0),
        })
    }

    async fn create_ontology_owned_metadata(
        &self,
        ontology_id: OntologyId,
        owned_by_id: OwnedById,
    ) -> Result<(), InsertionError> {
        let query = "
                INSERT INTO ontology_owned_metadata (
                    ontology_id,
                    web_id
                ) VALUES ($1, $2)
            ";

        self.as_client()
            .query(query, &[&ontology_id, &owned_by_id])
            .await
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn create_ontology_external_metadata(
        &self,
        ontology_id: OntologyId,
        fetched_at: OffsetDateTime,
    ) -> Result<(), InsertionError> {
        let query = "
              INSERT INTO ontology_external_metadata (
                ontology_id,
                fetched_at
              ) VALUES ($1, $2);
            ";

        self.as_client()
            .query(query, &[&ontology_id, &fetched_at])
            .await
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
        database_type: &T,
    ) -> Result<Option<OntologyId>, InsertionError>
    where
        T: OntologyDatabaseType + Serialize + Debug + Sync,
    {
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
                &[&ontology_id, &Json(database_type)],
            )
            .await
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
        entity_type: &EntityType,
        closed_entity_type: &EntityType,
        label_property: Option<&BaseUrl>,
        icon: Option<&str>,
    ) -> Result<Option<OntologyId>, InsertionError> {
        Ok(self
            .as_client()
            .query_opt(
                "
                    INSERT INTO entity_types (
                        ontology_id,
                        schema,
                        closed_schema,
                        label_property,
                        icon
                    ) VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT DO NOTHING
                    RETURNING ontology_id;
                ",
                &[
                    &ontology_id,
                    &Json(entity_type),
                    &Json(closed_entity_type),
                    &label_property.map(BaseUrl::as_str),
                    &icon,
                ],
            )
            .await
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
                    "
                        INSERT INTO property_type_constrains_properties_on (
                            source_property_type_ontology_id,
                            target_property_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version \
                     = $3)
                        ) RETURNING target_property_type_ontology_id;
                    ",
                    &[
                        &ontology_id,
                        &property_type.url().base_url.as_str(),
                        &OntologyTypeVersion::new(property_type.url().version),
                    ],
                )
                .await
                .change_context(InsertionError)?;
        }

        for data_type in property_type.data_type_references() {
            self.as_client()
                .query_one(
                    "
                        INSERT INTO property_type_constrains_values_on (
                            source_property_type_ontology_id,
                            target_data_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version \
                     = $3)
                        ) RETURNING target_data_type_ontology_id;
                    ",
                    &[
                        &ontology_id,
                        &data_type.url().base_url.as_str(),
                        &OntologyTypeVersion::new(data_type.url().version),
                    ],
                )
                .await
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
                    "
                        INSERT INTO entity_type_constrains_properties_on (
                            source_entity_type_ontology_id,
                            target_property_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version \
                     = $3)
                        ) RETURNING source_entity_type_ontology_id;
                    ",
                    &[
                        &ontology_id,
                        &property_type.url().base_url.as_str(),
                        &OntologyTypeVersion::new(property_type.url().version),
                    ],
                )
                .await
                .change_context(InsertionError)?;
        }

        for inherits_from in entity_type.inherits_from().all_of() {
            self.as_client()
                .query_one(
                    "
                        INSERT INTO entity_type_inherits_from (
                            source_entity_type_ontology_id,
                            target_entity_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version \
                     = $3)
                        ) RETURNING target_entity_type_ontology_id;
                    ",
                    &[
                        &ontology_id,
                        &inherits_from.url().base_url.as_str(),
                        &OntologyTypeVersion::new(inherits_from.url().version),
                    ],
                )
                .await
                .change_context(InsertionError)?;
        }

        // TODO: should we check that the `link_entity_type_ref` is a link entity type?
        //   see https://app.asana.com/0/0/1203277018227719/f
        for (link_reference, destinations) in entity_type.link_mappings() {
            self.as_client()
                .query_one(
                    "
                        INSERT INTO entity_type_constrains_links_on (
                            source_entity_type_ontology_id,
                            target_entity_type_ontology_id
                        ) VALUES (
                            $1,
                            (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 AND version \
                     = $3)
                        ) RETURNING target_entity_type_ontology_id;
                    ",
                    &[
                        &ontology_id,
                        &link_reference.url().base_url.as_str(),
                        &OntologyTypeVersion::new(link_reference.url().version),
                    ],
                )
                .await
                .change_context(InsertionError)?;

            if let Some(destinations) = destinations {
                for destination in destinations {
                    self.as_client()
                        .query_one(
                            "
                                INSERT INTO entity_type_constrains_link_destinations_on (
                                source_entity_type_ontology_id,
                                target_entity_type_ontology_id
                                    ) VALUES (
                                        $1,
                                        (SELECT ontology_id FROM ontology_ids WHERE base_url = $2 \
                             AND version = $3)
                                    ) RETURNING target_entity_type_ontology_id;
                            ",
                            &[
                                &ontology_id,
                                &destination.url().base_url.as_str(),
                                &OntologyTypeVersion::new(destination.url().version),
                            ],
                        )
                        .await
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
                "
                SELECT ontology_id
                FROM ontology_ids
                WHERE base_url = $1 AND version = $2;
                ",
                &[&url.base_url.as_str(), &version],
            )
            .await
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
                .change_context(StoreError)?,
        ))
    }
}

impl PostgresStore<tokio_postgres::Transaction<'_>> {
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
        &self,
        record_created_by_id: RecordCreatedById,
        record_id: &OntologyTypeRecordId,
        custom_metadata: &PartialCustomOntologyMetadata,
        on_conflict: ConflictBehavior,
    ) -> Result<Option<(OntologyId, LeftClosedTemporalInterval<TransactionTime>)>, InsertionError>
    {
        match custom_metadata {
            PartialCustomOntologyMetadata::Owned { owned_by_id } => {
                self.create_base_url(&record_id.base_url, on_conflict, OntologyLocation::Owned)
                    .await?;
                let ontology_id = self.create_ontology_id(record_id, on_conflict).await?;
                if let Some(ontology_id) = ontology_id {
                    let transaction_time = self
                        .create_ontology_temporal_metadata(ontology_id, record_created_by_id)
                        .await?;
                    self.create_ontology_owned_metadata(ontology_id, *owned_by_id)
                        .await?;
                    Ok(Some((ontology_id, transaction_time)))
                } else {
                    Ok(None)
                }
            }
            PartialCustomOntologyMetadata::External { fetched_at } => {
                self.create_base_url(
                    &record_id.base_url,
                    ConflictBehavior::Skip,
                    OntologyLocation::External,
                )
                .await?;
                let ontology_id = self.create_ontology_id(record_id, on_conflict).await?;
                if let Some(ontology_id) = ontology_id {
                    let transaction_time = self
                        .create_ontology_temporal_metadata(ontology_id, record_created_by_id)
                        .await?;
                    self.create_ontology_external_metadata(ontology_id, *fetched_at)
                        .await?;
                    Ok(Some((ontology_id, transaction_time)))
                } else {
                    Ok(None)
                }
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
        database_type: &T,
        record_created_by_id: RecordCreatedById,
    ) -> Result<(OntologyId, OwnedById, OntologyElementMetadata), UpdateError>
    where
        T: OntologyDatabaseType + Serialize + Debug + Sync,
    {
        let url = database_type.id();
        let record_id = OntologyTypeRecordId::from(url.clone());

        let (ontology_id, owned_by_id, transaction_time) = self
            .update_owned_ontology_id(url, record_created_by_id)
            .await?;
        self.insert_with_id(ontology_id, database_type)
            .await
            .change_context(UpdateError)?;

        Ok((
            ontology_id,
            owned_by_id,
            OntologyElementMetadata {
                record_id,
                custom: CustomOntologyMetadata::Owned {
                    provenance: ProvenanceMetadata {
                        record_created_by_id,
                        record_archived_by_id: None,
                    },
                    owned_by_id,
                    temporal_versioning: OntologyTemporalMetadata { transaction_time },
                },
            },
        ))
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
    ) -> Result<
        (
            OntologyId,
            OwnedById,
            LeftClosedTemporalInterval<TransactionTime>,
        ),
        UpdateError,
    > {
        let Some(owned_by_id) = self
            .as_client()
            .query_opt(
                "
                  SELECT web_id
                  FROM ontology_owned_metadata
                  NATURAL JOIN ontology_ids
                  WHERE base_url = $1
                    AND version = $2
                  LIMIT 1 -- There might be multiple versions of the same ontology, but we only
                          -- care about the `web_id` which does not change when (un-)archiving.
                ;",
                &[&url.base_url.as_str(), &i64::from(url.version - 1)],
            )
            .await
            .change_context(UpdateError)?
            .map(|row| row.get(0))
        else {
            let exists: bool = self
                .as_client()
                .query_one(
                    "
                  SELECT EXISTS (
                    SELECT 1
                    FROM ontology_ids
                    WHERE base_url = $1
                      AND version = $2
                  );",
                    &[&url.base_url.as_str(), &i64::from(url.version - 1)],
                )
                .await
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
                ConflictBehavior::Fail,
            )
            .await
            .change_context(UpdateError)?
            .expect("ontology id should have been created");

        let transaction_time = self
            .create_ontology_temporal_metadata(ontology_id, record_created_by_id)
            .await
            .change_context(UpdateError)?;
        self.create_ontology_owned_metadata(ontology_id, owned_by_id)
            .await
            .change_context(UpdateError)?;

        Ok((ontology_id, owned_by_id, transaction_time))
    }

    /// # Errors
    ///
    /// - if the underlying client cannot commit the transaction
    pub async fn commit(self) -> Result<(), StoreError> {
        self.client.commit().await.change_context(StoreError)
    }

    /// # Errors
    ///
    /// - if the underlying client cannot rollback the transaction
    pub async fn rollback(self) -> Result<(), StoreError> {
        self.client.rollback().await.change_context(StoreError)
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
                    web_id,
                    entity_uuid
                ) FROM STDIN BINARY",
            )
            .await
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[Type::UUID, Type::UUID]);

        futures::pin_mut!(writer);
        for entity_id in entity_uuids {
            writer
                .as_mut()
                .write(&[&entity_id.owned_by_id, &entity_id.entity_uuid])
                .await
                .change_context(InsertionError)
                .attach_printable(entity_id.entity_uuid)?;
        }

        writer.finish().await.change_context(InsertionError)
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
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(sink, &[Type::UUID, Type::UUID]);

        futures::pin_mut!(writer);
        for entity_edition_id in entity_edition_ids {
            writer
                .as_mut()
                .write(&[&entity_edition_id, &entity_type_ontology_id])
                .await
                .change_context(InsertionError)?;
        }

        writer.finish().await.change_context(InsertionError)
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
                    web_id,
                    entity_uuid,
                    {left_right}_web_id,
                    {left_right}_entity_uuid
                ) FROM STDIN BINARY",
            ))
            .await
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
                .change_context(InsertionError)
                .attach_printable(entity_id.entity_uuid)?;
        }

        writer.finish().await.change_context(InsertionError)
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
                    archived BOOLEAN NOT NULL,
                    draft BOOLEAN NOT NULL
                );",
            )
            .await
            .change_context(InsertionError)?;

        let sink = self
            .client
            .copy_in(
                "COPY entity_editions_temp (
                    properties,
                    left_to_right_order,
                    right_to_left_order,
                    record_created_by_id,
                    archived,
                    draft
                ) FROM STDIN BINARY",
            )
            .await
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(
            sink,
            &[
                Type::JSONB,
                Type::INT4,
                Type::INT4,
                Type::UUID,
                Type::BOOL,
                Type::BOOL,
            ],
        );
        futures::pin_mut!(writer);
        for (properties, left_to_right_order, right_to_left_order) in entities {
            let properties = serde_json::to_value(properties).change_context(InsertionError)?;

            writer
                .as_mut()
                .write(&[
                    &properties,
                    &left_to_right_order,
                    &right_to_left_order,
                    &actor_id,
                    &false,
                    &false,
                ])
                .await
                .change_context(InsertionError)?;
        }

        writer.finish().await.change_context(InsertionError)?;

        let entity_edition_ids = self
            .client
            .query(
                "INSERT INTO entity_editions (
                    entity_edition_id,
                    properties,
                    left_to_right_order,
                    right_to_left_order,
                    record_created_by_id,
                    archived,
                    draft
                )
                SELECT
                    gen_random_uuid(),
                    properties,
                    left_to_right_order,
                    right_to_left_order,
                    record_created_by_id,
                    archived,
                    draft
                FROM entity_editions_temp
                RETURNING entity_edition_id;",
                &[],
            )
            .await
            .change_context(InsertionError)?
            .into_iter()
            .map(|row| EntityEditionId::new(row.get(0)))
            .collect();

        self.client
            .simple_query("DROP TABLE entity_editions_temp;")
            .await
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
                    web_id UUID NOT NULL,
                    entity_uuid UUID NOT NULL,
                    entity_edition_id UUID NOT NULL,
                    decision_time TIMESTAMP WITH TIME ZONE
                );",
            )
            .await
            .change_context(InsertionError)?;

        let sink = self
            .client
            .copy_in(
                "COPY entity_temporal_metadata_temp (
                    web_id,
                    entity_uuid,
                    entity_edition_id,
                    decision_time
                ) FROM STDIN BINARY",
            )
            .await
            .change_context(InsertionError)?;
        let writer = BinaryCopyInWriter::new(
            sink,
            &[Type::UUID, Type::UUID, Type::UUID, Type::TIMESTAMPTZ],
        );
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
                .change_context(InsertionError)?;
        }

        writer.finish().await.change_context(InsertionError)?;

        let entity_versions = self
            .client
            .query(
                "INSERT INTO entity_temporal_metadata (
                    web_id,
                    entity_uuid,
                    entity_edition_id,
                    decision_time,
                    transaction_time
                ) SELECT
                    web_id,
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
            .change_context(InsertionError)?;

        Ok(entity_versions)
    }
}

#[async_trait]
impl<C: AsClient> AccountStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, _authorization_api))]
    async fn insert_account_id<A: AuthorizationApi + Send + Sync>(
        &mut self,
        _actor_id: AccountId,
        _authorization_api: &mut A,
        account_id: AccountId,
    ) -> Result<(), InsertionError> {
        self.as_client()
            .query(
                "INSERT INTO accounts (account_id) VALUES ($1);",
                &[&account_id],
            )
            .await
            .change_context(InsertionError)
            .attach_printable(account_id)?;
        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn insert_account_group_id<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        account_group_id: AccountGroupId,
    ) -> Result<(), InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        transaction
            .as_client()
            .query(
                "INSERT INTO account_groups (account_group_id) VALUES ($1);",
                &[&account_group_id],
            )
            .await
            .change_context(InsertionError)
            .attach_printable(account_group_id)?;

        authorization_api
            .modify_account_group_relations([(
                ModifyRelationshipOperation::Create,
                account_group_id,
                AccountGroupRelationAndSubject::Administrator {
                    subject: AccountGroupAdministratorSubject::Account { id: actor_id },
                    level: 0,
                },
            )])
            .await
            .change_context(InsertionError)?;

        if let Err(mut error) = transaction.commit().await.change_context(InsertionError) {
            if let Err(auth_error) = authorization_api
                .modify_account_group_relations([(
                    ModifyRelationshipOperation::Delete,
                    account_group_id,
                    AccountGroupRelationAndSubject::Administrator {
                        subject: AccountGroupAdministratorSubject::Account { id: actor_id },
                        level: 0,
                    },
                )])
                .await
                .change_context(InsertionError)
            {
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            Ok(())
        }
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn insert_web_id<A: AuthorizationApi + Send + Sync>(
        &mut self,
        _actor_id: AccountId,
        authorization_api: &mut A,
        owned_by_id: OwnedById,
        owner: WebOwnerSubject,
    ) -> Result<(), InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        transaction
            .as_client()
            .query("INSERT INTO webs (web_id) VALUES ($1);", &[&owned_by_id])
            .await
            .change_context(InsertionError)
            .attach_printable(owned_by_id)?;

        let mut relationships = vec![
            WebRelationAndSubject::Owner {
                subject: owner,
                level: 0,
            },
            WebRelationAndSubject::EntityTypeViewer {
                subject: WebEntityTypeViewerSubject::Public,
                level: 0,
            },
            WebRelationAndSubject::PropertyTypeViewer {
                subject: WebPropertyTypeViewerSubject::Public,
                level: 0,
            },
            WebRelationAndSubject::DataTypeViewer {
                subject: WebDataTypeViewerSubject::Public,
                level: 0,
            },
        ];
        if let WebOwnerSubject::AccountGroup { id } = owner {
            relationships.extend([
                WebRelationAndSubject::EntityCreator {
                    subject: WebEntityCreatorSubject::AccountGroup {
                        id,
                        set: WebSubjectSet::Member,
                    },
                    level: 0,
                },
                WebRelationAndSubject::EntityEditor {
                    subject: WebEntityEditorSubject::AccountGroup {
                        id,
                        set: WebSubjectSet::Member,
                    },
                    level: 0,
                },
                // TODO: Add ontology type creators
            ]);
        }

        authorization_api
            .modify_web_relations(
                relationships
                    .clone()
                    .into_iter()
                    .map(|relation_and_subject| {
                        (
                            ModifyRelationshipOperation::Create,
                            owned_by_id,
                            relation_and_subject,
                        )
                    }),
            )
            .await
            .change_context(InsertionError)?;

        if let Err(mut error) = transaction.commit().await.change_context(InsertionError) {
            if let Err(auth_error) = authorization_api
                .modify_web_relations(relationships.into_iter().map(|relation_and_subject| {
                    (
                        ModifyRelationshipOperation::Delete,
                        owned_by_id,
                        relation_and_subject,
                    )
                }))
                .await
                .change_context(InsertionError)
            {
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            Ok(())
        }
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn has_account(&self, account_id: AccountId) -> Result<bool, QueryError> {
        Ok(self
            .as_client()
            .query_one(
                "
                    SELECT EXISTS (
                        SELECT 1
                        FROM accounts
                        WHERE account_id = $1
                    );
                ",
                &[&account_id],
            )
            .await
            .change_context(QueryError)?
            .get(0))
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn identify_owned_by_id(
        &self,
        owned_by_id: OwnedById,
    ) -> Result<WebOwnerSubject, QueryError> {
        let row = self
            .as_client()
            .query_one(
                "
                    SELECT EXISTS (
                        SELECT 1
                        FROM accounts
                        WHERE account_id = $1
                    ), EXISTS (
                        SELECT 1
                        FROM account_groups
                        WHERE account_group_id = $1
                    );
                ",
                &[&owned_by_id],
            )
            .await
            .change_context(QueryError)?;

        match (row.get(0), row.get(1)) {
            (false, false) => Err(Report::new(QueryError)
                .attach_printable("Record does not exist")
                .attach_printable(owned_by_id)),
            (true, false) => Ok(WebOwnerSubject::Account {
                id: AccountId::new(owned_by_id.into_uuid()),
            }),
            (false, true) => Ok(WebOwnerSubject::AccountGroup {
                id: AccountGroupId::new(owned_by_id.into_uuid()),
            }),
            (true, true) => Err(Report::new(QueryError)
                .attach_printable("Record exists in both accounts and account_groups")
                .attach_printable(owned_by_id)),
        }
    }
}

impl<C: AsClient> PostgresStore<C> {
    #[tracing::instrument(level = "trace", skip(self, _authorization_api))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_accounts<A: AuthorizationApi + Sync>(
        &mut self,
        actor_id: AccountId,
        _authorization_api: &A,
    ) -> Result<(), DeletionError> {
        self.as_client()
            .client()
            .simple_query("DELETE FROM webs;")
            .await
            .change_context(DeletionError)?;
        self.as_client()
            .client()
            .simple_query("DELETE FROM accounts;")
            .await
            .change_context(DeletionError)?;
        self.as_client()
            .client()
            .simple_query("DELETE FROM account_groups;")
            .await
            .change_context(DeletionError)?;

        Ok(())
    }
}
