use std::error::Error;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::{FromSql, Type};
use serde::Deserialize;
use time::OffsetDateTime;
use tokio_postgres::GenericClient;
use type_system::url::BaseUrl;

use crate::{
    identifier::ontology::OntologyTypeRecordId,
    ontology::{
        ExternalOntologyElementMetadata, OntologyElementMetadata, OntologyType,
        OntologyTypeWithMetadata, OwnedOntologyElementMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
    store::{
        crud::Read,
        postgres::query::{Distinctness, PostgresRecord, SelectCompiler},
        query::{Filter, OntologyQueryPath},
        test_graph::{
            CustomOntologyMetadata, OntologyTemporalMetadata, OntologyTypeMetadata,
            OntologyTypeRecord,
        },
        AsClient, PostgresStore, QueryError, Record,
    },
    subgraph::temporal_axes::QueryTemporalAxes,
};

#[derive(Deserialize)]
#[serde(untagged)]
enum AdditionalOntologyMetadata {
    Owned {
        owned_by_id: OwnedById,
    },
    External {
        #[serde(with = "time::serde::iso8601")]
        fetched_at: OffsetDateTime,
    },
}

impl<'a> FromSql<'a> for AdditionalOntologyMetadata {
    fn from_sql(
        ty: &Type,
        raw: &'a [u8],
    ) -> std::result::Result<Self, Box<dyn Error + Sync + Send>> {
        let value = serde_json::Value::from_sql(ty, raw)?;
        Ok(serde_json::from_value(value)?)
    }

    fn accepts(ty: &Type) -> bool {
        serde_json::Value::accepts(ty)
    }
}

#[async_trait]
impl<C: AsClient, T> Read<OntologyTypeRecord<T>> for PostgresStore<C>
where
    T: OntologyType<WithMetadata: PostgresRecord, Representation: Send>,
    for<'p> <T::WithMetadata as Record>::QueryPath<'p>: OntologyQueryPath,
{
    type Record = T::WithMetadata;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Vec<OntologyTypeRecord<T>>, QueryError> {
        let base_url_path =
            <<Self::Record as Record>::QueryPath<'static> as OntologyQueryPath>::base_url();
        let version_path =
            <<Self::Record as Record>::QueryPath<'static> as OntologyQueryPath>::version();
        let schema_path =
            <<Self::Record as Record>::QueryPath<'static> as OntologyQueryPath>::schema();
        let record_created_by_id_path =
            <<Self::Record as Record>::QueryPath<'static> as OntologyQueryPath>::record_created_by_id();
        let additional_metadata_path =
            <<Self::Record as Record>::QueryPath<'static> as OntologyQueryPath>::additional_metadata();
        let transaction_time_path =
            <<Self::Record as Record>::QueryPath<'static> as OntologyQueryPath>::transaction_time();

        let mut compiler = SelectCompiler::new(temporal_axes);

        let base_url_index = compiler.add_distinct_selection_with_ordering(
            &base_url_path,
            Distinctness::Distinct,
            None,
        );
        let version_index = compiler.add_distinct_selection_with_ordering(
            &version_path,
            Distinctness::Distinct,
            None,
        );
        let schema_index = compiler.add_selection_path(&schema_path);
        let record_created_by_id_path_index =
            compiler.add_selection_path(&record_created_by_id_path);
        let additional_metadata_index = compiler.add_selection_path(&additional_metadata_path);
        let transaction_time_index = compiler.add_selection_path(&transaction_time_path);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        self.as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .into_report()
            .change_context(QueryError)?
            .map(|row| row.into_report().change_context(QueryError))
            .and_then(|row| async move {
                let additional_metadata: AdditionalOntologyMetadata =
                    row.get(additional_metadata_index);

                let provenance = ProvenanceMetadata::new(RecordCreatedById::new(
                    row.get(record_created_by_id_path_index),
                ));
                let temporal_versioning = OntologyTemporalMetadata {
                    transaction_time: row.get(transaction_time_index),
                };
                let (owned_by_id, fetched_at) = match additional_metadata {
                    AdditionalOntologyMetadata::Owned { owned_by_id } => (Some(owned_by_id), None),
                    AdditionalOntologyMetadata::External { fetched_at } => (None, Some(fetched_at)),
                };

                Ok(OntologyTypeRecord {
                    schema: serde_json::from_value(row.get(schema_index))
                        .into_report()
                        .change_context(QueryError)?,
                    metadata: OntologyTypeMetadata {
                        record_id: OntologyTypeRecordId {
                            base_url: BaseUrl::new(row.get(base_url_index))
                                .into_report()
                                .change_context(QueryError)?,
                            version: row.get(version_index),
                        },
                        custom: CustomOntologyMetadata {
                            provenance: Some(provenance),
                            temporal_versioning: Some(temporal_versioning),
                            owned_by_id,
                            fetched_at,
                        },
                    },
                })
            })
            .try_collect()
            .await
    }
}

#[async_trait]
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    Self: Read<OntologyTypeRecord<T::OntologyType>, Record = T>,
    T: OntologyTypeWithMetadata,
{
    type Record = T;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<T>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Vec<T>, QueryError> {
        Read::<OntologyTypeRecord<T::OntologyType>>::read(self, filter, temporal_axes)
            .await?
            .into_iter()
            .map(|record| {
                let provenance = record.metadata.custom.provenance.unwrap_or_else(|| {
                    unreachable!(
                        "`OntologyTypeRecord` should always have provenance metadata if it is \
                         read from the store"
                    )
                });

                let metadata = match (
                    record.metadata.custom.owned_by_id,
                    record.metadata.custom.fetched_at,
                ) {
                    (Some(owned_by_id), None) => {
                        OntologyElementMetadata::Owned(OwnedOntologyElementMetadata::new(
                            record.metadata.record_id,
                            provenance,
                            owned_by_id,
                        ))
                    }
                    (None, Some(fetched_at)) => {
                        OntologyElementMetadata::External(ExternalOntologyElementMetadata::new(
                            record.metadata.record_id,
                            provenance,
                            fetched_at,
                        ))
                    }
                    (Some(_), Some(_)) => unreachable!(
                        "Ontology type record has both `owned_by_id` and `fetched_at` metadata"
                    ),
                    (None, None) => unreachable!(
                        "Ontology type record has neither `owned_by_id` nor `fetched_at` metadata"
                    ),
                };

                Ok(T::new(
                    record
                        .schema
                        .try_into()
                        .into_report()
                        .change_context(QueryError)?,
                    metadata,
                ))
            })
            .collect()
    }
}
