use std::{borrow::Cow, error::Error};

use async_trait::async_trait;
use error_stack::{Result, ResultExt};
use futures::{Stream, StreamExt, TryStreamExt};
use graph_types::{
    account::AccountId,
    ontology::{
        CustomOntologyMetadata, DataTypeWithMetadata, EntityTypeMetadata, EntityTypeWithMetadata,
        OntologyElementMetadata, OntologyTemporalMetadata, OntologyTypeRecordId,
        OntologyTypeVersion, OntologyTypeWithMetadata, PropertyTypeWithMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordArchivedById, RecordCreatedById},
};
use postgres_types::{FromSql, Type};
use serde::Deserialize;
use temporal_versioning::RightBoundedTemporalInterval;
use time::OffsetDateTime;
use tokio_postgres::GenericClient;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataType, EntityType, PropertyType,
};

use crate::{
    ontology::{DataTypeQueryPath, EntityTypeQueryPath, PropertyTypeQueryPath},
    snapshot::{
        DataTypeSnapshotRecord, EntityTypeSnapshotRecord, OntologyTypeSnapshotRecord,
        PropertyTypeSnapshotRecord,
    },
    store::{
        crud::Read,
        postgres::{
            ontology::OntologyId,
            query::{
                Column, Distinctness, ForeignKeyReference, Ordering, ReferenceTable,
                SelectCompiler, Table, Transpile,
            },
        },
        query::Filter,
        AsClient, PostgresStore, QueryError,
    },
    subgraph::{
        edges::GraphResolveDepths,
        temporal_axes::{QueryTemporalAxes, VariableAxis},
    },
};

#[derive(Deserialize)]
#[serde(untagged)]
enum AdditionalOntologyMetadata {
    Owned {
        owned_by_id: OwnedById,
    },
    External {
        #[serde(with = "temporal_versioning::serde::time")]
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
impl<C: AsClient> Read<DataTypeSnapshotRecord> for PostgresStore<C> {
    type Record = DataTypeWithMetadata;

    type ReadStream = impl Stream<Item = Result<DataTypeSnapshotRecord, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Self::ReadStream, QueryError> {
        let mut compiler = SelectCompiler::new(temporal_axes);

        let base_url_index = compiler.add_distinct_selection_with_ordering(
            &DataTypeQueryPath::BaseUrl,
            Distinctness::Distinct,
            None,
        );
        let version_index = compiler.add_distinct_selection_with_ordering(
            &DataTypeQueryPath::Version,
            Distinctness::Distinct,
            None,
        );
        // It's possible to have multiple records with the same transaction time. We order them
        // descending so that the most recent record is returned first.
        let transaction_time_index = compiler.add_distinct_selection_with_ordering(
            &DataTypeQueryPath::TransactionTime,
            Distinctness::Distinct,
            Some(Ordering::Descending),
        );
        let schema_index = compiler.add_selection_path(&DataTypeQueryPath::Schema(None));
        let record_created_by_id_path_index =
            compiler.add_selection_path(&DataTypeQueryPath::RecordCreatedById);
        let record_archived_by_id_path_index =
            compiler.add_selection_path(&DataTypeQueryPath::RecordArchivedById);
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
                let additional_metadata: AdditionalOntologyMetadata =
                    row.get(additional_metadata_index);

                let provenance = ProvenanceMetadata {
                    record_created_by_id: RecordCreatedById::new(
                        row.get(record_created_by_id_path_index),
                    ),
                    record_archived_by_id: row
                        .get::<_, Option<AccountId>>(record_archived_by_id_path_index)
                        .map(RecordArchivedById::new),
                };

                let temporal_versioning = OntologyTemporalMetadata {
                    transaction_time: row.get(transaction_time_index),
                };

                let custom_metadata = match additional_metadata {
                    AdditionalOntologyMetadata::Owned { owned_by_id } => {
                        CustomOntologyMetadata::Owned {
                            provenance,
                            temporal_versioning,
                            owned_by_id,
                        }
                    }
                    AdditionalOntologyMetadata::External { fetched_at } => {
                        CustomOntologyMetadata::External {
                            provenance,
                            temporal_versioning,
                            fetched_at,
                        }
                    }
                };

                Ok(OntologyTypeSnapshotRecord {
                    schema: serde_json::from_value(row.get(schema_index))
                        .change_context(QueryError)?,
                    metadata: OntologyElementMetadata {
                        record_id: OntologyTypeRecordId {
                            base_url: BaseUrl::new(row.get(base_url_index))
                                .change_context(QueryError)?,
                            version: row.get(version_index),
                        },
                        custom: custom_metadata,
                    },
                    relations: Vec::new(),
                })
            });
        Ok(stream)
    }
}

#[async_trait]
impl<C: AsClient> Read<PropertyTypeSnapshotRecord> for PostgresStore<C> {
    type Record = PropertyTypeWithMetadata;

    type ReadStream =
        impl Stream<Item = Result<PropertyTypeSnapshotRecord, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Self::ReadStream, QueryError> {
        let mut compiler = SelectCompiler::new(temporal_axes);

        let base_url_index = compiler.add_distinct_selection_with_ordering(
            &PropertyTypeQueryPath::BaseUrl,
            Distinctness::Distinct,
            None,
        );
        let version_index = compiler.add_distinct_selection_with_ordering(
            &PropertyTypeQueryPath::Version,
            Distinctness::Distinct,
            None,
        );
        // It's possible to have multiple records with the same transaction time. We order them
        // descending so that the most recent record is returned first.
        let transaction_time_index = compiler.add_distinct_selection_with_ordering(
            &PropertyTypeQueryPath::TransactionTime,
            Distinctness::Distinct,
            Some(Ordering::Descending),
        );
        let schema_index = compiler.add_selection_path(&PropertyTypeQueryPath::Schema(None));
        let record_created_by_id_path_index =
            compiler.add_selection_path(&PropertyTypeQueryPath::RecordCreatedById);
        let record_archived_by_id_path_index =
            compiler.add_selection_path(&PropertyTypeQueryPath::RecordArchivedById);
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
                let additional_metadata: AdditionalOntologyMetadata =
                    row.get(additional_metadata_index);

                let provenance = ProvenanceMetadata {
                    record_created_by_id: RecordCreatedById::new(
                        row.get(record_created_by_id_path_index),
                    ),
                    record_archived_by_id: row
                        .get::<_, Option<AccountId>>(record_archived_by_id_path_index)
                        .map(RecordArchivedById::new),
                };

                let temporal_versioning = OntologyTemporalMetadata {
                    transaction_time: row.get(transaction_time_index),
                };

                let custom_metadata = match additional_metadata {
                    AdditionalOntologyMetadata::Owned { owned_by_id } => {
                        CustomOntologyMetadata::Owned {
                            provenance,
                            temporal_versioning,
                            owned_by_id,
                        }
                    }
                    AdditionalOntologyMetadata::External { fetched_at } => {
                        CustomOntologyMetadata::External {
                            provenance,
                            temporal_versioning,
                            fetched_at,
                        }
                    }
                };

                Ok(OntologyTypeSnapshotRecord {
                    schema: serde_json::from_value(row.get(schema_index))
                        .change_context(QueryError)?,
                    metadata: OntologyElementMetadata {
                        record_id: OntologyTypeRecordId {
                            base_url: BaseUrl::new(row.get(base_url_index))
                                .change_context(QueryError)?,
                            version: row.get(version_index),
                        },
                        custom: custom_metadata,
                    },
                    relations: Vec::new(),
                })
            });
        Ok(stream)
    }
}

#[async_trait]
impl<C: AsClient> Read<EntityTypeSnapshotRecord> for PostgresStore<C> {
    type Record = OntologyTypeWithMetadata<EntityType>;

    type ReadStream =
        impl Stream<Item = Result<EntityTypeSnapshotRecord, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Self::ReadStream, QueryError> {
        let mut compiler = SelectCompiler::new(temporal_axes);

        let base_url_index = compiler.add_distinct_selection_with_ordering(
            &EntityTypeQueryPath::BaseUrl,
            Distinctness::Distinct,
            None,
        );
        let version_index = compiler.add_distinct_selection_with_ordering(
            &EntityTypeQueryPath::Version,
            Distinctness::Distinct,
            None,
        );
        // It's possible to have multiple records with the same transaction time. We order them
        // descending so that the most recent record is returned first.
        let transaction_time_index = compiler.add_distinct_selection_with_ordering(
            &EntityTypeQueryPath::TransactionTime,
            Distinctness::Distinct,
            Some(Ordering::Descending),
        );
        let schema_index = compiler.add_selection_path(&EntityTypeQueryPath::Schema(None));
        let record_created_by_id_path_index =
            compiler.add_selection_path(&EntityTypeQueryPath::RecordCreatedById);
        let record_archived_by_id_path_index =
            compiler.add_selection_path(&EntityTypeQueryPath::RecordArchivedById);
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
                let additional_metadata: AdditionalOntologyMetadata =
                    row.get(additional_metadata_index);

                let provenance = ProvenanceMetadata {
                    record_created_by_id: RecordCreatedById::new(
                        row.get(record_created_by_id_path_index),
                    ),
                    record_archived_by_id: row
                        .get::<_, Option<AccountId>>(record_archived_by_id_path_index)
                        .map(RecordArchivedById::new),
                };

                let temporal_versioning = OntologyTemporalMetadata {
                    transaction_time: row.get(transaction_time_index),
                };

                let custom_metadata = match additional_metadata {
                    AdditionalOntologyMetadata::Owned { owned_by_id } => {
                        CustomOntologyMetadata::Owned {
                            provenance,
                            temporal_versioning,
                            owned_by_id,
                        }
                    }
                    AdditionalOntologyMetadata::External { fetched_at } => {
                        CustomOntologyMetadata::External {
                            provenance,
                            temporal_versioning,
                            fetched_at,
                        }
                    }
                };

                let label_property = row
                    .get::<_, Option<String>>(label_property_index)
                    .map(BaseUrl::new)
                    .transpose()
                    .change_context(QueryError)?;

                Ok(OntologyTypeSnapshotRecord {
                    schema: serde_json::from_value(row.get(schema_index))
                        .change_context(QueryError)?,
                    metadata: EntityTypeMetadata {
                        record_id: OntologyTypeRecordId {
                            base_url: BaseUrl::new(row.get(base_url_index))
                                .change_context(QueryError)?,
                            version: row.get(version_index),
                        },
                        label_property,
                        icon: row.get(icon_index),
                        custom: custom_metadata,
                    },
                    relations: Vec::new(),
                })
            });
        Ok(stream)
    }
}

#[async_trait]
impl<C: AsClient> Read<DataTypeWithMetadata> for PostgresStore<C> {
    type Record = DataTypeWithMetadata;

    type ReadStream =
        impl futures::Stream<Item = Result<DataTypeWithMetadata, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<DataTypeWithMetadata>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Self::ReadStream, QueryError> {
        let stream = Read::<DataTypeSnapshotRecord>::read(self, filter, temporal_axes)
            .await?
            .and_then(|record| async move {
                Ok(DataTypeWithMetadata {
                    schema: DataType::try_from(record.schema).change_context(QueryError)?,
                    metadata: record.metadata,
                })
            });
        Ok(stream)
    }
}

#[async_trait]
impl<C: AsClient> Read<PropertyTypeWithMetadata> for PostgresStore<C> {
    type Record = PropertyTypeWithMetadata;

    type ReadStream =
        impl futures::Stream<Item = Result<PropertyTypeWithMetadata, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<PropertyTypeWithMetadata>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Self::ReadStream, QueryError> {
        let stream = Read::<PropertyTypeSnapshotRecord>::read(self, filter, temporal_axes)
            .await?
            .and_then(|record| async move {
                Ok(PropertyTypeWithMetadata {
                    schema: PropertyType::try_from(record.schema).change_context(QueryError)?,
                    metadata: record.metadata,
                })
            });
        Ok(stream)
    }
}

#[async_trait]
impl<C: AsClient> Read<EntityTypeWithMetadata> for PostgresStore<C> {
    type Record = EntityTypeWithMetadata;

    type ReadStream =
        impl futures::Stream<Item = Result<EntityTypeWithMetadata, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self, filter))]
    async fn read(
        &self,
        filter: &Filter<EntityTypeWithMetadata>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Self::ReadStream, QueryError> {
        let stream = Read::<EntityTypeSnapshotRecord>::read(self, filter, temporal_axes)
            .await?
            .and_then(|record| async move {
                Ok(EntityTypeWithMetadata {
                    schema: EntityType::try_from(record.schema).change_context(QueryError)?,
                    metadata: record.metadata,
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
