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
    identifier::ontology::{OntologyTypeRecordId, OntologyTypeVersion},
    ontology::{
        ExternalOntologyElementMetadata, OntologyElementMetadata, OntologyType,
        OntologyTypeWithMetadata, OwnedOntologyElementMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
    store::{
        crud::Read,
        postgres::query::{Distinctness, PostgresRecord, SelectCompiler},
        query::{Filter, OntologyQueryPath},
        AsClient, PostgresStore, QueryError,
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
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    T: OntologyTypeWithMetadata + PostgresRecord,
    for<'p> T::QueryPath<'p>: OntologyQueryPath,
{
    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<T>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<Vec<T>, QueryError> {
        let base_url_path = <T::QueryPath<'static> as OntologyQueryPath>::base_url();
        let version_path = <T::QueryPath<'static> as OntologyQueryPath>::version();
        let schema_path = <T::QueryPath<'static> as OntologyQueryPath>::schema();
        let record_created_by_id_path =
            <T::QueryPath<'static> as OntologyQueryPath>::record_created_by_id();
        let additional_metadata_path =
            <T::QueryPath<'static> as OntologyQueryPath>::additional_metadata();

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

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        self.as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .into_report()
            .change_context(QueryError)?
            .map(|row| row.into_report().change_context(QueryError))
            .and_then(|row| async move {
                let base_url = BaseUrl::new(row.get(base_url_index))
                    .into_report()
                    .change_context(QueryError)?;
                let version: OntologyTypeVersion = row.get(version_index);
                let record_created_by_id =
                    RecordCreatedById::new(row.get(record_created_by_id_path_index));
                let metadata: AdditionalOntologyMetadata = row.get(additional_metadata_index);

                let record_repr: <T::OntologyType as OntologyType>::Representation =
                    serde_json::from_value(row.get(schema_index))
                        .into_report()
                        .change_context(QueryError)?;
                let record = T::OntologyType::try_from(record_repr)
                    .into_report()
                    .change_context(QueryError)?;

                let record_id = OntologyTypeRecordId { base_url, version };
                let provenance = ProvenanceMetadata::new(record_created_by_id);

                Ok(T::new(record, match metadata {
                    AdditionalOntologyMetadata::Owned { owned_by_id } => {
                        OntologyElementMetadata::Owned(OwnedOntologyElementMetadata::new(
                            record_id,
                            provenance,
                            owned_by_id,
                        ))
                    }
                    AdditionalOntologyMetadata::External { fetched_at } => {
                        OntologyElementMetadata::External(ExternalOntologyElementMetadata::new(
                            record_id, provenance, fetched_at,
                        ))
                    }
                }))
            })
            .try_collect()
            .await
    }
}
