use alloc::borrow::Cow;

use error_stack::{Report, ResultExt as _};
use futures::{Stream, StreamExt as _};
use hash_graph_store::{
    entity_type::EntityTypeQueryPath,
    error::QueryError,
    filter::Filter,
    subgraph::{
        edges::BorrowedTraversalParams,
        temporal_axes::{QueryTemporalAxes, VariableAxis},
    },
};
use hash_graph_temporal_versioning::RightBoundedTemporalInterval;
use postgres_types::Json;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;
use type_system::ontology::{
    EntityTypeWithMetadata, OntologyTemporalMetadata,
    entity_type::{ClosedEntityTypeWithMetadata, EntityTypeMetadata, EntityTypeUuid},
    id::{OntologyTypeRecordId, OntologyTypeUuid, VersionedUrl},
    provenance::OntologyProvenance,
};

use super::PostgresOntologyOwnership;
use crate::store::postgres::{
    AsClient, PostgresStore,
    query::{
        Distinctness, ForeignKeyReference, ReferenceTable, SelectCompiler, Table, Transpile as _,
        table::DatabaseColumn as _,
    },
};

#[derive(Debug, Default)]
pub struct OntologyTypeTraversalData<'edges> {
    ontology_ids: Vec<OntologyTypeUuid>,
    traversal_params: Vec<BorrowedTraversalParams<'edges>>,
    traversal_intervals: Vec<RightBoundedTemporalInterval<VariableAxis>>,
}

impl<'edges> OntologyTypeTraversalData<'edges> {
    pub fn push(
        &mut self,
        ontology_id: OntologyTypeUuid,
        traversal_params: BorrowedTraversalParams<'edges>,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) {
        self.ontology_ids.push(ontology_id);
        self.traversal_params.push(traversal_params);
        self.traversal_intervals.push(traversal_interval);
    }
}

pub struct OntologyEdgeTraversal<'edges, L, R> {
    pub left_endpoint: L,
    pub right_endpoint: R,
    pub right_endpoint_ontology_id: OntologyTypeUuid,
    pub traversal_params: BorrowedTraversalParams<'edges>,
    pub traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
}

impl<C: AsClient> PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, filter))]
    pub(crate) async fn read_closed_schemas<'f>(
        &self,
        filter: &[Filter<'f, EntityTypeWithMetadata>],
        temporal_axes: Option<&'f QueryTemporalAxes>,
    ) -> Result<
        impl Stream<Item = Result<(EntityTypeUuid, ClosedEntityTypeWithMetadata), Report<QueryError>>>,
        Report<QueryError>,
    > {
        let mut compiler = SelectCompiler::new(temporal_axes, false);

        let ontology_id_index = compiler.add_distinct_selection_with_ordering(
            &EntityTypeQueryPath::OntologyId,
            Distinctness::Distinct,
            None,
        );
        let closed_schema_index =
            compiler.add_selection_path(&EntityTypeQueryPath::ClosedSchema(None));
        let base_url_index = compiler.add_selection_path(&EntityTypeQueryPath::BaseUrl);
        let version_index = compiler.add_selection_path(&EntityTypeQueryPath::Version);
        let additional_metadata_index =
            compiler.add_selection_path(&EntityTypeQueryPath::AdditionalMetadata);
        let transaction_time_index =
            compiler.add_selection_path(&EntityTypeQueryPath::TransactionTime);
        let provenance_index =
            compiler.add_selection_path(&EntityTypeQueryPath::EditionProvenance(None));

        for filter in filter {
            compiler.add_filter(filter).change_context(QueryError)?;
        }
        let (statement, parameters) = compiler.compile();

        Ok(self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?
            .map(move |row| {
                let row = row.change_context(QueryError)?;
                let Json(schema) = row.get(closed_schema_index);
                Ok((
                    row.get(ontology_id_index),
                    ClosedEntityTypeWithMetadata {
                        schema,
                        metadata: EntityTypeMetadata {
                            record_id: OntologyTypeRecordId {
                                base_url: row.get(base_url_index),
                                version: row.get(version_index),
                            },
                            ownership: row
                                .get::<_, Json<PostgresOntologyOwnership>>(
                                    additional_metadata_index,
                                )
                                .0
                                .into(),
                            temporal_versioning: OntologyTemporalMetadata {
                                transaction_time: row.get(transaction_time_index),
                            },
                            provenance: OntologyProvenance {
                                edition: row.get(provenance_index),
                            },
                        },
                    },
                ))
            }))
    }

    #[tracing::instrument(level = "info", skip(self))]
    pub(crate) async fn read_ontology_edges<'edges, 'r, L, R>(
        &self,
        record_ids: &'r OntologyTypeTraversalData<'edges>,
        reference_table: ReferenceTable,
    ) -> Result<
        impl Iterator<Item = (OntologyTypeUuid, OntologyEdgeTraversal<'edges, L, R>)> + 'r,
        Report<QueryError>,
    >
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
            .and_then(|column| Some((column.as_str(), column.inheritance_depth()?)));

        let where_statement = match depth {
            Some((column, depth)) => Cow::Owned(format!("WHERE {table}.{column} <= {depth}")),
            _ => Cow::Borrowed(""),
        };

        Ok(self
            .client
            .as_client()
            .query(
                &format!(
                    "
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
                    "
                ),
                &[&record_ids.ontology_ids],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
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
                    #[expect(
                        clippy::indexing_slicing,
                        reason = "index is guaranteed to be in bounds"
                    )]
                    OntologyEdgeTraversal {
                        left_endpoint: L::from(VersionedUrl {
                            base_url: row.get(1),
                            version: row.get(2),
                        }),
                        right_endpoint: R::from(VersionedUrl {
                            base_url: row.get(3),
                            version: row.get(4),
                        }),
                        right_endpoint_ontology_id,
                        traversal_params: record_ids.traversal_params[index],
                        traversal_interval: record_ids.traversal_intervals[index],
                    },
                )
            }))
    }
}
