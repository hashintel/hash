use std::{borrow::Cow, convert::identity};

use async_trait::async_trait;
use authorization::schema::EntityTypeId;
use error_stack::{Result, ResultExt};
use futures::{Stream, StreamExt, TryStreamExt};
use graph_types::{
    account::EditionCreatedById,
    ontology::{
        DataTypeMetadata, DataTypeWithMetadata, EntityTypeMetadata, EntityTypeWithMetadata,
        OntologyEditionProvenanceMetadata, OntologyProvenanceMetadata, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, OntologyTypeRecordId, OntologyTypeVersion,
        PropertyTypeMetadata, PropertyTypeWithMetadata,
    },
    owned_by_id::OwnedById,
};
use postgres_types::Json;
use serde::Deserialize;
use temporal_versioning::RightBoundedTemporalInterval;
use time::OffsetDateTime;
use tokio_postgres::GenericClient;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    EntityType,
};

use crate::{
    ontology::{DataTypeQueryPath, EntityTypeQueryPath, PropertyTypeQueryPath},
    store::{
        crud::Read,
        postgres::{
            ontology::OntologyId,
            query::{
                Column, Distinctness, ForeignKeyReference, Ordering, ReferenceTable,
                SelectCompiler, Table, Transpile,
            },
        },
        query::{Filter, Parameter},
        AsClient, PostgresStore, QueryError, Record,
    },
    subgraph::{
        edges::GraphResolveDepths,
        temporal_axes::{QueryTemporalAxes, VariableAxis},
    },
};

struct CursorParameters<'p> {
    base_url: Parameter<'p>,
    version: Parameter<'p>,
}

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

#[async_trait]
impl<C: AsClient> Read<DataTypeWithMetadata> for PostgresStore<C> {
    type Record = DataTypeWithMetadata;

    type ReadStream = impl Stream<Item = Result<DataTypeWithMetadata, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
        after: Option<&<Self::Record as Record>::VertexId>,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<Self::ReadStream, QueryError> {
        let mut compiler = SelectCompiler::new(temporal_axes, include_drafts);
        if let Some(limit) = limit {
            compiler.set_limit(limit);
        }

        let cursor_parameters: Option<CursorParameters> = after.map(|cursor| CursorParameters {
            base_url: Parameter::Text(Cow::Borrowed(cursor.base_id.as_str())),
            version: Parameter::OntologyTypeVersion(cursor.revision_id),
        });

        let (base_url_index, version_index) = if let Some(cursor_parameters) = &cursor_parameters {
            let base_url_expression = compiler.compile_parameter(&cursor_parameters.base_url).0;
            let version_expression = compiler.compile_parameter(&cursor_parameters.version).0;

            (
                compiler.add_cursor_selection(
                    &DataTypeQueryPath::BaseUrl,
                    identity,
                    base_url_expression,
                    Ordering::Ascending,
                ),
                compiler.add_cursor_selection(
                    &DataTypeQueryPath::Version,
                    identity,
                    version_expression,
                    Ordering::Descending,
                ),
            )
        } else {
            // If we neither have `limit` nor `after` we don't need to sort
            let maybe_ascending = limit.map(|_| Ordering::Ascending);
            let maybe_descending = limit.map(|_| Ordering::Descending);
            (
                compiler.add_distinct_selection_with_ordering(
                    &DataTypeQueryPath::BaseUrl,
                    Distinctness::Distinct,
                    maybe_ascending,
                ),
                compiler.add_distinct_selection_with_ordering(
                    &DataTypeQueryPath::Version,
                    Distinctness::Distinct,
                    maybe_descending,
                ),
            )
        };

        // It's possible to have multiple records with the same transaction time. We order them
        // descending so that the most recent record is returned first.
        let transaction_time_index = compiler.add_distinct_selection_with_ordering(
            &DataTypeQueryPath::TransactionTime,
            Distinctness::Distinct,
            Some(Ordering::Descending),
        );
        let schema_index = compiler.add_selection_path(&DataTypeQueryPath::Schema(None));
        let edition_created_by_id_path_index =
            compiler.add_selection_path(&DataTypeQueryPath::EditionCreatedById);
        let edition_archived_by_id_path_index =
            compiler.add_selection_path(&DataTypeQueryPath::EditionArchivedById);
        let additional_metadata_index =
            compiler.add_selection_path(&DataTypeQueryPath::AdditionalMetadata);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        let stream = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .change_context(QueryError)?
            .map(|row| row.change_context(QueryError))
            .and_then(move |row| async move {
                Ok(DataTypeWithMetadata {
                    schema: row.get::<_, Json<_>>(schema_index).0,
                    metadata: DataTypeMetadata {
                        record_id: OntologyTypeRecordId {
                            base_url: BaseUrl::new(row.get(base_url_index))
                                .change_context(QueryError)?,
                            version: row.get(version_index),
                        },
                        classification: row
                            .get::<_, Json<PostgresOntologyTypeClassificationMetadata>>(
                                additional_metadata_index,
                            )
                            .0
                            .into(),
                        temporal_versioning: OntologyTemporalMetadata {
                            transaction_time: row.get(transaction_time_index),
                        },
                        provenance: OntologyProvenanceMetadata {
                            edition: OntologyEditionProvenanceMetadata {
                                created_by_id: EditionCreatedById::new(
                                    row.get(edition_created_by_id_path_index),
                                ),
                                archived_by_id: row.get(edition_archived_by_id_path_index),
                            },
                        },
                    },
                })
            });
        Ok(stream)
    }
}

#[async_trait]
impl<C: AsClient> Read<PropertyTypeWithMetadata> for PostgresStore<C> {
    type Record = PropertyTypeWithMetadata;

    type ReadStream =
        impl Stream<Item = Result<PropertyTypeWithMetadata, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
        after: Option<&<Self::Record as Record>::VertexId>,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<Self::ReadStream, QueryError> {
        let mut compiler = SelectCompiler::new(temporal_axes, include_drafts);
        if let Some(limit) = limit {
            compiler.set_limit(limit);
        }

        let cursor_parameters: Option<CursorParameters> = after.map(|cursor| CursorParameters {
            base_url: Parameter::Text(Cow::Borrowed(cursor.base_id.as_str())),
            version: Parameter::OntologyTypeVersion(cursor.revision_id),
        });

        let (base_url_index, version_index) = if let Some(cursor_parameters) = &cursor_parameters {
            let base_url_expression = compiler.compile_parameter(&cursor_parameters.base_url).0;
            let version_expression = compiler.compile_parameter(&cursor_parameters.version).0;

            (
                compiler.add_cursor_selection(
                    &PropertyTypeQueryPath::BaseUrl,
                    identity,
                    base_url_expression,
                    Ordering::Ascending,
                ),
                compiler.add_cursor_selection(
                    &PropertyTypeQueryPath::Version,
                    identity,
                    version_expression,
                    Ordering::Descending,
                ),
            )
        } else {
            // If we neither have `limit` nor `after` we don't need to sort
            let maybe_ascending = limit.map(|_| Ordering::Ascending);
            let maybe_descending = limit.map(|_| Ordering::Descending);
            (
                compiler.add_distinct_selection_with_ordering(
                    &PropertyTypeQueryPath::BaseUrl,
                    Distinctness::Distinct,
                    maybe_ascending,
                ),
                compiler.add_distinct_selection_with_ordering(
                    &PropertyTypeQueryPath::Version,
                    Distinctness::Distinct,
                    maybe_descending,
                ),
            )
        };

        // It's possible to have multiple records with the same transaction time. We order them
        // descending so that the most recent record is returned first.
        let transaction_time_index = compiler.add_distinct_selection_with_ordering(
            &PropertyTypeQueryPath::TransactionTime,
            Distinctness::Distinct,
            Some(Ordering::Descending),
        );
        let schema_index = compiler.add_selection_path(&PropertyTypeQueryPath::Schema(None));
        let edition_created_by_id_path_index =
            compiler.add_selection_path(&PropertyTypeQueryPath::EditionCreatedById);
        let edition_archived_by_id_path_index =
            compiler.add_selection_path(&PropertyTypeQueryPath::EditionArchivedById);
        let additional_metadata_index =
            compiler.add_selection_path(&PropertyTypeQueryPath::AdditionalMetadata);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        let stream = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .change_context(QueryError)?
            .map(|row| row.change_context(QueryError))
            .and_then(move |row| async move {
                Ok(PropertyTypeWithMetadata {
                    schema: row.get::<_, Json<_>>(schema_index).0,
                    metadata: PropertyTypeMetadata {
                        record_id: OntologyTypeRecordId {
                            base_url: BaseUrl::new(row.get(base_url_index))
                                .change_context(QueryError)?,
                            version: row.get(version_index),
                        },
                        classification: row
                            .get::<_, Json<PostgresOntologyTypeClassificationMetadata>>(
                                additional_metadata_index,
                            )
                            .0
                            .into(),
                        temporal_versioning: OntologyTemporalMetadata {
                            transaction_time: row.get(transaction_time_index),
                        },
                        provenance: OntologyProvenanceMetadata {
                            edition: OntologyEditionProvenanceMetadata {
                                created_by_id: EditionCreatedById::new(
                                    row.get(edition_created_by_id_path_index),
                                ),
                                archived_by_id: row.get(edition_archived_by_id_path_index),
                            },
                        },
                    },
                })
            });
        Ok(stream)
    }
}

#[async_trait]
impl<C: AsClient> Read<EntityTypeWithMetadata> for PostgresStore<C> {
    type Record = EntityTypeWithMetadata;

    type ReadStream = impl Stream<Item = Result<EntityTypeWithMetadata, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
        after: Option<&<Self::Record as Record>::VertexId>,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<Self::ReadStream, QueryError> {
        let mut compiler = SelectCompiler::new(temporal_axes, include_drafts);
        if let Some(limit) = limit {
            compiler.set_limit(limit);
        }

        let cursor_parameters: Option<CursorParameters> = after.map(|cursor| CursorParameters {
            base_url: Parameter::Text(Cow::Borrowed(cursor.base_id.as_str())),
            version: Parameter::OntologyTypeVersion(cursor.revision_id),
        });

        let (base_url_index, version_index) = if let Some(cursor_parameters) = &cursor_parameters {
            let base_url_expression = compiler.compile_parameter(&cursor_parameters.base_url).0;
            let version_expression = compiler.compile_parameter(&cursor_parameters.version).0;

            (
                compiler.add_cursor_selection(
                    &EntityTypeQueryPath::BaseUrl,
                    identity,
                    base_url_expression,
                    Ordering::Ascending,
                ),
                compiler.add_cursor_selection(
                    &EntityTypeQueryPath::Version,
                    identity,
                    version_expression,
                    Ordering::Descending,
                ),
            )
        } else {
            // If we neither have `limit` nor `after` we don't need to sort
            let maybe_ascending = limit.map(|_| Ordering::Ascending);
            let maybe_descending = limit.map(|_| Ordering::Descending);
            (
                compiler.add_distinct_selection_with_ordering(
                    &EntityTypeQueryPath::BaseUrl,
                    Distinctness::Distinct,
                    maybe_ascending,
                ),
                compiler.add_distinct_selection_with_ordering(
                    &EntityTypeQueryPath::Version,
                    Distinctness::Distinct,
                    maybe_descending,
                ),
            )
        };

        // It's possible to have multiple records with the same transaction time. We order them
        // descending so that the most recent record is returned first.
        let transaction_time_index = compiler.add_distinct_selection_with_ordering(
            &EntityTypeQueryPath::TransactionTime,
            Distinctness::Distinct,
            Some(Ordering::Descending),
        );
        let schema_index = compiler.add_selection_path(&EntityTypeQueryPath::Schema(None));
        let edition_created_by_id_path_index =
            compiler.add_selection_path(&EntityTypeQueryPath::EditionCreatedById);
        let edition_archived_by_id_path_index =
            compiler.add_selection_path(&EntityTypeQueryPath::EditionArchivedById);
        let additional_metadata_index =
            compiler.add_selection_path(&EntityTypeQueryPath::AdditionalMetadata);
        let label_property_index = compiler.add_selection_path(&EntityTypeQueryPath::LabelProperty);
        let icon_index = compiler.add_selection_path(&EntityTypeQueryPath::Icon);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        let stream = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .change_context(QueryError)?
            .map(|row| row.change_context(QueryError))
            .and_then(move |row| async move {
                let label_property = row
                    .get::<_, Option<String>>(label_property_index)
                    .map(BaseUrl::new)
                    .transpose()
                    .change_context(QueryError)?;

                Ok(EntityTypeWithMetadata {
                    schema: row.get::<_, Json<_>>(schema_index).0,
                    metadata: EntityTypeMetadata {
                        record_id: OntologyTypeRecordId {
                            base_url: BaseUrl::new(row.get(base_url_index))
                                .change_context(QueryError)?,
                            version: row.get(version_index),
                        },
                        classification: row
                            .get::<_, Json<PostgresOntologyTypeClassificationMetadata>>(
                                additional_metadata_index,
                            )
                            .0
                            .into(),
                        temporal_versioning: OntologyTemporalMetadata {
                            transaction_time: row.get(transaction_time_index),
                        },
                        provenance: OntologyProvenanceMetadata {
                            edition: OntologyEditionProvenanceMetadata {
                                created_by_id: EditionCreatedById::new(
                                    row.get(edition_created_by_id_path_index),
                                ),
                                archived_by_id: row.get(edition_archived_by_id_path_index),
                            },
                        },
                        label_property,
                        icon: row.get(icon_index),
                    },
                })
            });
        Ok(stream)
    }
}

#[derive(Debug, Default)]
pub struct OntologyTypeTraversalData {
    ontology_ids: Vec<OntologyId>,
    resolve_depths: Vec<GraphResolveDepths>,
    traversal_intervals: Vec<RightBoundedTemporalInterval<VariableAxis>>,
}

impl OntologyTypeTraversalData {
    pub fn push(
        &mut self,
        ontology_id: OntologyId,
        resolve_depth: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) {
        self.ontology_ids.push(ontology_id);
        self.resolve_depths.push(resolve_depth);
        self.traversal_intervals.push(traversal_interval);
    }
}

pub struct OntologyEdgeTraversal<L, R> {
    pub left_endpoint: L,
    pub right_endpoint: R,
    pub right_endpoint_ontology_id: OntologyId,
    pub resolve_depths: GraphResolveDepths,
    pub traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
}

impl<C: AsClient> PostgresStore<C> {
    #[tracing::instrument(level = "trace", skip(self, filter))]
    pub(crate) async fn read_closed_schemas(
        &self,
        filter: &Filter<'_, EntityTypeWithMetadata>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<impl Stream<Item = Result<(EntityTypeId, EntityType), QueryError>>, QueryError>
    {
        let mut compiler = SelectCompiler::new(temporal_axes, false);

        let ontology_id_index = compiler.add_distinct_selection_with_ordering(
            &EntityTypeQueryPath::OntologyId,
            Distinctness::Distinct,
            None,
        );
        let closed_schema_index =
            compiler.add_selection_path(&EntityTypeQueryPath::ClosedSchema(None));

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        Ok(self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .change_context(QueryError)?
            .map(move |row| {
                let row = row.change_context(QueryError)?;
                let Json(schema) = row.get(closed_schema_index);
                Ok((EntityTypeId::new(row.get(ontology_id_index)), schema))
            }))
    }

    #[tracing::instrument(level = "trace", skip(self))]
    pub(crate) async fn read_ontology_edges<'r, L, R>(
        &self,
        record_ids: &'r OntologyTypeTraversalData,
        reference_table: ReferenceTable,
    ) -> Result<impl Iterator<Item = (OntologyId, OntologyEdgeTraversal<L, R>)> + 'r, QueryError>
    where
        L: From<VersionedUrl>,
        R: From<VersionedUrl>,
    {
        let table = Table::Reference(reference_table).transpile_to_string();
        let source =
            if let ForeignKeyReference::Single { join, .. } = reference_table.source_relation() {
                join.transpile_to_string()
            } else {
                unreachable!("Ontology reference tables don't have multiple conditions")
            };
        let target =
            if let ForeignKeyReference::Single { on, .. } = reference_table.target_relation() {
                on.transpile_to_string()
            } else {
                unreachable!("Ontology reference tables don't have multiple conditions")
            };

        let depth = reference_table
            .inheritance_depth_column()
            .and_then(Column::inheritance_depth);

        let where_statement = match depth {
            Some(depth) if depth != 0 => {
                Cow::Owned(format!("WHERE {table}.inheritance_depth <= {depth}"))
            }
            _ => Cow::Borrowed(""),
        };

        Ok(self
            .client
            .as_client()
            .query(
                &format!(
                    r#"
                        SELECT
                            filter.idx         AS idx,
                            source.base_url    AS source_base_url,
                            source.version     AS source_version,
                            target.base_url    AS target_base_url,
                            target.version     AS target_version,
                            target.ontology_id AS target_ontology_id
                        FROM {table}

                        JOIN ontology_ids as source
                          ON {source} = source.ontology_id

                        JOIN unnest($1::uuid[])
                             WITH ORDINALITY AS filter(id, idx)
                          ON filter.id = source.ontology_id

                        JOIN ontology_ids as target
                          ON {target} = target.ontology_id

                        {where_statement};
                    "#
                ),
                &[&record_ids.ontology_ids],
            )
            .await
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                let index = usize::try_from(row.get::<_, i64>(0) - 1).unwrap_or_else(|error| {
                    // The index is always a valid `usize` because it is the index of the
                    // `record_ids` vectors that was just passed in.
                    unreachable!("invalid index: {error}")
                });
                let right_endpoint_ontology_id = row.get(5);
                (
                    right_endpoint_ontology_id,
                    OntologyEdgeTraversal {
                        left_endpoint: L::from(VersionedUrl {
                            base_url: BaseUrl::new(row.get(1)).unwrap_or_else(|error| {
                                // The `BaseUrl` was just inserted as a parameter to the query
                                unreachable!("invalid URL: {error}")
                            }),
                            version: row.get::<_, OntologyTypeVersion>(2).inner(),
                        }),
                        right_endpoint: R::from(VersionedUrl {
                            base_url: BaseUrl::new(row.get(3)).unwrap_or_else(|error| {
                                // The `BaseUrl` was already validated when it was inserted into
                                // the database, so this should never happen.
                                unreachable!("invalid URL: {error}")
                            }),
                            version: row.get::<_, OntologyTypeVersion>(4).inner(),
                        }),
                        right_endpoint_ontology_id,
                        resolve_depths: record_ids.resolve_depths[index],
                        traversal_interval: record_ids.traversal_intervals[index],
                    },
                )
            }))
    }
}
