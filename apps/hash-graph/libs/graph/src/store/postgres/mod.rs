mod crud;
mod knowledge;
mod migration;
mod ontology;
mod pool;
pub(crate) mod query;
mod traversal_context;

use alloc::sync::Arc;
use core::{fmt::Debug, hash::Hash};
use std::collections::HashMap;

use authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    schema::{
        AccountGroupAdministratorSubject, AccountGroupRelationAndSubject, WebDataTypeViewerSubject,
        WebEntityCreatorSubject, WebEntityEditorSubject, WebEntityTypeViewerSubject,
        WebOwnerSubject, WebPropertyTypeViewerSubject, WebRelationAndSubject, WebSubjectSet,
    },
};
use error_stack::{Report, Result, ResultExt as _};
use graph_types::{
    account::{AccountGroupId, AccountId, EditionArchivedById},
    ontology::{
        DataTypeId, OntologyEditionProvenance, OntologyProvenance, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, OntologyTypeRecordId,
    },
    owned_by_id::OwnedById,
};
use hash_graph_store::{
    ConflictBehavior,
    account::{
        AccountGroupInsertionError, AccountInsertionError, AccountStore,
        InsertAccountGroupIdParams, InsertAccountIdParams, InsertWebIdParams, QueryWebError,
        WebInsertionError,
    },
};
use postgres_types::Json;
use temporal_client::TemporalClient;
use temporal_versioning::{LeftClosedTemporalInterval, TransactionTime};
use time::OffsetDateTime;
use tokio_postgres::{GenericClient as _, error::SqlState};
use type_system::{
    Valid,
    schema::{
        ClosedDataTypeMetadata, ClosedEntityType, Conversions, DataType, DataTypeReference,
        EntityType, EntityTypeReference, PropertyType, PropertyTypeReference,
    },
    url::{BaseUrl, OntologyTypeVersion, VersionedUrl},
};

pub use self::{
    ontology::OntologyId,
    pool::{AsClient, PostgresStorePool},
    query::CursorField,
    traversal_context::TraversalContext,
};
use crate::store::{
    BaseUrlAlreadyExists, InsertionError, QueryError, StoreError, UpdateError,
    error::{
        DeletionError, OntologyTypeIsNotOwned, OntologyVersionDoesNotExist,
        VersionedUrlAlreadyExists,
    },
};

/// A Postgres-backed store
pub struct PostgresStore<C, A> {
    client: C,
    pub authorization_api: A,
    pub temporal_client: Option<Arc<TemporalClient>>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum OntologyLocation {
    Owned,
    External,
}

#[derive(Debug)]
pub struct ResponseCountMap<T> {
    map: HashMap<T, usize>,
}

impl<T> Default for ResponseCountMap<T> {
    fn default() -> Self {
        Self {
            map: HashMap::new(),
        }
    }
}

impl<T> ResponseCountMap<T>
where
    T: Eq + Hash + Clone,
{
    pub fn increment(&mut self, key: &T) {
        *self
            .map
            .raw_entry_mut()
            .from_key(key)
            .or_insert(key.clone(), 0)
            .1 += 1;
    }
}

#[expect(
    clippy::implicit_hasher,
    reason = "The hasher should not be exposed from `ResponseCountMap`"
)]
impl<T> From<ResponseCountMap<T>> for HashMap<T, usize> {
    fn from(map: ResponseCountMap<T>) -> Self {
        map.map
    }
}

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: Send + Sync,
{
    /// Creates a new `PostgresDatabase` object.
    #[must_use]
    pub const fn new(
        client: C,
        authorization_api: A,
        temporal_client: Option<Arc<TemporalClient>>,
    ) -> Self {
        Self {
            client,
            authorization_api,
            temporal_client,
        }
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
                    .query("INSERT INTO base_urls (base_url) VALUES ($1);", &[
                        &base_url.as_str(),
                    ])
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
            .query_opt(query, &[
                &OntologyId::from_record_id(record_id),
                &record_id.base_url.as_str(),
                &record_id.version,
            ])
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
        provenance: &OntologyEditionProvenance,
    ) -> Result<LeftClosedTemporalInterval<TransactionTime>, InsertionError> {
        let query = "
              INSERT INTO ontology_temporal_metadata (
                ontology_id,
                transaction_time,
                provenance
              ) VALUES ($1, tstzrange(now(), NULL, '[)'), $2)
              RETURNING transaction_time;
            ";

        self.as_client()
            .query_one(query, &[&ontology_id, &provenance])
            .await
            .change_context(InsertionError)
            .map(|row| row.get(0))
    }

    async fn archive_ontology_type(
        &self,
        id: &VersionedUrl,
        archived_by_id: EditionArchivedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        let query = "
          UPDATE ontology_temporal_metadata
          SET
            transaction_time = tstzrange(lower(transaction_time), now(), '[)'),
            provenance = provenance || JSONB_BUILD_OBJECT(
                'archivedBy', $3::UUID
            )
          WHERE ontology_id = (
            SELECT ontology_id
            FROM ontology_ids
            WHERE base_url = $1 AND version = $2
          ) AND transaction_time @> now()
          RETURNING transaction_time;
        ";

        let optional = self
            .as_client()
            .query_opt(query, &[&id.base_url, &id.version, &archived_by_id])
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
                    &[&id.base_url.as_str(), &id.version],
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
        provenance: &OntologyEditionProvenance,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        let query = "
          INSERT INTO ontology_temporal_metadata (
            ontology_id,
            transaction_time,
            provenance
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
                .query_one(query, &[&id.base_url, &id.version, &provenance])
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

    /// Inserts a [`DataType`] identified by [`OntologyId`], and associated with an
    /// [`OwnedById`], and [`EditionCreatedById`] into the database.
    ///
    /// [`EditionCreatedById`]: graph_types::account::EditionCreatedById
    /// [`DataType`]: type_system::schema::DataType
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_data_type_with_id(
        &self,
        ontology_id: DataTypeId,
        data_type: &Valid<DataType>,
    ) -> Result<Option<OntologyId>, InsertionError> {
        let ontology_id = self
            .as_client()
            .query_opt(
                "
                    INSERT INTO data_types (
                        ontology_id,
                        schema
                    ) VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                    RETURNING ontology_id;
                ",
                &[&ontology_id, data_type],
            )
            .await
            .change_context(InsertionError)?
            .map(|row| row.get(0));

        Ok(ontology_id)
    }

    #[tracing::instrument(level = "debug", skip(self))]
    pub async fn insert_data_type_references(
        &self,
        ontology_id: DataTypeId,
        metadata: &ClosedDataTypeMetadata,
    ) -> Result<(), InsertionError> {
        for (target, &depth) in &metadata.inheritance_depths {
            self.as_client()
                .query(
                    "
                        INSERT INTO data_type_inherits_from (
                            source_data_type_ontology_id,
                            target_data_type_ontology_id,
                            depth
                        ) VALUES (
                            $1,
                            $2,
                            $3
                        );
                    ",
                    &[
                        &ontology_id,
                        &DataTypeId::from_url(target),
                        &i32::try_from(depth).change_context(InsertionError)?,
                    ],
                )
                .await
                .change_context(InsertionError)?;
        }

        Ok(())
    }

    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_data_type_conversion(
        &self,
        ontology_id: DataTypeId,
        target_data_type: &BaseUrl,
        conversions: &Conversions,
    ) -> Result<(), InsertionError> {
        self.as_client()
            .query(
                r#"
                    INSERT INTO data_type_conversions (
                        "source_data_type_ontology_id",
                        "target_data_type_base_url",
                        "from",
                        "into"
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        $4
                    );
                "#,
                &[
                    &ontology_id,
                    &target_data_type,
                    &Json(&conversions.from),
                    &Json(&conversions.to),
                ],
            )
            .await
            .change_context(InsertionError)?;

        Ok(())
    }

    /// Inserts a [`PropertyType`] identified by [`OntologyId`], and associated with an
    /// [`OwnedById`], and [`EditionCreatedById`] into the database.
    ///
    /// [`EditionCreatedById`]: graph_types::account::EditionCreatedById
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_property_type_with_id(
        &self,
        ontology_id: OntologyId,
        property_type: &Valid<PropertyType>,
    ) -> Result<Option<OntologyId>, InsertionError> {
        Ok(self
            .as_client()
            .query_opt(
                "
                    INSERT INTO property_types (
                        ontology_id,
                        schema
                    ) VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                    RETURNING ontology_id;
                ",
                &[&ontology_id, property_type],
            )
            .await
            .change_context(InsertionError)?
            .map(|row| row.get(0)))
    }

    /// Inserts a [`EntityType`] identified by [`OntologyId`], and associated with an
    /// [`OwnedById`], [`EditionCreatedById`], and the optional label property, into the database.
    ///
    /// [`EditionCreatedById`]: graph_types::account::EditionCreatedById
    ///
    /// # Errors
    ///
    /// - if inserting failed.
    #[tracing::instrument(level = "debug", skip(self))]
    async fn insert_entity_type_with_id(
        &self,
        ontology_id: OntologyId,
        entity_type: &Valid<EntityType>,
        closed_entity_type: &Valid<ClosedEntityType>,
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
                    entity_type,
                    closed_entity_type,
                    &label_property,
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
                        &property_type.url.base_url,
                        &property_type.url.version,
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
                        &data_type.url.base_url,
                        &data_type.url.version,
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
                        &property_type.url.base_url,
                        &property_type.url.version,
                    ],
                )
                .await
                .change_context(InsertionError)?;
        }

        for inherits_from in &entity_type.all_of {
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
                        &inherits_from.url.base_url,
                        &inherits_from.url.version,
                    ],
                )
                .await
                .change_context(InsertionError)?;
        }

        // TODO: should we check that the `link_entity_type_ref` is a link entity type?
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
                        &link_reference.url.base_url,
                        &link_reference.url.version,
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
                                &destination.url.base_url,
                                &destination.url.version,
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
            ids.push(self.ontology_id_by_url(&reference.url).await?);
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
            ids.push(self.ontology_id_by_url(&reference.url).await?);
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
            ids.push(self.ontology_id_by_url(&reference.url).await?);
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
        Ok(self
            .client
            .as_client()
            .query_one(
                "
                SELECT ontology_id
                FROM ontology_ids
                WHERE base_url = $1 AND version = $2;
                ",
                &[&url.base_url, &url.version],
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
    ) -> Result<PostgresStore<tokio_postgres::Transaction<'_>, &'_ mut A>, StoreError> {
        Ok(PostgresStore::new(
            self.client
                .as_mut_client()
                .transaction()
                .await
                .change_context(StoreError)?,
            &mut self.authorization_api,
            self.temporal_client.clone(),
        ))
    }
}

impl<A> PostgresStore<tokio_postgres::Transaction<'_>, A>
where
    A: Send + Sync,
{
    /// Inserts the specified ontology metadata.
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
        record_id: &OntologyTypeRecordId,
        classification: &OntologyTypeClassificationMetadata,
        on_conflict: ConflictBehavior,
        provenance: &OntologyProvenance,
    ) -> Result<Option<(OntologyId, OntologyTemporalMetadata)>, InsertionError> {
        match classification {
            OntologyTypeClassificationMetadata::Owned { owned_by_id } => {
                self.create_base_url(&record_id.base_url, on_conflict, OntologyLocation::Owned)
                    .await?;
                let ontology_id = self.create_ontology_id(record_id, on_conflict).await?;
                if let Some(ontology_id) = ontology_id {
                    let transaction_time = self
                        .create_ontology_temporal_metadata(ontology_id, &provenance.edition)
                        .await?;
                    self.create_ontology_owned_metadata(ontology_id, *owned_by_id)
                        .await?;
                    Ok(Some((ontology_id, OntologyTemporalMetadata {
                        transaction_time,
                    })))
                } else {
                    Ok(None)
                }
            }
            OntologyTypeClassificationMetadata::External { fetched_at } => {
                self.create_base_url(
                    &record_id.base_url,
                    ConflictBehavior::Skip,
                    OntologyLocation::External,
                )
                .await?;
                let ontology_id = self.create_ontology_id(record_id, on_conflict).await?;
                if let Some(ontology_id) = ontology_id {
                    let transaction_time = self
                        .create_ontology_temporal_metadata(ontology_id, &provenance.edition)
                        .await?;
                    self.create_ontology_external_metadata(ontology_id, *fetched_at)
                        .await?;
                    Ok(Some((ontology_id, OntologyTemporalMetadata {
                        transaction_time,
                    })))
                } else {
                    Ok(None)
                }
            }
        }
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
        provenance: &OntologyEditionProvenance,
    ) -> Result<(OntologyId, OwnedById, OntologyTemporalMetadata), UpdateError> {
        let previous_version = OntologyTypeVersion::new(
            url.version
                .inner()
                .checked_sub(1)
                .ok_or(UpdateError)
                .attach_printable(
                    "The version of the data type is already at the lowest possible value",
                )?,
        );
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
                &[&url.base_url, &previous_version],
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
                    &[&url.base_url, &previous_version],
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
            .create_ontology_temporal_metadata(ontology_id, provenance)
            .await
            .change_context(UpdateError)?;
        self.create_ontology_owned_metadata(ontology_id, owned_by_id)
            .await
            .change_context(UpdateError)?;

        Ok((ontology_id, owned_by_id, OntologyTemporalMetadata {
            transaction_time,
        }))
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
}

impl<C: AsClient, A: AuthorizationApi> AccountStore for PostgresStore<C, A> {
    #[tracing::instrument(level = "info", skip(self))]
    async fn insert_account_id(
        &mut self,
        actor_id: AccountId,
        params: InsertAccountIdParams,
    ) -> Result<(), AccountInsertionError> {
        self.as_client()
            .query("INSERT INTO accounts (account_id) VALUES ($1);", &[
                &params.account_id
            ])
            .await
            .change_context(AccountInsertionError)
            .attach_printable(params.account_id)?;
        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn insert_account_group_id(
        &mut self,
        actor_id: AccountId,
        params: InsertAccountGroupIdParams,
    ) -> Result<(), AccountGroupInsertionError> {
        let transaction = self
            .transaction()
            .await
            .change_context(AccountGroupInsertionError)?;

        transaction
            .as_client()
            .query(
                "INSERT INTO account_groups (account_group_id) VALUES ($1);",
                &[&params.account_group_id],
            )
            .await
            .change_context(AccountGroupInsertionError)
            .attach_printable(params.account_group_id)?;

        transaction
            .authorization_api
            .modify_account_group_relations([(
                ModifyRelationshipOperation::Create,
                params.account_group_id,
                AccountGroupRelationAndSubject::Administrator {
                    subject: AccountGroupAdministratorSubject::Account { id: actor_id },
                    level: 0,
                },
            )])
            .await
            .change_context(AccountGroupInsertionError)?;

        if let Err(error) = transaction
            .commit()
            .await
            .change_context(AccountGroupInsertionError)
        {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_account_group_relations([(
                    ModifyRelationshipOperation::Delete,
                    params.account_group_id,
                    AccountGroupRelationAndSubject::Administrator {
                        subject: AccountGroupAdministratorSubject::Account { id: actor_id },
                        level: 0,
                    },
                )])
                .await
                .change_context(AccountGroupInsertionError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(AccountGroupInsertionError))
        } else {
            Ok(())
        }
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn insert_web_id(
        &mut self,
        actor_id: AccountId,
        params: InsertWebIdParams,
    ) -> Result<(), WebInsertionError> {
        let transaction = self.transaction().await.change_context(WebInsertionError)?;

        transaction
            .as_client()
            .query("INSERT INTO webs (web_id) VALUES ($1);", &[
                &params.owned_by_id
            ])
            .await
            .change_context(WebInsertionError)
            .attach_printable(params.owned_by_id)?;

        let mut relationships = vec![
            WebRelationAndSubject::Owner {
                subject: params.owner,
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
        if let WebOwnerSubject::AccountGroup { id } = params.owner {
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

        transaction
            .authorization_api
            .modify_web_relations(
                relationships
                    .clone()
                    .into_iter()
                    .map(|relation_and_subject| {
                        (
                            ModifyRelationshipOperation::Create,
                            params.owned_by_id,
                            relation_and_subject,
                        )
                    }),
            )
            .await
            .change_context(WebInsertionError)?;

        if let Err(error) = transaction.commit().await.change_context(WebInsertionError) {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_web_relations(relationships.into_iter().map(|relation_and_subject| {
                    (
                        ModifyRelationshipOperation::Delete,
                        params.owned_by_id,
                        relation_and_subject,
                    )
                }))
                .await
                .change_context(WebInsertionError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(WebInsertionError))
        } else {
            Ok(())
        }
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn identify_owned_by_id(
        &self,
        owned_by_id: OwnedById,
    ) -> Result<WebOwnerSubject, QueryWebError> {
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
            .change_context(QueryWebError)?;

        match (row.get(0), row.get(1)) {
            (false, false) => Err(Report::new(QueryWebError)
                .attach_printable("Record does not exist")
                .attach_printable(owned_by_id)),
            (true, false) => Ok(WebOwnerSubject::Account {
                id: AccountId::new(owned_by_id.into_uuid()),
            }),
            (false, true) => Ok(WebOwnerSubject::AccountGroup {
                id: AccountGroupId::new(owned_by_id.into_uuid()),
            }),
            (true, true) => Err(Report::new(QueryWebError)
                .attach_printable("Record exists in both accounts and account_groups")
                .attach_printable(owned_by_id)),
        }
    }
}

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: Send + Sync,
{
    #[tracing::instrument(level = "trace", skip(self))]
    pub async fn delete_accounts(&mut self, actor_id: AccountId) -> Result<(), DeletionError> {
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
