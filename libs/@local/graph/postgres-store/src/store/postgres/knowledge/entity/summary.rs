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
/// Each map is populated only when its flag was requested. `type_ids` and `type_titles`
/// share one aggregate branch, so both are populated whenever either flag is set.
#[derive(Debug, Default)]
pub(crate) struct EntitySummaries {
    pub count: Option<usize>,
    pub web_ids: Option<HashMap<WebId, usize>>,
    pub created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    pub edition_created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    pub type_ids: Option<HashMap<VersionedUrl, usize>>,
    pub type_titles: Option<HashMap<VersionedUrl, String>>,
}

/// Discriminant tagging which `UNION ALL` branch produced a result row.
///
/// The aggregate statement returns one row set with a fixed layout — `(dimension,
/// dimension_id, dimension_type, matches, dimension_title)` — and this discriminant in
/// column 0 routes each row to the matching [`EntitySummaries`] field during decoding.
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

/// Whether the `hits` CTE must deduplicate editions before aggregating.
///
/// The compiled query can emit more than one row per edition when a fan-out (to-many) filter
/// join was added, or when a range variable temporal axis matches the same edition across
/// several decision-time slices. Skipping the dedup when either applies would over-count.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Deduplication {
    /// Deduplicate over `edition_id` via `DISTINCT ON` — duplicates are possible.
    Required,
    /// Skip the dedup — the query emits at most one row per edition, so the `DISTINCT ON` sort
    /// barrier can be dropped to let the planner run a fully parallel partial aggregate.
    Skip,
}

/// Compiles and decodes the summary aggregation for one entity query.
///
/// Created via [`Self::new`] *before* limit/sorting are added to the compiler, so the
/// selection only contains the summary columns. The lifecycle is: [`Self::new`] adds the
/// required selections, [`Self::statement`] wraps the compiled query, [`Self::decode`]
/// turns the result rows into [`EntitySummaries`].
pub(crate) struct EntitySummaryQuery {
    edition_id_column: usize,
    web_id_column: usize,
    created_by_column: Option<usize>,
    edition_created_by_column: Option<usize>,
    type_columns: Option<TypeColumns>,
    include_count: bool,
    include_web_ids: bool,
}

/// Column indices for the edition cache's parallel type arrays, selected together when
/// `include_type_ids` or `include_type_titles` is requested.
#[derive(Debug, Clone, Copy)]
struct TypeColumns {
    versioned_urls: usize,
    direct_types: usize,
    type_titles: usize,
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
            edition_id_column: compiler.add_selection_path(&EntityQueryPath::EditionId),
            web_id_column: compiler.add_selection_path(&EntityQueryPath::WebId),
            created_by_column: params
                .include_created_by_ids
                .then(|| compiler.add_selection_path(&EntityQueryPath::CreatedById)),
            edition_created_by_column: params
                .include_edition_created_by_ids
                .then(|| compiler.add_selection_path(&EntityQueryPath::EditionCreatedById)),
            type_columns: (params.include_type_ids || params.include_type_titles).then(|| {
                TypeColumns {
                    versioned_urls: compiler.add_selection_path(&EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::VersionedUrl,
                        inheritance_depth: None,
                    }),
                    direct_types: compiler.add_selection_path(&EntityQueryPath::DirectTypeCount),
                    type_titles: compiler.add_selection_path(&EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::Title,
                        inheritance_depth: None,
                    }),
                }
            }),
            include_count: params.include_count,
            include_web_ids: params.include_web_ids,
        })
    }

    /// Wraps the compiled selection into the aggregate statement.
    ///
    /// See [`Deduplication`] for when the `hits` CTE deduplicates over `edition_id`
    /// ([`Deduplication::Required`]) versus skips the `DISTINCT ON` to allow a fully parallel
    /// partial aggregate ([`Deduplication::Skip`]).
    pub(crate) fn statement(&self, statement: &str, dedup: Deduplication) -> String {
        let aliases = (0..self.column_count())
            .map(|index| format!("c{index}"))
            .collect::<Vec<_>>()
            .join(", ");

        let distinct = match dedup {
            Deduplication::Required => format!("DISTINCT ON (c{})", self.edition_id_column),
            Deduplication::Skip => String::new(),
        };

        let mut hit_columns = vec![format!("c{} AS web_id", self.web_id_column)];
        if let Some(column) = self.created_by_column {
            hit_columns.push(format!("c{column} AS created_by"));
        }
        if let Some(column) = self.edition_created_by_column {
            hit_columns.push(format!("c{column} AS edition_created_by"));
        }
        if let Some(columns) = self.type_columns {
            hit_columns.push(format!("c{} AS versioned_urls", columns.versioned_urls));
            hit_columns.push(format!("c{} AS direct_types", columns.direct_types));
            hit_columns.push(format!("c{} AS type_titles", columns.type_titles));
        }
        let hit_columns = hit_columns.join(", ");

        let mut branches = Vec::new();
        if self.include_count {
            branches.push(format!(
                "SELECT {}::int4 AS dimension, NULL::uuid AS dimension_id, NULL::text AS \
                 dimension_type, count(*) AS matches, NULL::text AS dimension_title FROM hits",
                Dimension::Count as i32
            ));
        }
        if self.include_web_ids {
            branches.push(format!(
                "SELECT {}::int4, web_id, NULL::text, count(*), NULL::text FROM hits GROUP BY \
                 web_id",
                Dimension::WebIds as i32
            ));
        }
        if self.created_by_column.is_some() {
            branches.push(format!(
                "SELECT {}::int4, created_by, NULL::text, count(*), NULL::text FROM hits GROUP BY \
                 created_by",
                Dimension::CreatedByIds as i32
            ));
        }
        if self.edition_created_by_column.is_some() {
            branches.push(format!(
                "SELECT {}::int4, edition_created_by, NULL::text, count(*), NULL::text FROM hits \
                 GROUP BY edition_created_by",
                Dimension::EditionCreatedByIds as i32
            ));
        }
        if self.type_columns.is_some() {
            branches.push(format!(
                "SELECT {}::int4, NULL::uuid, t.type_id, count(*), min(t.title) FROM (SELECT \
                 unnest(versioned_urls[1:direct_types]) AS type_id, \
                 unnest(type_titles[1:direct_types]) AS title FROM hits) AS t GROUP BY t.type_id",
                Dimension::TypeIds as i32
            ));
        }

        format!(
            "WITH hits AS (SELECT {distinct} {hit_columns} FROM (
            {statement}
            ) AS raw ({aliases})) {}",
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
            count: self.include_count.then_some(0),
            web_ids: self.include_web_ids.then(HashMap::new),
            created_by_ids: self.created_by_column.is_some().then(HashMap::new),
            edition_created_by_ids: self.edition_created_by_column.is_some().then(HashMap::new),
            type_ids: self.type_columns.is_some().then(HashMap::new),
            type_titles: self.type_columns.is_some().then(HashMap::new),
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
                    let type_id = row
                        .try_get::<_, VersionedUrl>(2)
                        .change_context(QueryError)?;
                    if let Some(type_ids) = &mut summaries.type_ids {
                        type_ids.insert(type_id.clone(), matches);
                    }
                    if let Some(type_titles) = &mut summaries.type_titles
                        && let Some(title) = row
                            .try_get::<_, Option<String>>(4)
                            .change_context(QueryError)?
                    {
                        type_titles.insert(type_id, title);
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
            Some(self.edition_id_column),
            Some(self.web_id_column),
            self.created_by_column,
            self.edition_created_by_column,
            self.type_columns.map(|columns| columns.versioned_urls),
            self.type_columns.map(|columns| columns.direct_types),
            self.type_columns.map(|columns| columns.type_titles),
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
    use super::{Deduplication, Dimension, EntitySummaryQuery, TypeColumns};
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
            edition_id_column: 0,
            web_id_column: 1,
            created_by_column: Some(2),
            edition_created_by_column: Some(3),
            type_columns: Some(TypeColumns {
                versioned_urls: 4,
                direct_types: 5,
                type_titles: 6,
            }),
            include_count: true,
            include_web_ids: true,
        };

        pretty_assertions::assert_eq!(
            trim_whitespace(&summary_query.statement("SELECT 1", Deduplication::Required)),
            trim_whitespace(
                "WITH hits AS (SELECT DISTINCT ON (c0)
                    c1 AS web_id,
                    c2 AS created_by,
                    c3 AS edition_created_by,
                    c4 AS versioned_urls,
                    c5 AS direct_types,
                    c6 AS type_titles
                 FROM ( SELECT 1 ) AS raw (c0, c1, c2, c3, c4, c5, c6))
                 SELECT 0::int4 AS dimension, NULL::uuid AS dimension_id,
                        NULL::text AS dimension_type, count(*) AS matches,
                        NULL::text AS dimension_title FROM hits
                 UNION ALL
                 SELECT 1::int4, web_id, NULL::text, count(*), NULL::text FROM hits GROUP BY web_id
                 UNION ALL
                 SELECT 2::int4, created_by, NULL::text, count(*), NULL::text FROM hits
                  GROUP BY created_by
                 UNION ALL
                 SELECT 3::int4, edition_created_by, NULL::text, count(*), NULL::text FROM hits
                  GROUP BY edition_created_by
                 UNION ALL
                 SELECT 4::int4, NULL::uuid, t.type_id, count(*), min(t.title) FROM (SELECT
                  unnest(versioned_urls[1:direct_types]) AS type_id,
                  unnest(type_titles[1:direct_types]) AS title FROM hits) AS t
                  GROUP BY t.type_id"
            ),
        );
    }

    #[test]
    fn statement_count_only() {
        let summary_query = EntitySummaryQuery {
            edition_id_column: 0,
            web_id_column: 1,
            created_by_column: None,
            edition_created_by_column: None,
            type_columns: None,
            include_count: true,
            include_web_ids: false,
        };

        pretty_assertions::assert_eq!(
            trim_whitespace(&summary_query.statement("SELECT 1", Deduplication::Required)),
            trim_whitespace(
                "WITH hits AS (SELECT DISTINCT ON (c0)
                    c1 AS web_id
                 FROM ( SELECT 1 ) AS raw (c0, c1))
                 SELECT 0::int4 AS dimension, NULL::uuid AS dimension_id,
                        NULL::text AS dimension_type, count(*) AS matches,
                        NULL::text AS dimension_title FROM hits"
            ),
        );
    }

    #[test]
    fn statement_skips_dedup() {
        let summary_query = EntitySummaryQuery {
            edition_id_column: 0,
            web_id_column: 1,
            created_by_column: None,
            edition_created_by_column: None,
            type_columns: Some(TypeColumns {
                versioned_urls: 2,
                direct_types: 3,
                type_titles: 4,
            }),
            include_count: false,
            include_web_ids: false,
        };

        // With `Deduplication::Skip` the `DISTINCT ON` is dropped, so the planner can run a fully
        // parallel partial aggregate. The raw row still includes `c0` (edition_id), but the
        // aggregation doesn’t reference it.
        pretty_assertions::assert_eq!(
            trim_whitespace(&summary_query.statement("SELECT 1", Deduplication::Skip)),
            trim_whitespace(
                "WITH hits AS (SELECT
                    c1 AS web_id,
                    c2 AS versioned_urls,
                    c3 AS direct_types,
                    c4 AS type_titles
                 FROM ( SELECT 1 ) AS raw (c0, c1, c2, c3, c4))
                 SELECT 4::int4, NULL::uuid, t.type_id, count(*), min(t.title) FROM (SELECT
                  unnest(versioned_urls[1:direct_types]) AS type_id,
                  unnest(type_titles[1:direct_types]) AS title FROM hits) AS t
                  GROUP BY t.type_id"
            ),
        );
    }
}
