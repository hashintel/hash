use std::{fmt::Debug, str::FromStr};

use async_trait::async_trait;
use error_stack::{Context, IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;

use crate::{
    identifier::ontology::OntologyTypeEditionId,
    ontology::{OntologyElementMetadata, PersistedOntologyType},
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        crud::Read,
        postgres::{
            ontology::OntologyDatabaseType,
            query::{Distinctness, PostgresQueryRecord, SelectCompiler},
        },
        query::{Filter, OntologyPath, QueryRecord},
        AsClient, PostgresStore, QueryError,
    },
};

#[async_trait]
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    T: PersistedOntologyType
        + for<'q> PostgresQueryRecord<Path<'q>: Debug + Send + Sync + OntologyPath>
        + Send
        + 'static,
    T::Inner: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>,
{
    async fn read<'f: 'q, 'q>(&self, filter: &'f Filter<'q, T>) -> Result<Vec<T>, QueryError> {
        let versioned_uri_path = <<T as QueryRecord>::Path<'q> as OntologyPath>::versioned_uri();
        let schema_path = <<T as QueryRecord>::Path<'q> as OntologyPath>::schema();
        let owned_by_id_path = <<T as QueryRecord>::Path<'q> as OntologyPath>::owned_by_id();
        let updated_by_id_path = <<T as QueryRecord>::Path<'q> as OntologyPath>::updated_by_id();

        let mut compiler = SelectCompiler::new();

        let versioned_uri_index = compiler.add_distinct_selection_with_ordering(
            &versioned_uri_path,
            Distinctness::Distinct,
            None,
        );
        let schema_index = compiler.add_selection_path(&schema_path);
        let owned_by_id_index = compiler.add_selection_path(&owned_by_id_path);
        let updated_by_id_path_index = compiler.add_selection_path(&updated_by_id_path);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        self.as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .into_report()
            .change_context(QueryError)?
            .map(|row| row.into_report().change_context(QueryError))
            .and_then(|row| async move {
                let versioned_uri = VersionedUri::from_str(row.get(versioned_uri_index))
                    .into_report()
                    .change_context(QueryError)?;
                let record = <T::Inner>::try_from(row.get::<_, serde_json::Value>(schema_index))
                    .into_report()
                    .change_context(QueryError)?;
                let owned_by_id = OwnedById::new(row.get(owned_by_id_index));
                let updated_by_id = UpdatedById::new(row.get(updated_by_id_path_index));

                Ok(T::new(
                    record,
                    OntologyElementMetadata::new(
                        OntologyTypeEditionId::from(&versioned_uri),
                        ProvenanceMetadata::new(updated_by_id),
                        owned_by_id,
                    ),
                ))
            })
            .try_collect()
            .await
    }
}
