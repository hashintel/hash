//! The legend payload statements, under the frozen-snapshot regime.
//!
//! Both statements execute on the dataset's one repeatable-read transaction and deliver each
//! row's display label and representative-type ordinal. Their rows are positional rather than
//! identity-keyed. The node legend orders by scope row and the edge legend by link identity,
//! matching the total orders their counterpart streams deliver. A legend's row n therefore
//! describes its counterpart's row n.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, Constant, Expression, FromItem, OrderByExpression,
    Placeholder, SelectList, SelectStatement, Table, WithExpression,
    table::{EntityEditionCache, OntologyIds},
};
use hash_graph_store::query::Ordering;
use tokio_postgres::{Row, types::ToSql};

use super::{
    LINK_ROOT_BASE_URL, corpus,
    sql::{AttachmentVocabulary, Axes, MAPPING, Mapping, first_label, type_mapping},
    vocabulary::{CorpusTable, Links, Scope},
};
use crate::{
    dataset::{TemporalAxes, auxiliary::OwnedLegend, postgres::PostgresDatasetError},
    identity::OntologyRowId,
};

/// The output columns of the legend payload statements.
pub(crate) struct LegendColumns {
    /// The display label, SQL NULL when the edition carries none.
    pub label: usize,
    /// The representative type's type-table ordinal, SQL NULL when the row resolves none.
    pub representative: usize,
}

/// The type-table position joined for the edition cache's first type.
fn representative_ordinal() -> Expression {
    // mapping.ordinality - 1
    MAPPING
        .column(&Mapping::Ordinality)
        .subtract(Constant::U32(1))
}

/// Builds the joins resolving the edition cache's first type to its type-table ordinal.
///
/// Both joins are outer, so a missing cache entry or a first type outside the type table
/// leaves the ordinal SQL NULL for the decoder to refuse.
///
/// # SQL
///
/// ```sql
/// LEFT JOIN ontology_ids AS first_type
///   ON first_type.base_url = (cache.base_urls)[1]
///  AND first_type.version = (cache.versions)[1]
/// LEFT JOIN unnest(<types>::uuid[]) WITH ORDINALITY AS mapping(ontology_id, ordinality)
///   ON mapping.ontology_id = first_type.ontology_id
/// ```
fn representative_joins(
    from: FromItem<'static>,
    cache: Aliased<EntityEditionCache>,
    first_type: Aliased<OntologyIds>,
    types: Placeholder,
) -> FromItem<'static> {
    // LEFT JOIN ontology_ids AS first_type
    //   ON first_type.base_url = (cache.base_urls)[1]
    //  AND first_type.version = (cache.versions)[1]
    // LEFT JOIN unnest(<types>) WITH ORDINALITY AS mapping(ontology_id, ordinality)
    //   ON mapping.ontology_id = first_type.ontology_id
    from.left_join_on(
        first_type.from_item(),
        vec![
            first_type
                .column(&OntologyIds::BaseUrl)
                .equal(cache.column(&EntityEditionCache::BaseUrls).array_element(1)),
            first_type
                .column(&OntologyIds::Version)
                .equal(cache.column(&EntityEditionCache::Versions).array_element(1)),
        ],
    )
    .left_join_on(
        type_mapping(types),
        vec![
            MAPPING
                .column(&Mapping::OntologyId)
                .equal(first_type.column(&OntologyIds::OntologyId)),
        ],
    )
}

/// Builds the node legend statement, ordered by node row.
///
/// Each row pairs the scoped entity's cached display label with its first cached type resolved
/// to a type-table ordinal. The statement attaches the corpus scope and shares its ordering, so
/// positions agree with the node stream under the frozen snapshot.
///
/// # SQL
///
/// ```sql
/// WITH scope AS (<scope>)
/// SELECT (cache.labels)[1], mapping.ordinality - 1
/// FROM scope
/// LEFT JOIN entity_edition_cache AS cache
///   ON cache.entity_edition_id = scope.entity_edition_id
/// LEFT JOIN <the representative-type joins>
/// ORDER BY scope.row
/// ```
pub(crate) fn node_legend_statement<'params>(
    axes: &'params TemporalAxes,
    types: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, LegendColumns> {
    const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");
    const FIRST_TYPE: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "first_type");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);
    let types_placeholder = binder.bind(types);

    // SELECT (cache.labels)[1], mapping.ordinality - 1
    let mut select = SelectList::default();
    let columns = LegendColumns {
        label: select.output(first_label(CACHE)),
        representative: select.output(representative_ordinal()),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH scope AS (<scope>)
            WithExpression::default()
                .with_statement(CorpusTable::Scope, corpus::scope(axes_points, link_root))
        })
        .selects(select.into_selects())
        .from({
            // FROM scope
            // LEFT JOIN entity_edition_cache AS cache
            //   ON cache.entity_edition_id = scope.entity_edition_id
            representative_joins(
                FromItem::table(CorpusTable::Scope).build().left_join_on(
                    CACHE.from_item(),
                    vec![
                        CACHE
                            .column(&EntityEditionCache::EntityEditionId)
                            .equal(CorpusTable::Scope.column(Scope::EntityEditionId)),
                    ],
                ),
                CACHE,
                FIRST_TYPE,
                types_placeholder,
            )
        })
        .order_by_expression({
            // ORDER BY scope.row
            OrderByExpression::default().with(
                CorpusTable::Scope.column(Scope::Row),
                Ordering::Ascending,
                None,
            )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Builds the edge legend statement, ordered by link identity.
///
/// Each row pairs the corpus link's cached display label with its first cached type resolved to
/// a type-table ordinal. The statement attaches the corpus scope and links and shares the edge
/// stream's total order, so positions agree under the frozen snapshot.
///
/// # SQL
///
/// ```sql
/// WITH scope AS (<scope>), links AS (<links>)
/// SELECT (cache.labels)[1], mapping.ordinality - 1
/// FROM links
/// LEFT JOIN entity_edition_cache AS cache
///   ON cache.entity_edition_id = links.entity_edition_id
/// LEFT JOIN <the representative-type joins>
/// ORDER BY links.web_id, links.entity_uuid, links.source_row, links.target_row
/// ```
pub(crate) fn edge_legend_statement<'params>(
    axes: &'params TemporalAxes,
    types: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, LegendColumns> {
    const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");
    const FIRST_TYPE: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "first_type");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);
    let attachments = AttachmentVocabulary::bind(&mut binder);
    let types_placeholder = binder.bind(types);

    // SELECT (cache.labels)[1], mapping.ordinality - 1
    let mut select = SelectList::default();
    let columns = LegendColumns {
        label: select.output(first_label(CACHE)),
        representative: select.output(representative_ordinal()),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH scope AS (<scope>), links AS (<links>)
            WithExpression::default()
                .with_statement(CorpusTable::Scope, corpus::scope(axes_points, link_root))
                .with_statement(CorpusTable::Links, corpus::links(axes_points, attachments))
        })
        .selects(select.into_selects())
        .from({
            // FROM links
            // LEFT JOIN entity_edition_cache AS cache
            //   ON cache.entity_edition_id = links.entity_edition_id
            representative_joins(
                FromItem::table(CorpusTable::Links).build().left_join_on(
                    CACHE.from_item(),
                    vec![
                        CACHE
                            .column(&EntityEditionCache::EntityEditionId)
                            .equal(CorpusTable::Links.column(Links::EntityEditionId)),
                    ],
                ),
                CACHE,
                FIRST_TYPE,
                types_placeholder,
            )
        })
        .order_by_expression({
            // ORDER BY links.web_id, links.entity_uuid, links.source_row, links.target_row
            OrderByExpression::default()
                .with(
                    CorpusTable::Links.column(Links::WebId),
                    Ordering::Ascending,
                    None,
                )
                .with(
                    CorpusTable::Links.column(Links::EntityUuid),
                    Ordering::Ascending,
                    None,
                )
                .with(
                    CorpusTable::Links.column(Links::SourceRow),
                    Ordering::Ascending,
                    None,
                )
                .with(
                    CorpusTable::Links.column(Links::TargetRow),
                    Ordering::Ascending,
                    None,
                )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Decodes one display-legend row into its owned legend.
///
/// An edition without a cached label decodes as the empty label. A row whose first type
/// resolves to no type-table ordinal fails the decode.
pub(crate) fn decode_legend(
    row: &Row,
    columns: &LegendColumns,
) -> Result<OwnedLegend, PostgresDatasetError> {
    let label: Option<String> = row.try_get(columns.label)?;
    let representative: Option<i64> = row.try_get(columns.representative)?;

    let representative = representative.ok_or(PostgresDatasetError::Representative)?;
    let representative = u64::try_from(representative)
        .map(OntologyRowId::new)
        .map_err(|_error| PostgresDatasetError::Ordinal {
            value: representative,
        })?;

    Ok(OwnedLegend::new(representative, &label.unwrap_or_default()))
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{
        super::sql::assert_placeholders_dense, edge_legend_statement, node_legend_statement,
    };
    use crate::dataset::TemporalAxes;

    /// Both legend statements cite exactly the parameters they bind.
    #[test]
    fn statements_cite_their_whole_bind_list() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        let statement = node_legend_statement(&axes, &types);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = edge_legend_statement(&axes, &types);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered node-legend statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store. Reviewing a diff, hold it to the
    /// statement's own contract: the ordering is the node stream's, so positions agree under
    /// the frozen snapshot.
    #[test]
    fn node_statement_renders_its_pinned_text() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        insta::assert_snapshot!(node_legend_statement(&axes, &types).sql);
    }

    /// The rendered edge-legend statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store. Reviewing a diff, hold it to the
    /// statement's own contract: the ordering is the edge stream's link identity, so
    /// positions agree under the frozen snapshot.
    #[test]
    fn edge_statement_renders_its_pinned_text() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        insta::assert_snapshot!(edge_legend_statement(&axes, &types).sql);
    }
}
