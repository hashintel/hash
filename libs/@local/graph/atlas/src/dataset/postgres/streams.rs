//! The row streams, as the node and edge statements with their decoders.
//!
//! Each statement builder returns a [`BoundStatement`], which carries the SQL beside the bind
//! list in placeholder order and the output column indices its select list assigned. The decoder
//! beside each builder consumes those indices, so the select list and the decode sites cannot
//! disagree about positions.

use alloc::borrow::Cow;

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, Expression, FromItem, Function, OrderByExpression,
    PostgresType, SelectList, SelectStatement, Table, WithExpression,
    table::{EntityEditions, EntityEmbeddings},
};
use hash_graph_store::query::Ordering;
use tokio_postgres::{Row, types::ToSql};
use uuid::Uuid;

use super::{
    super::{Edge, Node, PROJECTOR_DIMENSIONS, TemporalAxes},
    PostgresDatasetError,
};
use crate::{
    identity::NodeRowId,
    math::UnitFraction,
    postgres::{
        LINK_ROOT_BASE_URL, corpus,
        id::ArchivedEntityId,
        node_types::ontology_rows,
        sql::{AttachmentVocabulary, Axes},
        vector::{PgVector, normalized_prefix},
        vocabulary::{CorpusTable, Links, Scope, TypeRows},
    },
};

/// The edition's direct-type ordinals from `type_rows`, or the empty array.
///
/// An edition holding no direct types has no `type_rows` row, and its answer is the empty
/// ordinal array rather than SQL NULL.
fn ordinals_or_empty() -> Expression {
    // COALESCE(type_rows.ordinals, ARRAY[]::int8[])
    CorpusTable::TypeRows
        .column(TypeRows::Ordinals)
        .coalesce(Function::ArrayLiteral {
            elements: Vec::new(),
            element_type: PostgresType::Int8,
        })
}

pub(super) struct NodeColumns {
    /// The web the entity belongs to.
    pub web_id: usize,
    /// The entity's identity within its web.
    pub entity_uuid: usize,
    /// The l2-normalized projector prefix.
    pub embedding: usize,
    /// The store's confidence in the entity.
    pub confidence: usize,
    /// The direct-type ordinals, ascending.
    pub ordinals: usize,
}

/// Builds the node stream's statement, ordered by node row.
///
/// The ordering is the scope row, which is what makes stream position the row id.
///
/// # SQL
///
/// ```sql
/// WITH scope AS (<scope>), type_rows AS (<type_rows>)
/// SELECT scope.web_id, scope.entity_uuid,
///     l2_normalize(subvector(embedding.embedding, 1, <prefix>))::vector(<prefix>),
///     edition.confidence, COALESCE(type_rows.ordinals, ARRAY[]::int8[])
/// FROM scope
/// INNER JOIN entity_embeddings AS embedding ON <the identity, whole-entity rows only>
/// INNER JOIN entity_editions AS edition
///   ON edition.entity_edition_id = scope.entity_edition_id
/// LEFT JOIN type_rows ON type_rows.entity_edition_id = scope.entity_edition_id
/// ORDER BY scope.row
/// ```
pub(super) fn node_statement<'params>(
    axes: &'params TemporalAxes,
    types: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, NodeColumns> {
    const EMBEDDING: Aliased<EntityEmbeddings> = Aliased::of(Table::EntityEmbeddings, "embedding");
    const EDITION: Aliased<EntityEditions> = Aliased::of(Table::EntityEditions, "edition");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);
    let types_placeholder = binder.bind(types);

    // SELECT
    //     scope.web_id,
    //     scope.entity_uuid,
    //     l2_normalize(subvector(embedding.embedding, 1, <prefix>))::vector(<prefix>),
    //     edition.confidence,
    //     COALESCE(type_rows.ordinals, ARRAY[]::int8[])
    let mut select = SelectList::default();
    let columns = NodeColumns {
        web_id: select.output(CorpusTable::Scope.column(Scope::WebId)),
        entity_uuid: select.output(CorpusTable::Scope.column(Scope::EntityUuid)),
        embedding: select.output(normalized_prefix(EMBEDDING)),
        confidence: select.output(EDITION.column(&EntityEditions::Confidence)),
        ordinals: select.output(ordinals_or_empty()),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH scope AS (<scope>), type_rows AS (<type_rows>)
            WithExpression::default()
                .with_statement(CorpusTable::Scope, corpus::scope(axes_points, link_root))
                .with_statement(
                    CorpusTable::TypeRows,
                    corpus::type_rows::<Scope>(types_placeholder),
                )
        })
        .selects(select.into_selects())
        .from({
            // FROM scope
            // JOIN entity_embeddings AS embedding
            //   ON embedding.web_id = scope.web_id
            //  AND embedding.entity_uuid = scope.entity_uuid
            //  AND embedding.property IS NULL
            // JOIN entity_editions AS edition
            //   ON edition.entity_edition_id = scope.entity_edition_id
            // LEFT JOIN type_rows
            //   ON type_rows.entity_edition_id = scope.entity_edition_id
            FromItem::table(CorpusTable::Scope)
                .build()
                .inner_join_on(
                    EMBEDDING.from_item(),
                    vec![
                        EMBEDDING
                            .column(&EntityEmbeddings::WebId)
                            .equal(CorpusTable::Scope.column(Scope::WebId)),
                        EMBEDDING
                            .column(&EntityEmbeddings::EntityUuid)
                            .equal(CorpusTable::Scope.column(Scope::EntityUuid)),
                        EMBEDDING.column(&EntityEmbeddings::Property).is_null(),
                    ],
                )
                .inner_join_on(
                    EDITION.from_item(),
                    vec![
                        EDITION
                            .column(&EntityEditions::EditionId)
                            .equal(CorpusTable::Scope.column(Scope::EntityEditionId)),
                    ],
                )
                .left_join_on(
                    FromItem::table(CorpusTable::TypeRows).build(),
                    vec![
                        CorpusTable::TypeRows
                            .column(TypeRows::EntityEditionId)
                            .equal(CorpusTable::Scope.column(Scope::EntityEditionId)),
                    ],
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

/// Decodes one node row.
pub(super) fn decode_node(
    row: &Row,
    columns: &NodeColumns,
) -> Result<Node<'static, ArchivedEntityId>, PostgresDatasetError> {
    let web_id: Uuid = row.try_get(columns.web_id)?;
    let entity_uuid: Uuid = row.try_get(columns.entity_uuid)?;
    let embedding: PgVector<PROJECTOR_DIMENSIONS> = row.try_get(columns.embedding)?;
    let confidence: Option<UnitFraction> = row.try_get(columns.confidence)?;
    let ordinals: Vec<i64> = row.try_get(columns.ordinals)?;

    Ok(Node {
        id: ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        ontology: ontology_rows(ordinals)?,
        embedding: Cow::Owned(embedding.0),
        confidence,
    })
}

/// The output columns of the edge stream.
pub(super) struct EdgeColumns {
    /// The web the link entity belongs to.
    pub web_id: usize,
    /// The link entity's identity within its web.
    pub entity_uuid: usize,
    /// The source endpoint's node row.
    pub source: usize,
    /// The target endpoint's node row.
    pub target: usize,
    /// The direct-type ordinals, ascending.
    pub ordinals: usize,
    /// The link entity's own l2-normalized projector prefix, when the store holds one.
    pub embedding: usize,
    /// The store's confidence in the link entity.
    pub confidence: usize,
    /// The store's confidence in the left attachment.
    pub source_confidence: usize,
    /// The store's confidence in the right attachment.
    pub target_confidence: usize,
}

/// Builds the edge stream's statement, ordered by link identity.
///
/// Link identity is already a total order, since the store admits exactly one attachment pair
/// per link entity. The endpoint-row keys ride behind it as inert tiebreakers.
///
/// # SQL
///
/// ```sql
/// WITH scope AS (<scope>), links AS (<links>), type_rows AS (<type_rows>)
/// SELECT links.web_id, links.entity_uuid, links.source_row, links.target_row,
///     COALESCE(type_rows.ordinals, ARRAY[]::int8[]),
///     l2_normalize(subvector(embedding.embedding, 1, <prefix>))::vector(<prefix>),
///     edition.confidence, links.source_confidence, links.target_confidence
/// FROM links
/// INNER JOIN entity_editions AS edition
///   ON edition.entity_edition_id = links.entity_edition_id
/// LEFT JOIN entity_embeddings AS embedding ON <the identity, whole-entity rows only>
/// LEFT JOIN type_rows ON type_rows.entity_edition_id = links.entity_edition_id
/// ORDER BY links.web_id, links.entity_uuid, links.source_row, links.target_row
/// ```
pub(super) fn edge_statement<'params>(
    axes: &'params TemporalAxes,
    types: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, EdgeColumns> {
    const EMBEDDING: Aliased<EntityEmbeddings> = Aliased::of(Table::EntityEmbeddings, "embedding");
    const EDITION: Aliased<EntityEditions> = Aliased::of(Table::EntityEditions, "edition");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);
    let attachments = AttachmentVocabulary::bind(&mut binder);
    let types_placeholder = binder.bind(types);

    // SELECT
    //     links.web_id,
    //     links.entity_uuid,
    //     links.source_row,
    //     links.target_row,
    //     COALESCE(type_rows.ordinals, ARRAY[]::int8[]),
    //     l2_normalize(subvector(embedding.embedding, 1, <prefix>))::vector(<prefix>),
    //     edition.confidence,
    //     links.source_confidence,
    //     links.target_confidence
    let mut select = SelectList::default();
    let columns = EdgeColumns {
        web_id: select.output(CorpusTable::Links.column(Links::WebId)),
        entity_uuid: select.output(CorpusTable::Links.column(Links::EntityUuid)),
        source: select.output(CorpusTable::Links.column(Links::SourceRow)),
        target: select.output(CorpusTable::Links.column(Links::TargetRow)),
        ordinals: select.output(ordinals_or_empty()),
        embedding: select.output(normalized_prefix(EMBEDDING)),
        confidence: select.output(EDITION.column(&EntityEditions::Confidence)),
        source_confidence: select.output(CorpusTable::Links.column(Links::SourceConfidence)),
        target_confidence: select.output(CorpusTable::Links.column(Links::TargetConfidence)),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH scope AS (<scope>), links AS (<links>), type_rows AS (<type_rows>)
            WithExpression::default()
                .with_statement(CorpusTable::Scope, corpus::scope(axes_points, link_root))
                .with_statement(CorpusTable::Links, corpus::links(axes_points, attachments))
                .with_statement(
                    CorpusTable::TypeRows,
                    corpus::type_rows::<Links>(types_placeholder),
                )
        })
        .selects(select.into_selects())
        .from({
            // FROM links
            // JOIN entity_editions AS edition
            //   ON edition.entity_edition_id = links.entity_edition_id
            // LEFT JOIN entity_embeddings AS embedding
            //   ON embedding.web_id = links.web_id
            //  AND embedding.entity_uuid = links.entity_uuid
            //  AND embedding.property IS NULL
            // LEFT JOIN type_rows
            //   ON type_rows.entity_edition_id = links.entity_edition_id
            FromItem::table(CorpusTable::Links)
                .build()
                .inner_join_on(
                    EDITION.from_item(),
                    [EDITION
                        .column(&EntityEditions::EditionId)
                        .equal(CorpusTable::Links.column(Links::EntityEditionId))],
                )
                .left_join_on(
                    EMBEDDING.from_item(),
                    [
                        EMBEDDING
                            .column(&EntityEmbeddings::WebId)
                            .equal(CorpusTable::Links.column(Links::WebId)),
                        EMBEDDING
                            .column(&EntityEmbeddings::EntityUuid)
                            .equal(CorpusTable::Links.column(Links::EntityUuid)),
                        EMBEDDING.column(&EntityEmbeddings::Property).is_null(),
                    ],
                )
                .left_join_on(
                    FromItem::table(CorpusTable::TypeRows).build(),
                    [CorpusTable::TypeRows
                        .column(TypeRows::EntityEditionId)
                        .equal(CorpusTable::Links.column(Links::EntityEditionId))],
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

/// Decodes one edge row.
pub(super) fn decode_edge(
    row: &Row,
    EdgeColumns {
        web_id,
        entity_uuid,
        source,
        target,
        ordinals,
        embedding,
        confidence,
        source_confidence,
        target_confidence,
    }: &EdgeColumns,
) -> Result<Edge<'static, ArchivedEntityId>, PostgresDatasetError> {
    let web_id: Uuid = row.try_get(web_id)?;
    let entity_uuid: Uuid = row.try_get(entity_uuid)?;
    let source: i64 = row.try_get(source)?;
    let target: i64 = row.try_get(target)?;
    let ordinals: Vec<i64> = row.try_get(ordinals)?;
    let embedding: Option<PgVector<PROJECTOR_DIMENSIONS>> = row.try_get(embedding)?;
    let confidence: Option<UnitFraction> = row.try_get(confidence)?;
    let source_confidence: Option<UnitFraction> = row.try_get(source_confidence)?;
    let target_confidence: Option<UnitFraction> = row.try_get(target_confidence)?;

    let row_id = |value: i64| {
        u64::try_from(value)
            .map(NodeRowId::new)
            .map_err(|_error| PostgresDatasetError::Ordinal { value })
    };

    Ok(Edge {
        id: ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        source: row_id(source)?,
        target: row_id(target)?,
        ontology: ontology_rows(ordinals)?,
        embedding: embedding.map(|vector| Cow::Owned(vector.0)),
        confidence,
        source_confidence,
        target_confidence,
    })
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{edge_statement, node_statement};
    use crate::{
        dataset::TemporalAxes,
        postgres::{
            legends::{edge_legend_statement, node_legend_statement},
            sql::{assert_placeholders_dense, normalize},
        },
    };

    /// Every stream statement cites exactly the parameters it binds.
    #[test]
    fn statements_cite_their_whole_bind_list() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        let statement = node_statement(&axes, &types);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = edge_statement(&axes, &types);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered node statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store. Reviewing a diff, hold it to the
    /// statement's own contract: the final ordering is the scope row, which is what makes
    /// stream position the row id.
    #[test]
    fn node_statement_text() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        insta::assert_snapshot!(node_statement(&axes, &types).sql);
    }

    /// The rendered edge statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store. Reviewing a diff, hold it to the
    /// statement's own contract: the final ordering is link identity, the total order the
    /// payload stream shares.
    #[test]
    fn edge_statement_text() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        insta::assert_snapshot!(edge_statement(&axes, &types).sql);
    }

    /// The legend streams order exactly as their positional partners, which is the whole
    /// agreement that lets a payload row annotate the stream row at the same position.
    #[test]
    fn legend_streams_share_their_partners_ordering() {
        #![expect(clippy::string_slice)]
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        let order_of = |sql: &str| {
            let normalized = normalize(sql);
            let position = normalized
                .rfind("ORDER BY")
                .expect("a positional statement orders its rows");
            normalized[position..].to_owned()
        };

        assert_eq!(
            order_of(&node_legend_statement(&axes, &types).sql),
            order_of(&node_statement(&axes, &types).sql),
            "the node legends align to the node stream by shared ordering"
        );
        assert_eq!(
            order_of(&edge_legend_statement(&axes, &types).sql),
            order_of(&edge_statement(&axes, &types).sql),
            "the edge legends align to the edge stream by shared ordering"
        );
    }
}
