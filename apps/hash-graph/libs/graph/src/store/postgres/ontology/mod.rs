mod data_type;
mod entity_type;
mod ontology_id;
mod property_type;
mod read;

use std::{borrow::Cow, convert::identity};

use error_stack::{Result, ResultExt};
use graph_types::{
    ontology::{
        DataTypeWithMetadata, EntityTypeWithMetadata, OntologyType,
        OntologyTypeClassificationMetadata, OntologyTypeVersion, PropertyTypeWithMetadata,
    },
    owned_by_id::OwnedById,
};
use serde::Deserialize;
use time::OffsetDateTime;
use tokio_postgres::{Row, Transaction};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataType, EntityType, PropertyType,
};

pub use self::ontology_id::OntologyId;
use crate::{
    ontology::{DataTypeQueryPath, EntityTypeQueryPath, PropertyTypeQueryPath},
    store::{
        crud::{Cursor, QueryRecordDecode, QueryRecordEncode},
        error::DeletionError,
        postgres::query::{Distinctness, Ordering, SelectCompiler},
        query::Parameter,
        AsClient, PostgresStore,
    },
    subgraph::temporal_axes::QueryTemporalAxes,
};

/// Provides an abstraction over elements of the Type System stored in the Database.
///
/// [`PostgresDatabase`]: crate::store::PostgresDatabase
pub trait OntologyDatabaseType: OntologyType {
    /// Returns the name of the table where this type is stored.
    fn table() -> &'static str;
}

impl OntologyDatabaseType for DataType {
    fn table() -> &'static str {
        "data_types"
    }
}

impl OntologyDatabaseType for PropertyType {
    fn table() -> &'static str {
        "property_types"
    }
}

impl OntologyDatabaseType for EntityType {
    fn table() -> &'static str {
        "entity_types"
    }
}

impl PostgresStore<Transaction<'_>> {
    #[tracing::instrument(level = "trace", skip(self))]
    pub async fn delete_ontology_ids(
        &self,
        ontology_ids: &[OntologyId],
    ) -> Result<(), DeletionError> {
        self.as_client()
            .query(
                "
                    DELETE FROM ontology_owned_metadata
                    WHERE ontology_id = ANY($1)
                ",
                &[&ontology_ids],
            )
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
            .await
            .change_context(DeletionError)?;

        Ok(())
    }
}

pub struct VersionedUrlCursorParameters<'p> {
    base_url: Parameter<'p>,
    version: Parameter<'p>,
}

impl QueryRecordEncode for VersionedUrl {
    type CompilationParameters<'p> = VersionedUrlCursorParameters<'p>;

    fn encode(&self) -> Self::CompilationParameters<'_> {
        VersionedUrlCursorParameters {
            base_url: Parameter::Text(Cow::Borrowed(self.base_url.as_str())),
            version: Parameter::OntologyTypeVersion(OntologyTypeVersion::new(self.version)),
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub struct VersionedUrlIndices {
    pub base_url: usize,
    pub version: usize,
}

impl QueryRecordDecode<Row> for VersionedUrl {
    type CompilationArtifacts = VersionedUrlIndices;

    fn decode(row: &Row, indices: Self::CompilationArtifacts) -> Self {
        Self {
            base_url: BaseUrl::new(row.get(indices.base_url))
                .expect("invalid base URL returned from Postgres"),
            version: row.get::<_, OntologyTypeVersion>(indices.version).inner(),
        }
    }
}

macro_rules! impl_cursor {
    ($ty:ty, $query_path:ty) => {
        impl<'c> Cursor<'c, SelectCompiler<'c, $ty>> for VersionedUrl {
            fn compile<'p: 'c>(
                compiler: &mut SelectCompiler<'c, $ty>,
                parameters: Option<&'c Self::CompilationParameters<'p>>,
                _temporal_axes: &QueryTemporalAxes,
            ) -> Self::CompilationArtifacts {
                if let Some(parameters) = parameters {
                    let base_url_expression = compiler.compile_parameter(&parameters.base_url).0;
                    let version_expression = compiler.compile_parameter(&parameters.version).0;

                    VersionedUrlIndices {
                        base_url: compiler.add_cursor_selection(
                            &<$query_path>::BaseUrl,
                            identity,
                            base_url_expression,
                            Ordering::Ascending,
                        ),
                        version: compiler.add_cursor_selection(
                            &<$query_path>::Version,
                            identity,
                            version_expression,
                            Ordering::Descending,
                        ),
                    }
                } else {
                    VersionedUrlIndices {
                        base_url: compiler.add_distinct_selection_with_ordering(
                            &<$query_path>::BaseUrl,
                            Distinctness::Distinct,
                            Some(Ordering::Ascending),
                        ),
                        version: compiler.add_distinct_selection_with_ordering(
                            &<$query_path>::Version,
                            Distinctness::Distinct,
                            Some(Ordering::Descending),
                        ),
                    }
                }
            }
        }
    };
}

impl_cursor!(DataTypeWithMetadata, DataTypeQueryPath);
impl_cursor!(PropertyTypeWithMetadata, PropertyTypeQueryPath);
impl_cursor!(EntityTypeWithMetadata, EntityTypeQueryPath);

#[derive(Deserialize)]
#[serde(untagged)]
enum PostgresOntologyTypeClassificationMetadata {
    Owned {
        web_id: OwnedById,
    },
    External {
        #[serde(with = "temporal_versioning::serde::time")]
        fetched_at: OffsetDateTime,
    },
}

impl From<PostgresOntologyTypeClassificationMetadata> for OntologyTypeClassificationMetadata {
    fn from(value: PostgresOntologyTypeClassificationMetadata) -> Self {
        match value {
            PostgresOntologyTypeClassificationMetadata::Owned { web_id } => Self::Owned {
                owned_by_id: web_id,
            },
            PostgresOntologyTypeClassificationMetadata::External { fetched_at } => {
                Self::External { fetched_at }
            }
        }
    }
}
