//! The request-shaped statements, answering lookups keyed by identities the caller supplies.
//!
//! Every statement here resolves bound arrays or the cached type table against the same frozen
//! transaction the corpus streams read, so a lookup answers about exactly the state the streams
//! delivered. Result identity keys each item, so no statement here orders its rows unless a
//! consumer aligns them by position, and the two that do - the label and icon payloads - state
//! the row order they share with their positional counterpart.

use futures::{Stream, stream};
use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, ColumnName, Constant, Correlation, Expression, FromItem,
    Function, OrderByExpression, Placeholder, PostgresType, ReferenceTable, SelectExpression,
    SelectList, SelectStatement, Table, Transpile as _, WhereExpression, WithExpression,
    table::{
        DatabaseColumn, EntityEditionCache, EntityEditions, EntityEmbeddings,
        EntityTemporalMetadata, EntityTypeInheritsFrom, EntityTypes,
    },
};
use hash_graph_store::query::Ordering;
use smallvec::SmallVec;
use tokio_postgres::{Row, Transaction, types::ToSql};
use uuid::Uuid;

use super::{
    super::{
        CANONICAL_DIMENSIONS, Ontology, TemporalAxes,
        auxiliary::{OwnedIcon, OwnedLabel},
    },
    LINK_ROOT_BASE_URL, PostgresDatasetError, corpus,
    sql::{
        AttachmentVocabulary, Axes, MAPPING, Mapping, current_identity_join, edition_conjunction,
        json_field, json_text, type_mapping, uuid_array,
    },
    streams,
    vector::PgVector,
    vocabulary::{CorpusTable, Links, Requests, Scope, TypeRows},
};
use crate::{
    dataset::postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    identity::OntologyRowId,
    math::BoxedVecN,
};

/// The columns of the unnested request pair, introduced by [`request_pair`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Request {
    /// The requested web.
    WebId,
    /// The requested entity within its web.
    EntityUuid,
}

impl DatabaseColumn<'_> for Request {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::WebId => "web_id".into(),
            Self::EntityUuid => "entity_uuid".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        PostgresType::Uuid
    }
}

/// The alias every request-shaped statement gives the unnested identity pair.
const REQUEST: Correlation<Request> = Correlation::new("request");

/// The bound identity pair as a FROM item, one row per requested identity.
///
/// Builds `unnest(<web_ids>, <entity_uuids>) AS request(web_id, entity_uuid)`, which is the form
/// the store's paired `unnest` consumes.
fn request_pair(web_ids: Placeholder, entity_uuids: Placeholder) -> FromItem<'static> {
    FromItem::function(Function::Unnest(vec![
        Expression::from(web_ids).cast(uuid_array()),
        Expression::from(entity_uuids).cast(uuid_array()),
    ]))
    .alias(REQUEST)
    .column_aliases(vec![Request::WebId.name(), Request::EntityUuid.name()])
    .build()
}

/// Splits requested identities into the store's paired uuid arrays.
///
/// The pair binds as two aligned arrays, `web_ids` and `entity_uuids`, which is the form the
/// store's paired `unnest` consumes.
pub(super) fn request_arrays<I: Iterator<Item = ArchivedEntityId>>(
    nodes: I,
) -> (Vec<Uuid>, Vec<Uuid>) {
    nodes
        .map(|id| {
            (
                Uuid::from_bytes(id.web_id.to_bytes()),
                Uuid::from_bytes(id.entity_uuid.to_bytes()),
            )
        })
        .collect()
}

/// Builds the `requests` table: requested identities resolved to current editions.
///
/// The fragment densifies nothing. It resolves each requested identity to its current edition at
/// the dataset's axes, exactly the edition whose depth-0 type rows the node stream carries. An
/// identity that is draft-only, archived, or absent at the axes resolves to no row.
fn requests(axes: Axes, web_ids: Placeholder, entity_uuids: Placeholder) -> SelectStatement {
    const META: Aliased<EntityTemporalMetadata> =
        Aliased::of(Table::EntityTemporalMetadata, "meta");
    const EDITION: Aliased<EntityEditions> = Aliased::of(Table::EntityEditions, "edition");

    SelectStatement::builder()
        .selects(vec![
            // SELECT
            //     meta.web_id AS web_id,
            //     meta.entity_uuid AS entity_uuid,
            //     meta.entity_edition_id AS entity_edition_id
            SelectExpression::aliased(
                META.column(&EntityTemporalMetadata::WebId),
                Requests::WebId.name().into_identifier(),
            ),
            SelectExpression::aliased(
                META.column(&EntityTemporalMetadata::EntityUuid),
                Requests::EntityUuid.name().into_identifier(),
            ),
            SelectExpression::aliased(
                META.column(&EntityTemporalMetadata::EditionId),
                Requests::EntityEditionId.name().into_identifier(),
            ),
        ])
        .from({
            // FROM unnest(<web_ids>, <entity_uuids>) AS request(web_id, entity_uuid)
            // JOIN entity_temporal_metadata AS meta
            //   ON meta.web_id = request.web_id
            //  AND meta.entity_uuid = request.entity_uuid
            //  AND <currency conditions>
            // JOIN entity_editions AS edition
            //   ON edition.entity_edition_id = meta.entity_edition_id AND NOT edition.archived
            request_pair(web_ids, entity_uuids)
                .inner_join_on(
                    META.from_item(),
                    current_identity_join(
                        META,
                        axes,
                        REQUEST.column(&Request::WebId),
                        REQUEST.column(&Request::EntityUuid),
                    ),
                )
                .inner_join_on(
                    EDITION.from_item(),
                    edition_conjunction(EDITION, META.column(&EntityTemporalMetadata::EditionId)),
                )
        })
        .build()
}

/// The output columns of the canonical-embedding lookup.
pub(super) struct CanonicalEmbeddingColumns {
    /// The web the entity belongs to.
    pub web_id: usize,
    /// The entity's identity within its web.
    pub entity_uuid: usize,
    /// The full-width canonical embedding.
    pub embedding: usize,
}

/// Builds the canonical-embedding lookup over the requested identities.
///
/// The statement delivers the full-width embedding for every requested identity the store
/// holds a whole-entity embedding for. The caller counts the answers against its requests: a
/// missing row is the store not holding the embedding.
pub(super) fn canonical_embedding_statement<'params>(
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, CanonicalEmbeddingColumns> {
    const EMBEDDING: Aliased<EntityEmbeddings> = Aliased::of(Table::EntityEmbeddings, "embeddings");

    let mut binder = Binder::default();
    let web_ids = binder.bind(web_ids);
    let entity_uuids = binder.bind(entity_uuids);

    // SELECT embeddings.web_id, embeddings.entity_uuid, embeddings.embedding
    let mut select = SelectList::default();
    let columns = CanonicalEmbeddingColumns {
        web_id: select.output(EMBEDDING.column(&EntityEmbeddings::WebId)),
        entity_uuid: select.output(EMBEDDING.column(&EntityEmbeddings::EntityUuid)),
        embedding: select.output(EMBEDDING.column(&EntityEmbeddings::Embedding)),
    };

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from({
            // FROM unnest(<web_ids>, <entity_uuids>) AS request(web_id, entity_uuid)
            // JOIN entity_embeddings AS embeddings
            //   ON embeddings.web_id = request.web_id
            //  AND embeddings.entity_uuid = request.entity_uuid
            request_pair(web_ids, entity_uuids).inner_join_on(
                EMBEDDING.from_item(),
                vec![
                    EMBEDDING
                        .column(&EntityEmbeddings::WebId)
                        .equal(REQUEST.column(&Request::WebId)),
                    EMBEDDING
                        .column(&EntityEmbeddings::EntityUuid)
                        .equal(REQUEST.column(&Request::EntityUuid)),
                ],
            )
        })
        .where_expression({
            // WHERE embeddings.property IS NULL
            WhereExpression::from_iter([EMBEDDING.column(&EntityEmbeddings::Property).is_null()])
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Decodes one canonical-embedding row.
pub(super) fn decode_canonical_embedding(
    row: &Row,
    columns: &CanonicalEmbeddingColumns,
) -> Result<(ArchivedEntityId, BoxedVecN<CANONICAL_DIMENSIONS>), PostgresDatasetError> {
    let web_id: Uuid = row.try_get(columns.web_id)?;
    let entity_uuid: Uuid = row.try_get(columns.entity_uuid)?;
    let embedding: PgVector<CANONICAL_DIMENSIONS> = row.try_get(columns.embedding)?;

    Ok((
        ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        embedding.0,
    ))
}

/// The output columns of the node-type lookup.
pub(super) struct NodeTypeColumns {
    /// The web the entity belongs to.
    pub web_id: usize,
    /// The entity's identity within its web.
    pub entity_uuid: usize,
    /// The direct-type ordinals, ascending.
    pub ordinals: usize,
}

/// Builds the direct-type lookup over the requested identities.
pub(super) fn node_type_statement<'params>(
    axes: &'params TemporalAxes,
    types: &'params (impl ToSql + Sync),
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, NodeTypeColumns> {
    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let types_placeholder = binder.bind(types);
    let web_ids = binder.bind(web_ids);
    let entity_uuids = binder.bind(entity_uuids);

    let mut select = SelectList::default();
    let columns = NodeTypeColumns {
        // requests.web_id
        web_id: select.output(CorpusTable::Requests.column(Requests::WebId)),
        // requests.entity_uuid
        entity_uuid: select.output(CorpusTable::Requests.column(Requests::EntityUuid)),
        // An edition holding no direct types has no `type_rows` row, and its answer is the
        // empty ordinal list rather than SQL NULL.
        // COALESCE(type_rows.ordinals, ARRAY[]::int8[])
        ordinals: select.output(CorpusTable::TypeRows.column(TypeRows::Ordinals).coalesce(
            Function::ArrayLiteral {
                elements: Vec::new(),
                element_type: PostgresType::Int8,
            },
        )),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH requests AS (<requests>), type_rows AS (<type_rows>)
            WithExpression::default()
                .with_statement(
                    CorpusTable::Requests,
                    requests(axes_points, web_ids, entity_uuids),
                )
                .with_statement(
                    CorpusTable::TypeRows,
                    corpus::type_rows::<Requests>(types_placeholder),
                )
        })
        .selects(select.into_selects())
        .from({
            // FROM requests
            // LEFT JOIN type_rows
            //   ON type_rows.entity_edition_id = requests.entity_edition_id
            FromItem::table(CorpusTable::Requests).build().left_join_on(
                FromItem::table(CorpusTable::TypeRows).build(),
                vec![
                    CorpusTable::TypeRows
                        .column(TypeRows::EntityEditionId)
                        .equal(CorpusTable::Requests.column(Requests::EntityEditionId)),
                ],
            )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Decodes one direct-type row.
pub(super) fn decode_node_types(
    row: &Row,
    columns: &NodeTypeColumns,
) -> Result<(ArchivedEntityId, SmallVec<OntologyRowId, 2>), PostgresDatasetError> {
    let web_id: Uuid = row.try_get(columns.web_id)?;
    let entity_uuid: Uuid = row.try_get(columns.entity_uuid)?;
    let ordinals: Vec<i64> = row.try_get(columns.ordinals)?;

    Ok((
        ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        streams::ontology_rows(ordinals)?,
    ))
}

/// The output columns of the label payload statements.
pub(super) struct LabelColumns {
    /// The display label, SQL NULL when the edition carries none.
    pub label: usize,
}

/// The edition cache's first display label, unwrapped by the decoder.
fn first_label(cache: Aliased<EntityEditionCache>) -> Expression {
    cache.column(&EntityEditionCache::Labels).array_element(1)
}

/// Builds the node label statement, ordered by node row.
pub(super) fn node_label_statement(axes: &TemporalAxes) -> BoundStatement<'_, LabelColumns> {
    const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);

    // SELECT (cache.labels)[1]
    let mut select = SelectList::default();
    let columns = LabelColumns {
        label: select.output(CACHE.column(&EntityEditionCache::Labels).array_element(1)),
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
            FromItem::table(CorpusTable::Scope).build().left_join_on(
                CACHE.from_item(),
                vec![
                    CACHE
                        .column(&EntityEditionCache::EntityEditionId)
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

/// Builds the edge label statement, ordered by link identity.
pub(super) fn edge_label_statement(axes: &TemporalAxes) -> BoundStatement<'_, LabelColumns> {
    const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);
    let attachments = AttachmentVocabulary::bind(&mut binder);

    // SELECT (cache.labels)[1]
    let mut select = SelectList::default();
    let columns = LabelColumns {
        label: select.output(first_label(CACHE)),
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
            FromItem::table(CorpusTable::Links).build().left_join_on(
                CACHE.from_item(),
                vec![
                    CACHE
                        .column(&EntityEditionCache::EntityEditionId)
                        .equal(CorpusTable::Links.column(Links::EntityEditionId)),
                ],
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

/// Decodes one display-label row into its owned label.
///
/// An edition without a cached label decodes as the empty label.
pub(super) fn decode_label(
    row: &Row,
    columns: &LabelColumns,
) -> Result<OwnedLabel, PostgresDatasetError> {
    let label: Option<String> = row.try_get(columns.label)?;

    Ok(OwnedLabel::from(label.unwrap_or_default()))
}

/// Opens the ontology stream: each type's direct supertypes, in ontology row order.
///
/// Parents outside the type table cannot occur: the store materializes closures per edition, so
/// every depth-0 parent of a reachable type is itself reachable.
///
/// # Panics
///
/// This panics when the store returns a source outside the type table, which the statement's
/// own filter forbids.
pub(super) async fn ontology<'t>(
    transaction: &Transaction<'_>,
    types: &'t [Uuid],
) -> Result<
    impl Stream<Item = Result<Ontology<ArchivedOntologyTypeUuid>, PostgresDatasetError>> + use<'t>,
    PostgresDatasetError,
> {
    const INHERITS: Correlation<EntityTypeInheritsFrom> = Correlation::new("inherits");

    let mut binder = Binder::default();
    let types_placeholder = binder.bind(&types);

    let source = INHERITS.column(&EntityTypeInheritsFrom::SourceEntityTypeOntologyId);
    let target = INHERITS.column(&EntityTypeInheritsFrom::TargetEntityTypeOntologyId);

    // SELECT inherits.source_entity_type_ontology_id, inherits.target_entity_type_ontology_id
    let mut select = SelectList::default();
    let source_index = select.output(source.clone());
    let target_index = select.output(target.clone());

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from({
            // FROM <the all-depth inheritance table> AS inherits
            FromItem::table(Table::Reference(ReferenceTable::EntityTypeInheritsFrom {
                inheritance_depth: None,
            }))
            .alias(INHERITS)
            .build()
        })
        .where_expression({
            // WHERE inherits.depth = 0 AND the source = ANY(<types>)
            WhereExpression::from_iter([
                INHERITS
                    .column(&EntityTypeInheritsFrom::Depth)
                    .equal(Constant::U32(0)),
                source
                    .clone()
                    .r#in(Expression::from(types_placeholder).cast(uuid_array())),
            ])
        })
        .order_by_expression({
            // ORDER BY the source, then the target
            OrderByExpression::default()
                .with(source, Ordering::Ascending, None)
                .with(target, Ordering::Ascending, None)
        })
        .build();

    let sql = statement.transpile_to_string();
    let rows = transaction
        .query(&sql, &binder.into_parameters())
        .await
        .map_err(PostgresDatasetError::from)?;

    let mut parents = vec![SmallVec::<OntologyRowId, 2>::new(); types.len()];
    for row in &rows {
        let source: Uuid = row.try_get(source_index)?;
        let target: Uuid = row.try_get(target_index)?;

        let node = types
            .binary_search(&source)
            .expect("the parent query filters sources to the type table");
        if let Ok(parent) = types.binary_search(&target) {
            let ordinal =
                u64::try_from(parent).expect("the type table is shorter than u64::MAX rows");
            parents[node].push(OntologyRowId::new(ordinal));
        }
    }

    Ok(stream::iter(types.iter().zip(parents).map(
        |(id, parents)| {
            Ok(Ontology {
                id: (*id).into(),
                parents,
            })
        },
    )))
}

/// The columns of the unnested `allOf` entries an icon resolves through.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Display {
    /// The `allOf` entry itself.
    Value,
    /// The entry's 1-based position in the `allOf` array.
    Position,
}

impl DatabaseColumn<'_> for Display {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Value => "value".into(),
            Self::Position => "position".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Value => PostgresType::JsonB,
            Self::Position => PostgresType::Int8,
        }
    }
}

/// The one column the icon lateral delivers.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Icon {
    /// The selected icon text.
    Value,
}

impl DatabaseColumn<'_> for Icon {
    fn name(&self) -> ColumnName<'static> {
        "value".into()
    }

    fn postgres_type(&self) -> PostgresType {
        PostgresType::Text
    }
}

/// Opens the icon payload stream, in ontology row order.
pub(super) async fn ontology_icons<'t>(
    transaction: &Transaction<'_>,
    types: &'t [Uuid],
) -> Result<
    impl Stream<Item = Result<OwnedIcon, PostgresDatasetError>> + use<'t>,
    PostgresDatasetError,
> {
    const TYPES: Aliased<EntityTypes> = Aliased::of(Table::EntityTypes, "types");
    const DISPLAY: Correlation<Display> = Correlation::new("display");
    const ICON: Correlation<Icon> = Correlation::new("icon");
    /// The closed schema's inheritance list, one entry per `allOf` ancestor.
    const ALL_OF_KEY: &str = "allOf";
    /// An entry's icon, when the ancestor declares one.
    const ICON_KEY: &str = "icon";
    /// An entry's inheritance depth from the type itself.
    const DEPTH_KEY: &str = "depth";

    let mut binder = Binder::default();
    let types_placeholder = binder.bind(&types);

    let display_icon = || json_text(DISPLAY.column(&Display::Value), ICON_KEY);

    let nearest_icon = SelectStatement::builder()
        .selects(vec![
            // SELECT display.value ->> 'icon' AS value
            SelectExpression::aliased(display_icon(), Icon::Value.name().into_identifier()),
        ])
        .from(
            // FROM jsonb_array_elements(types.closed_schema -> 'allOf')
            //     WITH ORDINALITY AS display(value, position)
            FromItem::function(Function::JsonArrayElements(Box::new(json_field(
                TYPES.column(&EntityTypes::ClosedSchema),
                ALL_OF_KEY,
            ))))
            .with_ordinality(true)
            .alias(DISPLAY)
            .column_aliases(vec![Display::Value.name(), Display::Position.name()])
            .build(),
        )
        .where_expression({
            // WHERE display.value ->> 'icon' IS NOT NULL
            WhereExpression::from_iter([display_icon().is_not_null()])
        })
        .order_by_expression({
            // ORDER BY (display.value ->> 'depth')::int, display.position
            //
            // The selection rule mirrors the serving side's type-icon resolution in
            // `serve::hydrate`'s tile hydration query, and a change to either belongs in both.
            OrderByExpression::default()
                .with(
                    json_text(DISPLAY.column(&Display::Value), DEPTH_KEY)
                        .grouped()
                        .cast(PostgresType::Int4),
                    Ordering::Ascending,
                    None,
                )
                .with(
                    DISPLAY.column(&Display::Position),
                    Ordering::Ascending,
                    None,
                )
        })
        .limit({
            // LIMIT 1
            1
        })
        .build();

    // SELECT icon.value
    let mut select = SelectList::default();
    let icon_index = select.output(ICON.column(&Icon::Value));

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from({
            // FROM unnest(<types>) WITH ORDINALITY AS mapping(ontology_id, ordinality)
            // LEFT JOIN entity_types AS types ON types.ontology_id = mapping.ontology_id
            // LEFT JOIN LATERAL (<nearest icon>) AS icon ON TRUE
            //
            // LEFT joins keep every ordinal at exactly one output row: an inner join miss would
            // shift every later position instead of delivering an empty icon.
            type_mapping(types_placeholder)
                .left_join_on(
                    TYPES.from_item(),
                    vec![
                        TYPES
                            .column(&EntityTypes::OntologyId)
                            .equal(MAPPING.column(&Mapping::OntologyId)),
                    ],
                )
                .left_join_on(
                    FromItem::subquery(nearest_icon).alias(ICON).lateral(true),
                    Vec::<Expression>::new(),
                )
        })
        .order_by_expression({
            // ORDER BY mapping.ordinality
            OrderByExpression::default().with(
                MAPPING.column(&Mapping::Ordinality),
                Ordering::Ascending,
                None,
            )
        })
        .build();

    let sql = statement.transpile_to_string();
    let rows = transaction
        .query(&sql, &binder.into_parameters())
        .await
        .map_err(PostgresDatasetError::from)?;

    Ok(stream::iter(rows.into_iter().map(move |row| {
        let icon: Option<String> = row.try_get(icon_index)?;

        Ok(OwnedIcon::from(icon.unwrap_or_default()))
    })))
}

#[cfg(test)]
mod tests {
    #![expect(clippy::string_slice)]
    use uuid::Uuid;

    use super::{
        super::{
            sql::{assert_placeholders_dense, normalize},
            streams,
        },
        canonical_embedding_statement, edge_label_statement, node_label_statement,
        node_type_statement,
    };
    use crate::dataset::TemporalAxes;

    /// Every lookup statement cites exactly the parameters it binds.
    #[test]
    fn statements_cite_their_whole_bind_list() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = canonical_embedding_statement(&web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = node_type_statement(&axes, &types, &web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = node_label_statement(&axes);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = edge_label_statement(&axes);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The label streams order exactly as their positional partners, which is the whole
    /// agreement that lets a payload row annotate the stream row at the same position.
    #[test]
    fn label_streams_share_their_partners_ordering() {
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
            order_of(&node_label_statement(&axes).sql),
            order_of(&streams::node_statement(&axes, &types).sql),
            "the node labels align to the node stream by shared ordering"
        );
        assert_eq!(
            order_of(&edge_label_statement(&axes).sql),
            order_of(&streams::edge_statement(&axes, &types).sql),
            "the edge labels align to the edge stream by shared ordering"
        );
    }
}
