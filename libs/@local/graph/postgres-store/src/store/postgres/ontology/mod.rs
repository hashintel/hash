mod data_type;
mod entity_type;
mod property_type;
mod read;

use alloc::borrow::Cow;
use core::convert::identity;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::{
    data_type::DataTypeQueryPath,
    entity_type::EntityTypeQueryPath,
    filter::Parameter,
    property_type::PropertyTypeQueryPath,
    query::{Ordering, Sorting as _, VersionedUrlSorting},
    subgraph::temporal_axes::QueryTemporalAxes,
};
use serde::Deserialize;
use time::OffsetDateTime;
use tokio_postgres::{Row, Transaction};
use tracing::Instrument as _;
use type_system::{
    ontology::{
        DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata,
        id::{BaseUrl, OntologyTypeUuid, VersionedUrl},
        provenance::OntologyOwnership,
    },
    principal::actor_group::WebId,
};

use crate::store::{
    error::DeletionError,
    postgres::{
        AsClient as _, PostgresStore,
        crud::QueryRecordDecode,
        query::{Distinctness, PostgresSorting, SelectCompiler, SelectCompilerError},
    },
};

impl PostgresStore<Transaction<'_>> {
    /// Deletes ontology metadata for the specified ontology type UUIDs.
    ///
    /// This function removes ontology ownership metadata, temporal metadata,
    /// and edition provenance for the given ontology IDs.
    ///
    /// # Errors
    ///
    /// Returns [`DeletionError`] if the database deletion operation fails.
    #[tracing::instrument(level = "info", skip(self))]
    pub async fn delete_ontology_ids(
        &self,
        ontology_ids: &[OntologyTypeUuid],
    ) -> Result<(), Report<DeletionError>> {
        self.as_client()
            .query(
                "
                    DELETE FROM ontology_owned_metadata
                    WHERE ontology_id = ANY($1)
                ",
                &[&ontology_ids],
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError)?;

        self.as_client()
            .query(
                "
                    DELETE FROM ontology_external_metadata
                    WHERE ontology_id = ANY($1)
                ",
                &[&ontology_ids],
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError)?;

        self.as_client()
            .query(
                "
                    DELETE FROM ontology_temporal_metadata
                    WHERE ontology_id = ANY($1)
                ",
                &[&ontology_ids],
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError)?;

        let base_urls = self
            .as_client()
            .query(
                "
                    DELETE FROM ontology_ids
                    WHERE ontology_id = ANY($1)
                    RETURNING base_url
                ",
                &[&ontology_ids],
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<String>>();

        self.as_client()
            .query(
                "
                    DELETE FROM base_urls
                    WHERE base_url = ANY($1)
                ",
                &[&base_urls],
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError)?;

        Ok(())
    }
}

pub struct VersionedUrlCursorParameters<'p> {
    base_url: Parameter<'p>,
    version: Parameter<'p>,
}

#[derive(Debug, Copy, Clone)]
pub struct VersionedUrlIndices {
    pub base_url: usize,
    pub version: usize,
}
impl QueryRecordDecode for VersionedUrlSorting {
    type Indices = VersionedUrlIndices;
    type Output = VersionedUrl;

    fn decode(row: &Row, indices: &Self::Indices) -> Self::Output {
        VersionedUrl {
            base_url: BaseUrl::new(row.get(indices.base_url))
                .expect("invalid base URL returned from Postgres"),
            version: row.get(indices.version),
        }
    }
}

macro_rules! impl_ontology_cursor {
    ($ty:ty, $query_path:ty) => {
        impl<'s> PostgresSorting<'s, $ty> for VersionedUrlSorting {
            type CompilationParameters = VersionedUrlCursorParameters<'s>;
            type Error = !;

            fn encode(&self) -> Result<Option<Self::CompilationParameters>, Self::Error> {
                Ok(self.cursor().map(|cursor| VersionedUrlCursorParameters {
                    base_url: Parameter::Text(Cow::Owned(cursor.base_url.to_string())),
                    version: Parameter::OntologyTypeVersion(cursor.version),
                }))
            }

            fn compile<'p, 'q: 'p>(
                &self,
                compiler: &mut SelectCompiler<'p, 'q, $ty>,
                parameters: Option<&'p Self::CompilationParameters>,
                _: &QueryTemporalAxes,
            ) -> Result<Self::Indices, Report<SelectCompilerError>> {
                if let Some(parameters) = parameters {
                    let base_url_expression = compiler.compile_parameter(&parameters.base_url).0;
                    let version_expression = compiler.compile_parameter(&parameters.version).0;

                    Ok(VersionedUrlIndices {
                        base_url: compiler.add_cursor_selection(
                            &<$query_path>::BaseUrl,
                            identity,
                            Some(base_url_expression),
                            Ordering::Ascending,
                            None,
                        )?,
                        version: compiler.add_cursor_selection(
                            &<$query_path>::Version,
                            identity,
                            Some(version_expression),
                            Ordering::Descending,
                            None,
                        )?,
                    })
                } else {
                    Ok(VersionedUrlIndices {
                        base_url: compiler.add_distinct_selection_with_ordering(
                            &<$query_path>::BaseUrl,
                            Distinctness::Distinct,
                            Some((Ordering::Ascending, None)),
                        ),
                        version: compiler.add_distinct_selection_with_ordering(
                            &<$query_path>::Version,
                            Distinctness::Distinct,
                            Some((Ordering::Descending, None)),
                        ),
                    })
                }
            }
        }
    };
}

impl_ontology_cursor!(DataTypeWithMetadata, DataTypeQueryPath);
impl_ontology_cursor!(PropertyTypeWithMetadata, PropertyTypeQueryPath);
impl_ontology_cursor!(EntityTypeWithMetadata, EntityTypeQueryPath);

#[derive(Deserialize)]
#[serde(untagged)]
enum PostgresOntologyOwnership {
    Owned {
        web_id: WebId,
    },
    External {
        #[serde(with = "hash_codec::serde::time")]
        fetched_at: OffsetDateTime,
    },
}

impl From<PostgresOntologyOwnership> for OntologyOwnership {
    fn from(value: PostgresOntologyOwnership) -> Self {
        match value {
            PostgresOntologyOwnership::Owned { web_id } => Self::Local { web_id },
            PostgresOntologyOwnership::External { fetched_at } => Self::Remote { fetched_at },
        }
    }
}
