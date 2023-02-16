use std::error::Error;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::{FromSql, Type};
use serde::Deserialize;
use time::OffsetDateTime;
use tokio_postgres::GenericClient;
use type_system::uri::BaseUri;

use crate::{
    identifier::{
        ontology::{OntologyTypeRecordId, OntologyTypeVersion},
        time::TimeProjection,
    },
    ontology::{OntologyElementMetadata, OntologyType, OntologyTypeWithMetadata},
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        crud::Read,
        postgres::query::{Distinctness, PostgresRecord, SelectCompiler},
        query::{Filter, OntologyQueryPath},
        AsClient, PostgresStore, QueryError,
    },
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
        time_projection: &TimeProjection,
    ) -> Result<Vec<T>, QueryError> {
        let base_uri_path = <T::QueryPath<'static> as OntologyQueryPath>::base_uri();
        let version_path = <T::QueryPath<'static> as OntologyQueryPath>::version();
        let schema_path = <T::QueryPath<'static> as OntologyQueryPath>::schema();
        let updated_by_id_path = <T::QueryPath<'static> as OntologyQueryPath>::updated_by_id();
        let additional_metadata_path =
            <T::QueryPath<'static> as OntologyQueryPath>::additional_metadata();

        let mut compiler = SelectCompiler::new(time_projection);

        let base_uri_index = compiler.add_distinct_selection_with_ordering(
            &base_uri_path,
            Distinctness::Distinct,
            None,
        );
        let version_index = compiler.add_distinct_selection_with_ordering(
            &version_path,
            Distinctness::Distinct,
            None,
        );
        let schema_index = compiler.add_selection_path(&schema_path);
        let updated_by_id_path_index = compiler.add_selection_path(&updated_by_id_path);
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
                let base_uri = BaseUri::new(row.get(base_uri_index))
                    .into_report()
                    .change_context(QueryError)?;
                let version: OntologyTypeVersion = row.get(version_index);
                let updated_by_id = UpdatedById::new(row.get(updated_by_id_path_index));
                let metadata: AdditionalOntologyMetadata = row.get(additional_metadata_index);

                let record_repr: <T::OntologyType as OntologyType>::Representation =
                    serde_json::from_value(row.get(schema_index))
                        .into_report()
                        .change_context(QueryError)?;
                let record = T::OntologyType::try_from(record_repr)
                    .into_report()
                    .change_context(QueryError)?;

                let record_id = OntologyTypeRecordId { base_uri, version };
                let provenance = ProvenanceMetadata { updated_by_id };

                Ok(T::new(record, match metadata {
                    AdditionalOntologyMetadata::Owned { owned_by_id } => {
                        OntologyElementMetadata::Owned {
                            record_id,
                            provenance,
                            owned_by_id,
                        }
                    }
                    AdditionalOntologyMetadata::External { fetched_at } => {
                        OntologyElementMetadata::External {
                            record_id,
                            provenance,
                            fetched_at,
                        }
                    }
                }))
            })
            .try_collect()
            .await
    }
}
