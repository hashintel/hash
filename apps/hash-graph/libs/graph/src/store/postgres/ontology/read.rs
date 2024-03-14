use std::borrow::Cow;

use authorization::schema::EntityTypeId;
use error_stack::{Result, ResultExt};
use futures::{Stream, StreamExt};
use graph_types::ontology::EntityTypeWithMetadata;
use postgres_types::Json;
use temporal_versioning::RightBoundedTemporalInterval;
use tokio_postgres::GenericClient;
use type_system::{url::VersionedUrl, ClosedEntityType};

use crate::{
    ontology::EntityTypeQueryPath,
    store::{
        postgres::{
            ontology::OntologyId,
            query::{
                Column, Distinctness, ForeignKeyReference, ReferenceTable, SelectCompiler, Table,
                Transpile,
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
    pub(crate) async fn read_closed_schemas<'f>(
        &self,
        filter: &Filter<'f, EntityTypeWithMetadata>,
        temporal_axes: Option<&'f QueryTemporalAxes>,
    ) -> Result<impl Stream<Item = Result<(EntityTypeId, ClosedEntityType), QueryError>>, QueryError>
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
                            base_url: row.get(1),
                            version: row.get(2),
                        }),
                        right_endpoint: R::from(VersionedUrl {
                            base_url: row.get(3),
                            version: row.get(4),
                        }),
                        right_endpoint_ontology_id,
                        resolve_depths: record_ids.resolve_depths[index],
                        traversal_interval: record_ids.traversal_intervals[index],
                    },
                )
            }))
    }
}
