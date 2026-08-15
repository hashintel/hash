//! The request-shaped statements, answering lookups keyed by identities the caller supplies.
//!
//! A statement here binds everything it consumes - identity arrays, the cached type table, its
//! temporal axes - and answers about the state its executing transaction sees at those binds.
//! The dataset's own streams execute on the frozen snapshot transaction, so they answer about
//! exactly the state the corpus streams delivered. The classification lookup executes on its
//! caller's own connection at caller-supplied axes, so it answers about the store as it stands
//! rather than as a fit observed it. Result identity keys each item, so no statement here
//! orders its rows unless a consumer aligns them by position, and the two that do - the legend
//! and icon payloads - state the row order they share with their positional counterpart.

use futures::{Stream, stream};
use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, ColumnName, Constant, Correlation, Expression, FromItem,
    Function, OrderByExpression, Placeholder, PostgresType, ReferenceTable, SelectExpression,
    SelectList, SelectStatement, Table, Transpile as _, WhereExpression, WithExpression,
    table::{
        DatabaseColumn, EntityEdge, EntityEditionCache, EntityEditions, EntityEmbeddings,
        EntityTemporalMetadata, EntityTypeInheritsFrom, EntityTypes, OntologyIds,
    },
};
use hash_graph_store::query::Ordering;
use smallvec::SmallVec;
use tokio_postgres::{Row, Transaction, types::ToSql};
use type_system::{knowledge::entity::id::EntityEditionId, ontology::id::VersionedUrl};
use uuid::Uuid;

use super::{
    super::{
        CANONICAL_DIMENSIONS, Ontology, PROJECTOR_DIMENSIONS, TemporalAxes,
        auxiliary::{OwnedIcon, OwnedLabel, OwnedLegend},
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

/// The output columns of one embedding lookup.
pub(super) struct EmbeddingLookupColumns {
    /// The web the entity belongs to.
    pub web_id: usize,
    /// The entity's identity within its web.
    pub entity_uuid: usize,
    /// The requested projection of the whole-entity embedding.
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
) -> BoundStatement<'params, EmbeddingLookupColumns> {
    embedding_lookup(web_ids, entity_uuids, |embedding| {
        embedding.column(&EntityEmbeddings::Embedding)
    })
}

/// Builds the projector-input lookup over the requested identities.
///
/// The request shape is the canonical lookup's. The output is the embedding's l2-normalized
/// projector prefix through the node stream's own expression, so the connection carries
/// unit-norm prefixes and nothing wider, and an answer is bit-identical to the representation
/// row a fit reads for the same stored embedding.
pub(super) fn projector_embedding_statement<'params>(
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, EmbeddingLookupColumns> {
    embedding_lookup(web_ids, entity_uuids, streams::normalized_prefix)
}

/// Builds an embedding lookup over the requested identities, with the caller's projection.
fn embedding_lookup<'params>(
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
    projection: impl FnOnce(Aliased<EntityEmbeddings>) -> Expression,
) -> BoundStatement<'params, EmbeddingLookupColumns> {
    const EMBEDDING: Aliased<EntityEmbeddings> = Aliased::of(Table::EntityEmbeddings, "embeddings");

    let mut binder = Binder::default();
    let web_ids = binder.bind(web_ids);
    let entity_uuids = binder.bind(entity_uuids);

    // SELECT embeddings.web_id, embeddings.entity_uuid, <projection>
    let mut select = SelectList::default();
    let columns = EmbeddingLookupColumns {
        web_id: select.output(EMBEDDING.column(&EntityEmbeddings::WebId)),
        entity_uuid: select.output(EMBEDDING.column(&EntityEmbeddings::EntityUuid)),
        embedding: select.output(projection(EMBEDDING)),
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
    columns: &EmbeddingLookupColumns,
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

/// Decodes one projector-input row.
pub(super) fn decode_projector_embedding(
    row: &Row,
    columns: &EmbeddingLookupColumns,
) -> Result<(ArchivedEntityId, BoxedVecN<PROJECTOR_DIMENSIONS>), PostgresDatasetError> {
    let web_id: Uuid = row.try_get(columns.web_id)?;
    let entity_uuid: Uuid = row.try_get(columns.entity_uuid)?;
    let embedding: PgVector<PROJECTOR_DIMENSIONS> = row.try_get(columns.embedding)?;

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

/// The output columns of the classification lookup.
pub(super) struct ClassificationColumns {
    /// The web the entity belongs to.
    pub web_id: usize,
    /// The entity's identity within its web.
    pub entity_uuid: usize,
    /// Whether the resolved edition's type closure reaches the link entity type.
    pub link_typed: usize,
    /// The left attachment's endpoint web, SQL NULL without the edge.
    pub source_web_id: usize,
    /// The left attachment's endpoint entity, SQL NULL without the edge.
    pub source_entity_uuid: usize,
    /// The right attachment's endpoint web, SQL NULL without the edge.
    pub target_web_id: usize,
    /// The right attachment's endpoint entity, SQL NULL without the edge.
    pub target_entity_uuid: usize,
}

/// The node-versus-link verdict for one resolved identity.
///
/// The verdict applies the type law that also draws the corpus's node scope. An entity is a
/// link exactly when its type closure reaches the link entity type, whatever edges it holds.
/// Endpoints are entity identities, never resolved against any generation's rows, so the
/// verdict holds for entities no generation has fitted.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Classification {
    /// A non-link entity.
    Node,
    /// A link-typed entity, beside its outgoing attachment endpoints.
    Link {
        /// The left attachment's endpoint, or [`None`] when the store holds no such edge.
        source: Option<ArchivedEntityId>,
        /// The right attachment's endpoint, or [`None`] when the store holds no such edge.
        target: Option<ArchivedEntityId>,
    },
}

/// Builds the classification lookup over the requested identities.
///
/// The statement decides the node-versus-link split for every requested identity that resolves
/// at the bound axes, and delivers a link's outgoing attachment endpoints in the same row. The
/// endpoint joins are outer, so a link with an absent or incomplete attachment pair still
/// answers, with its missing endpoints SQL NULL. The caller counts the answers against its
/// requests. A missing row is an identity that is draft-only, archived, or absent at the axes.
pub(super) fn classification_statement<'params>(
    axes: &'params TemporalAxes,
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, ClassificationColumns> {
    const LEFT_EDGE: Aliased<EntityEdge> = Aliased::of(Table::EntityEdge, "left_edge");
    const RIGHT_EDGE: Aliased<EntityEdge> = Aliased::of(Table::EntityEdge, "right_edge");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);
    let attachments = AttachmentVocabulary::bind(&mut binder);
    let web_ids = binder.bind(web_ids);
    let entity_uuids = binder.bind(entity_uuids);

    // SELECT
    //     requests.web_id,
    //     requests.entity_uuid,
    //     EXISTS (<link-typed>),
    //     left_edge.target_web_id,
    //     left_edge.target_entity_uuid,
    //     right_edge.target_web_id,
    //     right_edge.target_entity_uuid
    let mut select = SelectList::default();
    let columns = ClassificationColumns {
        web_id: select.output(CorpusTable::Requests.column(Requests::WebId)),
        entity_uuid: select.output(CorpusTable::Requests.column(Requests::EntityUuid)),
        link_typed: select.output(Expression::exists(corpus::link_typed(
            CorpusTable::Requests.column(Requests::EntityEditionId),
            link_root,
        ))),
        source_web_id: select.output(LEFT_EDGE.column(&EntityEdge::TargetWebId)),
        source_entity_uuid: select.output(LEFT_EDGE.column(&EntityEdge::TargetEntityUuid)),
        target_web_id: select.output(RIGHT_EDGE.column(&EntityEdge::TargetWebId)),
        target_entity_uuid: select.output(RIGHT_EDGE.column(&EntityEdge::TargetEntityUuid)),
    };

    // Joins one outgoing attachment edge by its kind, keeping identities without one.
    let attachment_join = |edge: Aliased<EntityEdge>, kind: Placeholder| {
        vec![
            edge.column(&EntityEdge::SourceWebId)
                .equal(CorpusTable::Requests.column(Requests::WebId)),
            edge.column(&EntityEdge::SourceEntityUuid)
                .equal(CorpusTable::Requests.column(Requests::EntityUuid)),
            edge.column(&EntityEdge::Kind).equal(kind),
            edge.column(&EntityEdge::Direction)
                .equal(attachments.outgoing),
        ]
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH requests AS (<requests>)
            WithExpression::default().with_statement(
                CorpusTable::Requests,
                requests(axes_points, web_ids, entity_uuids),
            )
        })
        .selects(select.into_selects())
        .from({
            // FROM requests
            // LEFT JOIN entity_edge AS left_edge
            //   ON left_edge is the identity's outgoing has-left-entity edge
            // LEFT JOIN entity_edge AS right_edge
            //   ON right_edge is the identity's outgoing has-right-entity edge
            FromItem::table(CorpusTable::Requests)
                .build()
                .left_join_on(
                    LEFT_EDGE.from_item(),
                    attachment_join(LEFT_EDGE, attachments.has_left),
                )
                .left_join_on(
                    RIGHT_EDGE.from_item(),
                    attachment_join(RIGHT_EDGE, attachments.has_right),
                )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Decodes one classification row.
pub(super) fn decode_classification(
    row: &Row,
    columns: &ClassificationColumns,
) -> Result<(ArchivedEntityId, Classification), PostgresDatasetError> {
    // Both columns of an endpoint come from one joined edge row, so they are null together and
    // `zip` collapses exactly the no-edge case.
    let endpoint = |web_id: usize, entity_uuid: usize| {
        let web_id: Option<Uuid> = row.try_get(web_id)?;
        let entity_uuid: Option<Uuid> = row.try_get(entity_uuid)?;

        Ok::<_, PostgresDatasetError>(web_id.zip(entity_uuid).map(|(web_id, entity_uuid)| {
            ArchivedEntityId {
                web_id: web_id.into(),
                entity_uuid: entity_uuid.into(),
            }
        }))
    };

    let web_id: Uuid = row.try_get(columns.web_id)?;
    let entity_uuid: Uuid = row.try_get(columns.entity_uuid)?;
    let link_typed: bool = row.try_get(columns.link_typed)?;

    let classification = if link_typed {
        Classification::Link {
            source: endpoint(columns.source_web_id, columns.source_entity_uuid)?,
            target: endpoint(columns.target_web_id, columns.target_entity_uuid)?,
        }
    } else {
        Classification::Node
    };

    Ok((
        ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        classification,
    ))
}

/// The output columns of the legend payload statements.
pub(super) struct LegendColumns {
    /// The display label, SQL NULL when the edition carries none.
    pub label: usize,
    /// The representative type's type-table ordinal, SQL NULL when the row resolves none.
    pub representative: usize,
}

/// The edition cache's first display label, unwrapped by the decoder.
fn first_label(cache: Aliased<EntityEditionCache>) -> Expression {
    cache.column(&EntityEditionCache::Labels).array_element(1)
}

/// The type-table position joined for the edition cache's first type.
fn representative_ordinal() -> Expression {
    // mapping.ordinality - 1
    MAPPING
        .column(&Mapping::Ordinality)
        .subtract(Constant::U32(1))
}

/// The joins resolving the edition cache's first type to its type-table ordinal.
///
/// Both joins are outer: a row without a cache entry, and a first type outside the type table,
/// leave the ordinal SQL NULL for the decoder to refuse.
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
pub(super) fn node_legend_statement<'params>(
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
pub(super) fn edge_legend_statement<'params>(
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
pub(super) fn decode_legend(
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

/// The display payload of one entity edition, as the store states it.
///
/// The label is the edition's cached display text, empty when the cache holds none. The first
/// type is the edition's first cached type as a store uuid rather than a generation ordinal,
/// because an edition written after a fit can carry a type no generation tabulated. Resolving
/// the uuid against a generation's type table is the holder's step, and a miss there means the
/// edition displays no icon under that generation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct EditionDisplay {
    /// The cached display text, empty when the edition carries none.
    pub label: OwnedLabel,
    /// The first cached type's ontology uuid, [`None`] when the cache resolves none.
    pub first_type: Option<ArchivedOntologyTypeUuid>,
}

impl EditionDisplay {
    /// Returns the display's retained heap in bytes: the label's text, exactly.
    pub(crate) fn heap_bytes(&self) -> usize {
        AsRef::<str>::as_ref(&*self.label).len()
    }
}

/// The column of the unnested edition requests, introduced by [`edition_requests`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum EditionRequest {
    /// The requested edition.
    EntityEditionId,
}

impl DatabaseColumn<'_> for EditionRequest {
    fn name(&self) -> ColumnName<'static> {
        "entity_edition_id".into()
    }

    fn postgres_type(&self) -> PostgresType {
        PostgresType::Uuid
    }
}

/// The alias the edition-display statement gives the unnested edition ids.
const EDITION_REQUEST: Correlation<EditionRequest> = Correlation::new("request");

/// The bound edition ids as a FROM item, one row per requested edition.
///
/// Builds `unnest(<edition_ids>) AS request(entity_edition_id)`.
fn edition_requests(edition_ids: Placeholder) -> FromItem<'static> {
    FromItem::function(Function::Unnest(vec![
        Expression::from(edition_ids).cast(uuid_array()),
    ]))
    .alias(EDITION_REQUEST)
    .column_aliases(vec![EditionRequest::EntityEditionId.name()])
    .build()
}

/// The output columns of the edition-display statement.
pub(super) struct EditionDisplayColumns {
    /// The requested edition.
    pub edition: usize,
    /// The display label, SQL NULL when the edition carries none.
    pub label: usize,
    /// The first cached type's ontology uuid, SQL NULL when the cache resolves none.
    pub first_type: usize,
}

/// Builds the display lookup over the requested editions.
///
/// The statement answers every requested edition exactly once, because both joins are outer and
/// the unnested requests survive them. The statement binds no temporal axes. An edition id
/// addresses one immutable row, so the answer is the same at any read.
pub(super) fn edition_display_statement(
    edition_ids: &(impl ToSql + Sync),
) -> BoundStatement<'_, EditionDisplayColumns> {
    const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");
    const FIRST_TYPE: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "first_type");

    let mut binder = Binder::default();
    let edition_ids = binder.bind(edition_ids);

    // SELECT request.entity_edition_id, (cache.labels)[1], first_type.ontology_id
    let mut select = SelectList::default();
    let columns = EditionDisplayColumns {
        edition: select.output(EDITION_REQUEST.column(&EditionRequest::EntityEditionId)),
        label: select.output(first_label(CACHE)),
        first_type: select.output(FIRST_TYPE.column(&OntologyIds::OntologyId)),
    };

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from({
            // FROM unnest(<edition_ids>) AS request(entity_edition_id)
            // LEFT JOIN entity_edition_cache AS cache
            //   ON cache.entity_edition_id = request.entity_edition_id
            // LEFT JOIN ontology_ids AS first_type
            //   ON first_type.base_url = (cache.base_urls)[1]
            //  AND first_type.version = (cache.versions)[1]
            edition_requests(edition_ids)
                .left_join_on(
                    CACHE.from_item(),
                    vec![
                        CACHE
                            .column(&EntityEditionCache::EntityEditionId)
                            .equal(EDITION_REQUEST.column(&EditionRequest::EntityEditionId)),
                    ],
                )
                .left_join_on(
                    FIRST_TYPE.from_item(),
                    vec![
                        FIRST_TYPE
                            .column(&OntologyIds::BaseUrl)
                            .equal(CACHE.column(&EntityEditionCache::BaseUrls).array_element(1)),
                        FIRST_TYPE
                            .column(&OntologyIds::Version)
                            .equal(CACHE.column(&EntityEditionCache::Versions).array_element(1)),
                    ],
                )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Decodes one edition-display row.
///
/// An edition without a cache row, and one whose cache holds no label, both decode as the empty
/// label, the disposition a fitted row's legend shares.
pub(super) fn decode_edition_display(
    row: &Row,
    columns: &EditionDisplayColumns,
) -> Result<(EntityEditionId, EditionDisplay), PostgresDatasetError> {
    let edition: Uuid = row.try_get(columns.edition)?;
    let label: Option<String> = row.try_get(columns.label)?;
    let first_type: Option<Uuid> = row.try_get(columns.first_type)?;

    Ok((
        EntityEditionId::new(edition),
        EditionDisplay {
            label: OwnedLabel::from(label.unwrap_or_default()),
            first_type: first_type.map(ArchivedOntologyTypeUuid::from),
        },
    ))
}

/// The display payload of one live link identity, as the store states it.
///
/// The label is the current edition's cached display text, empty when the cache holds none. The
/// first type is the same edition's first cached type as its versioned URL, read from the
/// cache's own canonical projection, so no generation's type table mediates the value. Both
/// follow the identity's current edition at the read's axes rather than any fit-time capture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LinkDisplay {
    /// The cached display text, empty when the edition carries none.
    pub label: OwnedLabel,
    /// The first cached type's versioned URL, [`None`] when the cache resolves none.
    pub first_type: Option<VersionedUrl>,
}

impl LinkDisplay {
    /// The payload of an identity the store does not resolve: the empty label and no type.
    #[must_use]
    pub(crate) fn empty() -> Self {
        Self {
            label: OwnedLabel::from(String::new()),
            first_type: None,
        }
    }
}

/// The output columns of the link-display statement.
pub(super) struct LinkDisplayColumns {
    /// The web the entity belongs to.
    pub web_id: usize,
    /// The entity's identity within its web.
    pub entity_uuid: usize,
    /// The display label, SQL NULL when the edition carries none.
    pub label: usize,
    /// The first cached type's versioned URL, SQL NULL when the cache resolves none.
    pub first_type: usize,
}

/// Builds the display lookup over the requested link identities.
///
/// The statement resolves each identity to its current edition at the bound axes and answers
/// that edition's cached label and first cached type as a versioned URL. The cache join is
/// outer, so a resolved identity without a cache row still answers, with both display columns
/// SQL NULL. The caller counts the answers against its requests. A missing row is an identity
/// that is draft-only, archived, or absent at the axes.
pub(super) fn link_display_statement<'params>(
    axes: &'params TemporalAxes,
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, LinkDisplayColumns> {
    const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let web_ids = binder.bind(web_ids);
    let entity_uuids = binder.bind(entity_uuids);

    // SELECT
    //     requests.web_id,
    //     requests.entity_uuid,
    //     (cache.labels)[1],
    //     (cache.versioned_urls)[1]
    let mut select = SelectList::default();
    let columns = LinkDisplayColumns {
        web_id: select.output(CorpusTable::Requests.column(Requests::WebId)),
        entity_uuid: select.output(CorpusTable::Requests.column(Requests::EntityUuid)),
        label: select.output(first_label(CACHE)),
        first_type: select.output(
            CACHE
                .column(&EntityEditionCache::VersionedUrls)
                .array_element(1),
        ),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH requests AS (<requests>)
            WithExpression::default().with_statement(
                CorpusTable::Requests,
                requests(axes_points, web_ids, entity_uuids),
            )
        })
        .selects(select.into_selects())
        .from({
            // FROM requests
            // LEFT JOIN entity_edition_cache AS cache
            //   ON cache.entity_edition_id = requests.entity_edition_id
            FromItem::table(CorpusTable::Requests).build().left_join_on(
                CACHE.from_item(),
                vec![
                    CACHE
                        .column(&EntityEditionCache::EntityEditionId)
                        .equal(CorpusTable::Requests.column(Requests::EntityEditionId)),
                ],
            )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Decodes one link-display row.
///
/// An identity whose current edition has no cache row, and one whose cache holds no label, both
/// decode as the empty label, the disposition a fitted row's legend shares.
pub(super) fn decode_link_display(
    row: &Row,
    columns: &LinkDisplayColumns,
) -> Result<(ArchivedEntityId, LinkDisplay), PostgresDatasetError> {
    let web_id: Uuid = row.try_get(columns.web_id)?;
    let entity_uuid: Uuid = row.try_get(columns.entity_uuid)?;
    let label: Option<String> = row.try_get(columns.label)?;
    let first_type: Option<VersionedUrl> = row.try_get(columns.first_type)?;

    Ok((
        ArchivedEntityId {
            web_id: web_id.into(),
            entity_uuid: entity_uuid.into(),
        },
        LinkDisplay {
            label: OwnedLabel::from(label.unwrap_or_default()),
            first_type,
        },
    ))
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
        canonical_embedding_statement, classification_statement, edge_legend_statement,
        link_display_statement, node_legend_statement, node_type_statement,
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

        let statement = classification_statement(&axes, &web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = link_display_statement(&axes, &web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = node_legend_statement(&axes, &types);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = edge_legend_statement(&axes, &types);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// A link with an absent or incomplete attachment pair still answers: both edge joins are
    /// outer, and an inner join would silently drop exactly the pathological rows the caller
    /// must log.
    #[test]
    fn classification_keeps_identities_without_attachments() {
        let axes = TemporalAxes::now();
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = classification_statement(&axes, &web_ids, &entity_uuids);
        let normalized = normalize(&statement.sql);

        assert_eq!(
            normalized
                .matches("LEFT OUTER JOIN \"entity_edge\"")
                .count(),
            2,
            "the classification lookup joins both attachment edges outer"
        );
        assert!(
            !normalized.contains("INNER JOIN \"entity_edge\""),
            "no attachment edge joins inner"
        );
    }

    /// A resolved identity without a cache row still answers: the cache join is outer, and an
    /// inner join would silently drop exactly the editions whose display the caller must default.
    #[test]
    fn link_display_keeps_identities_without_cache_rows() {
        let axes = TemporalAxes::now();
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = link_display_statement(&axes, &web_ids, &entity_uuids);
        let normalized = normalize(&statement.sql);

        assert_eq!(
            normalized
                .matches("LEFT OUTER JOIN \"entity_edition_cache\"")
                .count(),
            1,
            "the link-display lookup joins the edition cache outer"
        );
        assert!(
            !normalized.contains("INNER JOIN \"entity_edition_cache\""),
            "the edition cache never joins inner"
        );
    }

    /// The legend streams order exactly as their positional partners, which is the whole
    /// agreement that lets a payload row annotate the stream row at the same position.
    #[test]
    fn legend_streams_share_their_partners_ordering() {
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
            order_of(&streams::node_statement(&axes, &types).sql),
            "the node legends align to the node stream by shared ordering"
        );
        assert_eq!(
            order_of(&edge_legend_statement(&axes, &types).sql),
            order_of(&streams::edge_statement(&axes, &types).sql),
            "the edge legends align to the edge stream by shared ordering"
        );
    }
}
