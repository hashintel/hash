//! SQL-side aggregation of the `include_*` summaries for entity queries.
//!
//! Instead of streaming every matching row and aggregating client-side, the compiled
//! filter query is wrapped into a single aggregate statement: a deduplicated `hits` CTE
//! feeds one `UNION ALL` branch per requested summary dimension.

use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_store::{
    entity::{EntityQueryPath, SummarizeEntitiesParams},
    entity_type::EntityTypeQueryPath,
    error::QueryError,
    subgraph::edges::SharedEdgeKind,
};
use tokio_postgres::Row;
use type_system::{
    knowledge::Entity,
    ontology::VersionedUrl,
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};
use uuid::Uuid;

use crate::store::postgres::query::SelectCompiler;

/// Aggregated `include_*` summaries of an entity query.
///
/// Each map is only populated when the corresponding flag was requested; `type_ids` is
/// also populated for `include_type_titles` since the title lookup is keyed by it.
#[derive(Debug, Default)]
pub(crate) struct EntitySummaries {
    pub count: Option<usize>,
    pub web_ids: Option<HashMap<WebId, usize>>,
    pub created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    pub edition_created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    pub type_ids: Option<HashMap<VersionedUrl, usize>>,
}

/// Discriminant tagging which `UNION ALL` branch produced a result row.
///
/// The aggregate statement returns one row set with a fixed layout — `(dimension,
/// dimension_id, dimension_type, matches)` — and this discriminant in column 0 routes
/// each row to the matching [`EntitySummaries`] field during decoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i32)]
enum Dimension {
    Count = 0,
    WebIds = 1,
    CreatedByIds = 2,
    EditionCreatedByIds = 3,
    TypeIds = 4,
}

impl Dimension {
    const fn from_discriminant(discriminant: i32) -> Option<Self> {
        match discriminant {
            0 => Some(Self::Count),
            1 => Some(Self::WebIds),
            2 => Some(Self::CreatedByIds),
            3 => Some(Self::EditionCreatedByIds),
            4 => Some(Self::TypeIds),
            _ => None,
        }
    }
}

/// Compiles and decodes the summary aggregation for one entity query.
///
/// Created via [`Self::new`] *before* limit/sorting are added to the compiler, so the
/// selection only contains the summary columns. The lifecycle is: [`Self::new`] adds the
/// required selections, [`Self::statement`] wraps the compiled query, [`Self::decode`]
/// turns the result rows into [`EntitySummaries`].
pub(crate) struct EntitySummaryQuery {
    web_id_column: usize,
    entity_uuid_column: usize,
    draft_id_column: usize,
    provenance_column: Option<usize>,
    edition_provenance_column: Option<usize>,
    type_columns: Option<(usize, usize)>,
    include_count: bool,
    include_web_ids: bool,
}

impl EntitySummaryQuery {
    /// Adds the selections required for the summaries requested in `params` to the
    /// `compiler`, or returns [`None`] when no summary is requested.
    ///
    /// Must run *before* limit, sorting, or record selections are added to the compiler:
    /// the wrapper assumes the compiled selection contains exactly the summary columns,
    /// and a limit would truncate the aggregates.
    pub(crate) fn new(
        compiler: &mut SelectCompiler<'_, '_, Entity>,
        params: &SummarizeEntitiesParams<'_>,
    ) -> Option<Self> {
        if !(params.include_count
            || params.include_web_ids
            || params.include_created_by_ids
            || params.include_edition_created_by_ids
            || params.include_type_ids
            || params.include_type_titles)
        {
            return None;
        }

        Some(Self {
            web_id_column: compiler.add_selection_path(&EntityQueryPath::WebId),
            entity_uuid_column: compiler.add_selection_path(&EntityQueryPath::Uuid),
            draft_id_column: compiler.add_selection_path(&EntityQueryPath::DraftId),
            provenance_column: params
                .include_created_by_ids
                .then(|| compiler.add_selection_path(&EntityQueryPath::Provenance(None))),
            edition_provenance_column: params
                .include_edition_created_by_ids
                .then(|| compiler.add_selection_path(&EntityQueryPath::EditionProvenance(None))),
            type_columns: (params.include_type_ids || params.include_type_titles).then(|| {
                (
                    compiler.add_selection_path(&EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::VersionedUrl,
                        inheritance_depth: None,
                    }),
                    compiler.add_selection_path(&EntityQueryPath::DirectTypeCount),
                )
            }),
            include_count: params.include_count,
            include_web_ids: params.include_web_ids,
        })
    }

    /// Wraps the compiled selection into the aggregate statement.
    ///
    /// The inner selection may emit duplicate rows through filter joins and multiple
    /// matching editions; deduplication happens over the entity identity. Edition-scoped
    /// columns (edition provenance, type arrays) are not functionally dependent on it, so
    /// their presence requires `DISTINCT ON` picking one arbitrary edition per entity;
    /// otherwise a plain (hashable) `DISTINCT` suffices.
    pub(crate) fn statement(&self, statement: &str) -> String {
        let aliases = (0..self.column_count())
            .map(|index| format!("c{index}"))
            .collect::<Vec<_>>()
            .join(", ");

        let distinct = if self.edition_provenance_column.is_some() || self.type_columns.is_some() {
            format!(
                "DISTINCT ON (c{}, c{}, c{})",
                self.web_id_column, self.entity_uuid_column, self.draft_id_column
            )
        } else {
            "DISTINCT".to_owned()
        };

        let mut hit_columns = vec![
            format!("c{} AS web_id", self.web_id_column),
            format!("c{} AS entity_uuid", self.entity_uuid_column),
            format!("c{} AS draft_id", self.draft_id_column),
        ];
        if let Some(column) = self.provenance_column {
            hit_columns.push(format!("(c{column} ->> 'createdById')::uuid AS created_by"));
        }
        if let Some(column) = self.edition_provenance_column {
            hit_columns.push(format!(
                "(c{column} ->> 'createdById')::uuid AS edition_created_by"
            ));
        }
        if let Some((versioned_urls_column, direct_types_column)) = self.type_columns {
            hit_columns.push(format!("c{versioned_urls_column} AS versioned_urls"));
            hit_columns.push(format!("c{direct_types_column} AS direct_types"));
        }
        let hit_columns = hit_columns.join(", ");

        let mut branches = Vec::new();
        if self.include_count {
            branches.push(format!(
                "SELECT {}::int4 AS dimension, NULL::uuid AS dimension_id, NULL::text AS \
                 dimension_type, count(*) AS matches FROM hits",
                Dimension::Count as i32
            ));
        }
        if self.include_web_ids {
            branches.push(format!(
                "SELECT {}::int4, web_id, NULL::text, count(*) FROM hits GROUP BY web_id",
                Dimension::WebIds as i32
            ));
        }
        if self.provenance_column.is_some() {
            branches.push(format!(
                "SELECT {}::int4, created_by, NULL::text, count(*) FROM hits GROUP BY created_by",
                Dimension::CreatedByIds as i32
            ));
        }
        if self.edition_provenance_column.is_some() {
            branches.push(format!(
                "SELECT {}::int4, edition_created_by, NULL::text, count(*) FROM hits GROUP BY \
                 edition_created_by",
                Dimension::EditionCreatedByIds as i32
            ));
        }
        if self.type_columns.is_some() {
            branches.push(format!(
                "SELECT {}::int4, NULL::uuid, type_id.type_id, count(*) FROM hits CROSS JOIN \
                 LATERAL unnest(versioned_urls[1:direct_types]) AS type_id (type_id) GROUP BY \
                 type_id.type_id",
                Dimension::TypeIds as i32
            ));
        }

        format!(
            "WITH hits AS (SELECT {distinct} {hit_columns} FROM ({statement}) AS raw ({aliases})) \
             {}",
            branches.join(" UNION ALL ")
        )
    }

    /// Routes the aggregate result rows into [`EntitySummaries`].
    ///
    /// # Errors
    ///
    /// Returns an error if a row does not match the expected dimension layout, e.g. a
    /// `NULL` actor ID produced by an edition with malformed provenance.
    pub(crate) fn decode(&self, rows: Vec<Row>) -> Result<EntitySummaries, Report<QueryError>> {
        let mut summaries = EntitySummaries {
            count: None,
            web_ids: self.include_web_ids.then(HashMap::new),
            created_by_ids: self.provenance_column.is_some().then(HashMap::new),
            edition_created_by_ids: self.edition_provenance_column.is_some().then(HashMap::new),
            type_ids: self.type_columns.is_some().then(HashMap::new),
        };

        for row in rows {
            let matches = usize::try_from(row.try_get::<_, i64>(3).change_context(QueryError)?)
                .change_context(QueryError)?;
            let dimension = row.try_get::<_, i32>(0).change_context(QueryError)?;
            match Dimension::from_discriminant(dimension) {
                Some(Dimension::Count) => summaries.count = Some(matches),
                Some(Dimension::WebIds) => {
                    if let Some(web_ids) = &mut summaries.web_ids {
                        web_ids.insert(
                            row.try_get::<_, WebId>(1).change_context(QueryError)?,
                            matches,
                        );
                    }
                }
                Some(Dimension::CreatedByIds) => {
                    if let Some(created_by_ids) = &mut summaries.created_by_ids {
                        created_by_ids.insert(
                            ActorEntityUuid::new(
                                row.try_get::<_, Uuid>(1).change_context(QueryError)?,
                            ),
                            matches,
                        );
                    }
                }
                Some(Dimension::EditionCreatedByIds) => {
                    if let Some(edition_created_by_ids) = &mut summaries.edition_created_by_ids {
                        edition_created_by_ids.insert(
                            ActorEntityUuid::new(
                                row.try_get::<_, Uuid>(1).change_context(QueryError)?,
                            ),
                            matches,
                        );
                    }
                }
                Some(Dimension::TypeIds) => {
                    if let Some(type_ids) = &mut summaries.type_ids {
                        type_ids.insert(
                            row.try_get::<_, VersionedUrl>(2)
                                .change_context(QueryError)?,
                            matches,
                        );
                    }
                }
                None => {
                    return Err(Report::new(QueryError)
                        .attach(format!("unexpected summary dimension `{dimension}`")));
                }
            }
        }

        Ok(summaries)
    }

    fn column_count(&self) -> usize {
        [
            Some(self.web_id_column),
            Some(self.entity_uuid_column),
            Some(self.draft_id_column),
            self.provenance_column,
            self.edition_provenance_column,
            self.type_columns.map(|(versioned_urls, _)| versioned_urls),
            self.type_columns.map(|(_, direct_types)| direct_types),
        ]
        .into_iter()
        .flatten()
        .max()
        .expect("identity columns are always selected")
            + 1
    }
}

#[cfg(test)]
mod tests {
    use super::{Dimension, EntitySummaryQuery};
    use crate::store::postgres::query::test_helper::trim_whitespace;

    #[test]
    fn dimension_discriminant_roundtrip() {
        for dimension in [
            Dimension::Count,
            Dimension::WebIds,
            Dimension::CreatedByIds,
            Dimension::EditionCreatedByIds,
            Dimension::TypeIds,
        ] {
            assert_eq!(
                Dimension::from_discriminant(dimension as i32),
                Some(dimension)
            );
        }
        assert_eq!(Dimension::from_discriminant(5), None);
    }

    #[test]
    fn statement_all_dimensions() {
        let summary_query = EntitySummaryQuery {
            web_id_column: 0,
            entity_uuid_column: 1,
            draft_id_column: 2,
            provenance_column: Some(3),
            edition_provenance_column: Some(4),
            type_columns: Some((5, 6)),
            include_count: true,
            include_web_ids: true,
        };

        pretty_assertions::assert_eq!(
            trim_whitespace(&summary_query.statement("SELECT 1")),
            trim_whitespace(
                "WITH hits AS (SELECT DISTINCT ON (c0, c1, c2)
                    c0 AS web_id,
                    c1 AS entity_uuid,
                    c2 AS draft_id,
                    (c3 ->> 'createdById')::uuid AS created_by,
                    (c4 ->> 'createdById')::uuid AS edition_created_by,
                    c5 AS versioned_urls,
                    c6 AS direct_types
                 FROM (SELECT 1) AS raw (c0, c1, c2, c3, c4, c5, c6))
                 SELECT 0::int4 AS dimension, NULL::uuid AS dimension_id,
                        NULL::text AS dimension_type, count(*) AS matches FROM hits
                 UNION ALL
                 SELECT 1::int4, web_id, NULL::text, count(*) FROM hits GROUP BY web_id
                 UNION ALL
                 SELECT 2::int4, created_by, NULL::text, count(*) FROM hits GROUP BY created_by
                 UNION ALL
                 SELECT 3::int4, edition_created_by, NULL::text, count(*) FROM hits
                  GROUP BY edition_created_by
                 UNION ALL
                 SELECT 4::int4, NULL::uuid, type_id.type_id, count(*) FROM hits
                  CROSS JOIN LATERAL unnest(versioned_urls[1:direct_types]) AS type_id (type_id)
                  GROUP BY type_id.type_id"
            ),
        );
    }

    #[test]
    fn statement_count_only() {
        let summary_query = EntitySummaryQuery {
            web_id_column: 0,
            entity_uuid_column: 1,
            draft_id_column: 2,
            provenance_column: None,
            edition_provenance_column: None,
            type_columns: None,
            include_count: true,
            include_web_ids: false,
        };

        pretty_assertions::assert_eq!(
            trim_whitespace(&summary_query.statement("SELECT 1")),
            trim_whitespace(
                "WITH hits AS (SELECT DISTINCT
                    c0 AS web_id,
                    c1 AS entity_uuid,
                    c2 AS draft_id
                 FROM (SELECT 1) AS raw (c0, c1, c2))
                 SELECT 0::int4 AS dimension, NULL::uuid AS dimension_id,
                        NULL::text AS dimension_type, count(*) AS matches FROM hits"
            ),
        );
    }
}
