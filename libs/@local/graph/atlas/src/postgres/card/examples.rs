//! The example facts, pooling live link instances per relation.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, ColumnName, Constant, Correlation, Expression, FromItem,
    Function, OrderByExpression, Placeholder, PostgresType, ReferenceTable, SelectExpression,
    SelectList, SelectStatement, Table, WhereExpression, WindowStatement, WithExpression,
    table::{
        DatabaseColumn, EntityEdge, EntityEditionCache, EntityEditions, EntityIsOfType,
        EntityTemporalMetadata, EntityTypeInheritsFrom, OntologyIds,
    },
};
use hash_graph_store::query::Ordering;
use tokio_postgres::{Row, Transaction, types::ToSql};
use uuid::Uuid;

use super::{
    super::{
        LINK_ROOT_BASE_URL,
        sql::{
            AttachmentVocabulary, Axes, MAPPING, Mapping, current_identity_join,
            edition_conjunction, time_axis_conjunction, type_mapping,
        },
    },
    CardParameters, OwnedExample, RelationFacts, fact_at,
};
use crate::dataset::TemporalAxes;

/// The field separator inside a stable hash's input, keeping the hashed tuple unambiguous.
///
/// Travels as a bound parameter, so the statement text carries no quoted literal.
const FIELD_SEPARATOR: &str = "|";

/// The direct-type marker of a source whose edition lists no direct types.
///
/// Travels as a bound parameter. The marker keeps the subgroup key and the hash input non-NULL,
/// so such sources form one subgroup instead of vanishing from the concatenation.
const NO_DIRECT_TYPE: &str = "";

/// The columns of the example pipeline's CTEs.
///
/// The pipeline's stages annotate one logical row: `links` carries the instance identity,
/// `raw_examples` adds the endpoints and their labels, and the scoring stages add frequencies
/// and ranks. One vocabulary serves every stage, so a stage alias can cite exactly the pipeline's
/// columns.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Example {
    /// The relation's 1-based position in the type table.
    Ordinality,
    /// The relation's ontology id.
    RelationId,
    /// The link instance's web.
    WebId,
    /// The link instance's identity within its web.
    EntityUuid,
    /// The source endpoint's web.
    SourceWebId,
    /// The source endpoint's identity within its web.
    SourceEntityUuid,
    /// The target endpoint's web.
    TargetWebId,
    /// The target endpoint's identity within its web.
    TargetEntityUuid,
    /// The source endpoint's display label.
    SourceLabel,
    /// The target endpoint's display label.
    TargetLabel,
    /// The source endpoint's first direct-type base id.
    SourceDirectType,
    /// The source endpoint's type-closure base ids, nearest first.
    SourceTypeClosure,
    /// The deterministic per-instance hash the pooling orders by.
    StableHash,
    /// The source endpoint's occurrence count among the relation's instances.
    SourceFrequency,
    /// The target endpoint's occurrence count among the relation's instances.
    TargetFrequency,
    /// The instance's rank among rows sharing its endpoint pair.
    PairRank,
    /// The pair's log-frequency recognizability score.
    Recognizability,
    /// The pair's rank within its source-direct-type subgroup.
    SubgroupRank,
    /// The pair's rank within its relation's pool.
    RelationRank,
}

impl DatabaseColumn<'_> for Example {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Ordinality => "ordinality".into(),
            Self::RelationId => "relation_id".into(),
            Self::WebId => "web_id".into(),
            Self::EntityUuid => "entity_uuid".into(),
            Self::SourceWebId => "source_web_id".into(),
            Self::SourceEntityUuid => "source_entity_uuid".into(),
            Self::TargetWebId => "target_web_id".into(),
            Self::TargetEntityUuid => "target_entity_uuid".into(),
            Self::SourceLabel => "source_label".into(),
            Self::TargetLabel => "target_label".into(),
            Self::SourceDirectType => "source_direct_type".into(),
            Self::SourceTypeClosure => "source_type_closure".into(),
            Self::StableHash => "stable_hash".into(),
            Self::SourceFrequency => "source_frequency".into(),
            Self::TargetFrequency => "target_frequency".into(),
            Self::PairRank => "pair_rank".into(),
            Self::Recognizability => "recognizability".into(),
            Self::SubgroupRank => "subgroup_rank".into(),
            Self::RelationRank => "relation_rank".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Ordinality
            | Self::SourceFrequency
            | Self::TargetFrequency
            | Self::PairRank
            | Self::SubgroupRank
            | Self::RelationRank => PostgresType::Int8,
            Self::RelationId
            | Self::WebId
            | Self::EntityUuid
            | Self::SourceWebId
            | Self::SourceEntityUuid
            | Self::TargetWebId
            | Self::TargetEntityUuid => PostgresType::Uuid,
            Self::SourceLabel | Self::TargetLabel | Self::SourceDirectType | Self::StableHash => {
                PostgresType::Text
            }
            Self::SourceTypeClosure => PostgresType::Array(Box::new(PostgresType::Text)),
            Self::Recognizability => PostgresType::Float8,
        }
    }
}

/// The CTE holding the type-table rows descending from the link root.
const RELATIONS: Correlation<Mapping> = Correlation::new("relations");
/// The CTE holding each relation's current non-draft instances.
const LINKS: Correlation<Example> = Correlation::new("links");
/// The CTE holding instances joined to both endpoints.
const RAW_EXAMPLES: Correlation<Example> = Correlation::new("raw_examples");
/// The CTE annotating endpoint frequencies and duplicate-pair ranks.
const SCORED_EXAMPLES: Correlation<Example> = Correlation::new("scored_examples");
/// The CTE keeping one row per endpoint pair, ranked within its subgroup.
const STRATIFIED_EXAMPLES: Correlation<Example> = Correlation::new("stratified_examples");
/// The CTE ordering each relation's pool deterministically.
const RANKED_EXAMPLES: Correlation<Example> = Correlation::new("ranked_examples");

/// Builds the `relations` table: the type-table rows descending from the link root.
fn relations(types: Placeholder, link_root: Placeholder) -> SelectStatement {
    const INHERITS: Correlation<EntityTypeInheritsFrom> = Correlation::new("inherits");
    const ROOT: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "root");

    SelectStatement::builder()
        .selects(vec![
            // SELECT mapping.ordinality, mapping.ontology_id
            SelectExpression::new(MAPPING.column(&Mapping::Ordinality)),
            SelectExpression::new(MAPPING.column(&Mapping::OntologyId)),
        ])
        .from({
            // FROM unnest(<types>) WITH ORDINALITY AS mapping(ontology_id, ordinality)
            // JOIN <the all-depth inheritance table> AS inherits
            //   ON inherits.source_entity_type_ontology_id = mapping.ontology_id
            // JOIN ontology_ids AS root
            //   ON root.ontology_id = inherits.target_entity_type_ontology_id
            //  AND root.base_url = <link_root>
            type_mapping(types)
                .inner_join_on(
                    FromItem::table(Table::Reference(ReferenceTable::EntityTypeInheritsFrom {
                        inheritance_depth: None,
                    }))
                    .alias(INHERITS)
                    .build(),
                    vec![
                        INHERITS
                            .column(&EntityTypeInheritsFrom::SourceEntityTypeOntologyId)
                            .equal(MAPPING.column(&Mapping::OntologyId)),
                    ],
                )
                .inner_join_on(
                    ROOT.from_item(),
                    vec![
                        ROOT.column(&OntologyIds::OntologyId).equal(
                            INHERITS.column(&EntityTypeInheritsFrom::TargetEntityTypeOntologyId),
                        ),
                        ROOT.column(&OntologyIds::BaseUrl).equal(link_root),
                    ],
                )
        })
        .build()
}

/// Builds the `links` table: each relation's current non-draft instances.
fn instances(axes: Axes) -> SelectStatement {
    const IS_OF_TYPE: Aliased<EntityIsOfType> = Aliased::of(Table::EntityIsOfType, "is_of_type");
    const TEMPORAL: Aliased<EntityTemporalMetadata> =
        Aliased::of(Table::EntityTemporalMetadata, "temporal");
    const EDITION: Aliased<EntityEditions> = Aliased::of(Table::EntityEditions, "edition");

    // temporal.entity_edition_id = is_of_type.entity_edition_id AND <currency conditions>
    let mut instance_gates = vec![
        TEMPORAL
            .column(&EntityTemporalMetadata::EditionId)
            .equal(IS_OF_TYPE.column(&EntityIsOfType::EntityEditionId)),
    ];
    instance_gates.extend(time_axis_conjunction(TEMPORAL, axes));

    SelectStatement::builder()
        .selects(vec![
            // SELECT
            //     relations.ordinality,
            //     relations.ontology_id AS relation_id,
            //     temporal.web_id AS web_id,
            //     temporal.entity_uuid AS entity_uuid
            SelectExpression::new(RELATIONS.column(&Mapping::Ordinality)),
            SelectExpression::aliased(
                RELATIONS.column(&Mapping::OntologyId),
                Example::RelationId.name().into_identifier(),
            ),
            SelectExpression::aliased(
                TEMPORAL.column(&EntityTemporalMetadata::WebId),
                Example::WebId.name().into_identifier(),
            ),
            SelectExpression::aliased(
                TEMPORAL.column(&EntityTemporalMetadata::EntityUuid),
                Example::EntityUuid.name().into_identifier(),
            ),
        ])
        .from({
            // FROM relations
            // JOIN entity_is_of_type AS is_of_type
            //   ON is_of_type.entity_type_ontology_id = relations.ontology_id
            //  AND is_of_type.inheritance_depth = 0
            // JOIN entity_temporal_metadata AS temporal
            //   ON temporal.entity_edition_id = is_of_type.entity_edition_id
            //  AND <currency conditions>
            // JOIN entity_editions AS edition
            //   ON edition.entity_edition_id = is_of_type.entity_edition_id
            //  AND NOT edition.archived
            FromItem::table(RELATIONS)
                .build()
                .inner_join_on(
                    IS_OF_TYPE.from_item(),
                    vec![
                        IS_OF_TYPE
                            .column(&EntityIsOfType::EntityTypeOntologyId)
                            .equal(RELATIONS.column(&Mapping::OntologyId)),
                        IS_OF_TYPE
                            .column(&EntityIsOfType::InheritanceDepth)
                            .equal(Constant::U32(0)),
                    ],
                )
                .inner_join_on(TEMPORAL.from_item(), instance_gates)
                .inner_join_on(
                    EDITION.from_item(),
                    edition_conjunction(
                        EDITION,
                        IS_OF_TYPE.column(&EntityIsOfType::EntityEditionId),
                    ),
                )
        })
        .build()
}

/// The endpoint aliases `raw_examples` resolves one edge's target through.
const LEFT_EDGE: Aliased<EntityEdge> = Aliased::of(Table::EntityEdge, "left_edge");
const RIGHT_EDGE: Aliased<EntityEdge> = Aliased::of(Table::EntityEdge, "right_edge");
const SOURCE_CACHE: Aliased<EntityEditionCache> =
    Aliased::of(Table::EntityEditionCache, "source_cache");
const TARGET_CACHE: Aliased<EntityEditionCache> =
    Aliased::of(Table::EntityEditionCache, "target_cache");

/// The edition cache's first display label: `(<cache>.labels)[1]`.
fn first_label(cache: Aliased<EntityEditionCache>) -> Expression {
    cache.column(&EntityEditionCache::Labels).array_element(1)
}

/// Builds the outputs of one raw example row.
fn raw_example_outputs(
    field_separator: Placeholder,
    no_direct_type: Placeholder,
) -> Vec<SelectExpression> {
    // The base ids of the source's direct types lead its closure array, `direct_types` many, so
    // the slice's first element is the first direct type, and NULL when the edition lists none.
    let direct_type = Expression::ArrayElement {
        expr: Box::new(Expression::ArraySlice {
            expr: Box::new(SOURCE_CACHE.column(&EntityEditionCache::BaseUrls)),
            lower: Box::new(Constant::U32(1).into()),
            upper: Box::new(SOURCE_CACHE.column(&EntityEditionCache::DirectTypes)),
        }),
        index: 1,
    };

    vec![
        // SELECT
        //     links.ordinality,
        //     links.relation_id,
        //     links.web_id,
        //     links.entity_uuid,
        //     left_edge.target_web_id AS source_web_id,
        //     left_edge.target_entity_uuid AS source_entity_uuid,
        //     right_edge.target_web_id AS target_web_id,
        //     right_edge.target_entity_uuid AS target_entity_uuid,
        //     (source_cache.labels)[1] AS source_label,
        //     (target_cache.labels)[1] AS target_label,
        //     COALESCE((source_cache.base_urls[1:source_cache.direct_types])[1], <marker>)
        //         AS source_direct_type,
        //     source_cache.base_urls AS source_type_closure,
        //     md5(concat_ws(<separator>, the instance and endpoint identities)) AS stable_hash
        SelectExpression::new(LINKS.column(&Example::Ordinality)),
        SelectExpression::new(LINKS.column(&Example::RelationId)),
        SelectExpression::new(LINKS.column(&Example::WebId)),
        SelectExpression::new(LINKS.column(&Example::EntityUuid)),
        SelectExpression::aliased(
            LEFT_EDGE.column(&EntityEdge::TargetWebId),
            Example::SourceWebId.name().into_identifier(),
        ),
        SelectExpression::aliased(
            LEFT_EDGE.column(&EntityEdge::TargetEntityUuid),
            Example::SourceEntityUuid.name().into_identifier(),
        ),
        SelectExpression::aliased(
            RIGHT_EDGE.column(&EntityEdge::TargetWebId),
            Example::TargetWebId.name().into_identifier(),
        ),
        SelectExpression::aliased(
            RIGHT_EDGE.column(&EntityEdge::TargetEntityUuid),
            Example::TargetEntityUuid.name().into_identifier(),
        ),
        SelectExpression::aliased(
            first_label(SOURCE_CACHE),
            Example::SourceLabel.name().into_identifier(),
        ),
        SelectExpression::aliased(
            first_label(TARGET_CACHE),
            Example::TargetLabel.name().into_identifier(),
        ),
        SelectExpression::aliased(
            direct_type.coalesce(no_direct_type),
            Example::SourceDirectType.name().into_identifier(),
        ),
        SelectExpression::aliased(
            SOURCE_CACHE.column(&EntityEditionCache::BaseUrls),
            Example::SourceTypeClosure.name().into_identifier(),
        ),
        SelectExpression::aliased(
            Function::Md5(Box::new(
                Function::ConcatWs {
                    separator: Box::new(field_separator.into()),
                    expressions: vec![
                        LINKS.column(&Example::RelationId),
                        LINKS.column(&Example::WebId),
                        LINKS.column(&Example::EntityUuid),
                        LEFT_EDGE.column(&EntityEdge::TargetWebId),
                        LEFT_EDGE.column(&EntityEdge::TargetEntityUuid),
                        RIGHT_EDGE.column(&EntityEdge::TargetWebId),
                        RIGHT_EDGE.column(&EntityEdge::TargetEntityUuid),
                    ],
                }
                .into(),
            )),
            Example::StableHash.name().into_identifier(),
        ),
    ]
}

/// Builds the `raw_examples` table: instances joined to both endpoints.
///
/// Both endpoints pass their own currency filters and resolve their edition-cache rows, and only
/// instances whose endpoints both carry a visible display label survive.
fn raw_examples(
    axes: Axes,
    attachments: AttachmentVocabulary,
    field_separator: Placeholder,
    no_direct_type: Placeholder,
) -> SelectStatement {
    const SOURCE_META: Aliased<EntityTemporalMetadata> =
        Aliased::of(Table::EntityTemporalMetadata, "source_meta");
    const TARGET_META: Aliased<EntityTemporalMetadata> =
        Aliased::of(Table::EntityTemporalMetadata, "target_meta");

    // <edge>.source names the link instance, with the wanted kind, outgoing
    let attachment_join = |edge: Aliased<EntityEdge>, kind: Placeholder| {
        vec![
            edge.column(&EntityEdge::SourceWebId)
                .equal(LINKS.column(&Example::WebId)),
            edge.column(&EntityEdge::SourceEntityUuid)
                .equal(LINKS.column(&Example::EntityUuid)),
            edge.column(&EntityEdge::Kind).equal(kind),
            edge.column(&EntityEdge::Direction)
                .equal(attachments.outgoing),
        ]
    };

    // A label that trims to nothing is no label.
    let visible_label = |cache: Aliased<EntityEditionCache>| {
        Expression::from(Function::CharLength(Box::new(
            Function::Btrim(Box::new(first_label(cache))).into(),
        )))
        .greater(Constant::U32(0))
    };

    SelectStatement::builder()
        .selects(raw_example_outputs(field_separator, no_direct_type))
        .from({
            // FROM links
            // JOIN entity_edge AS left_edge ON <the has-left attachment>
            // JOIN entity_edge AS right_edge ON <the has-right attachment>
            // JOIN entity_temporal_metadata AS source_meta
            //   ON source_meta names left_edge's target AND <currency conditions>
            // JOIN entity_temporal_metadata AS target_meta
            //   ON target_meta names right_edge's target AND <currency conditions>
            // JOIN entity_edition_cache AS source_cache
            //   ON source_cache.entity_edition_id = source_meta.entity_edition_id
            // JOIN entity_edition_cache AS target_cache
            //   ON target_cache.entity_edition_id = target_meta.entity_edition_id
            FromItem::table(LINKS)
                .build()
                .inner_join_on(
                    LEFT_EDGE.from_item(),
                    attachment_join(LEFT_EDGE, attachments.has_left),
                )
                .inner_join_on(
                    RIGHT_EDGE.from_item(),
                    attachment_join(RIGHT_EDGE, attachments.has_right),
                )
                .inner_join_on(
                    SOURCE_META.from_item(),
                    current_identity_join(
                        SOURCE_META,
                        axes,
                        LEFT_EDGE.column(&EntityEdge::TargetWebId),
                        LEFT_EDGE.column(&EntityEdge::TargetEntityUuid),
                    ),
                )
                .inner_join_on(
                    TARGET_META.from_item(),
                    current_identity_join(
                        TARGET_META,
                        axes,
                        RIGHT_EDGE.column(&EntityEdge::TargetWebId),
                        RIGHT_EDGE.column(&EntityEdge::TargetEntityUuid),
                    ),
                )
                .inner_join_on(
                    SOURCE_CACHE.from_item(),
                    vec![
                        SOURCE_CACHE
                            .column(&EntityEditionCache::EntityEditionId)
                            .equal(SOURCE_META.column(&EntityTemporalMetadata::EditionId)),
                    ],
                )
                .inner_join_on(
                    TARGET_CACHE.from_item(),
                    vec![
                        TARGET_CACHE
                            .column(&EntityEditionCache::EntityEditionId)
                            .equal(TARGET_META.column(&EntityTemporalMetadata::EditionId)),
                    ],
                )
        })
        .where_expression({
            // WHERE both endpoint labels trim to something visible
            WhereExpression::from_iter([visible_label(SOURCE_CACHE), visible_label(TARGET_CACHE)])
        })
        .build()
}

/// Builds the `scored_examples` table: endpoint frequencies and duplicate-pair ranks.
fn scored_examples() -> SelectStatement {
    // count(*) OVER (PARTITION BY ordinality, <the endpoint's identity>) AS <the frequency>
    let frequency = |web_id: Example, entity_uuid: Example, alias: Example| {
        SelectExpression::aliased(
            Expression::Window(
                Box::new(Function::Count(None).into()),
                WindowStatement::partition_by(RAW_EXAMPLES.column(&Example::Ordinality))
                    .then_partition_by(RAW_EXAMPLES.column(&web_id))
                    .then_partition_by(RAW_EXAMPLES.column(&entity_uuid)),
            ),
            alias.name().into_identifier(),
        )
    };

    SelectStatement::builder()
        .selects(vec![
            // SELECT *,
            //     count(*) OVER (PARTITION BY the relation and the source) AS source_frequency,
            //     count(*) OVER (PARTITION BY the relation and the target) AS target_frequency,
            //     row_number() OVER (
            //         PARTITION BY the relation and the endpoint pair ORDER BY stable_hash
            //     ) AS pair_rank
            SelectExpression::Asterisk(None),
            frequency(
                Example::SourceWebId,
                Example::SourceEntityUuid,
                Example::SourceFrequency,
            ),
            frequency(
                Example::TargetWebId,
                Example::TargetEntityUuid,
                Example::TargetFrequency,
            ),
            SelectExpression::aliased(
                Expression::Window(
                    Box::new(Function::RowNumber.into()),
                    WindowStatement::partition_by(RAW_EXAMPLES.column(&Example::Ordinality))
                        .then_partition_by(RAW_EXAMPLES.column(&Example::SourceWebId))
                        .then_partition_by(RAW_EXAMPLES.column(&Example::SourceEntityUuid))
                        .then_partition_by(RAW_EXAMPLES.column(&Example::TargetWebId))
                        .then_partition_by(RAW_EXAMPLES.column(&Example::TargetEntityUuid))
                        .then_order_by(
                            RAW_EXAMPLES.column(&Example::StableHash),
                            Ordering::Ascending,
                            None,
                        ),
                ),
                Example::PairRank.name().into_identifier(),
            ),
        ])
        .from({
            // FROM raw_examples
            FromItem::table(RAW_EXAMPLES)
        })
        .build()
}

/// Builds the `stratified_examples` table: one row per endpoint pair, ranked per subgroup.
fn stratified_examples() -> SelectStatement {
    // ln(1 + <the frequency>): a frequency counts at least the row it annotates, so the sum
    // stays integral and its logarithm equals the fractional form's.
    let log_frequency = |column: Example| {
        Expression::from(Function::Ln(Box::new(
            Expression::from(Constant::U32(1)).add(SCORED_EXAMPLES.column(&column)),
        )))
    };

    SelectStatement::builder()
        .selects(vec![
            // SELECT *,
            //     ln(1 + source_frequency) + ln(1 + target_frequency) AS recognizability,
            //     row_number() OVER (
            //         PARTITION BY ordinality, source_direct_type ORDER BY stable_hash
            //     ) AS subgroup_rank
            SelectExpression::Asterisk(None),
            SelectExpression::aliased(
                log_frequency(Example::SourceFrequency)
                    .add(log_frequency(Example::TargetFrequency)),
                Example::Recognizability.name().into_identifier(),
            ),
            SelectExpression::aliased(
                Expression::Window(
                    Box::new(Function::RowNumber.into()),
                    WindowStatement::partition_by(SCORED_EXAMPLES.column(&Example::Ordinality))
                        .then_partition_by(SCORED_EXAMPLES.column(&Example::SourceDirectType))
                        .then_order_by(
                            SCORED_EXAMPLES.column(&Example::StableHash),
                            Ordering::Ascending,
                            None,
                        ),
                ),
                Example::SubgroupRank.name().into_identifier(),
            ),
        ])
        .from({
            // FROM scored_examples WHERE pair_rank = 1
            FromItem::table(SCORED_EXAMPLES)
        })
        .where_expression(WhereExpression::from_iter([SCORED_EXAMPLES
            .column(&Example::PairRank)
            .equal(Constant::U32(1))]))
        .build()
}

/// Builds the `ranked_examples` table: each relation's pool in deterministic order.
fn ranked_examples(field_separator: Placeholder, subgroup_pool: Placeholder) -> SelectStatement {
    // md5(relation_id::text || <separator> || source_direct_type): hashing the relation and
    // subgroup ids interleaves subgroups in an order that is deterministic yet uncorrelated
    // with subgroup names.
    let subgroup_shuffle =
        Expression::from(Function::Md5(Box::new(Expression::concatenate(vec![
            STRATIFIED_EXAMPLES
                .column(&Example::RelationId)
                .cast(PostgresType::Text),
            field_separator.into(),
            STRATIFIED_EXAMPLES.column(&Example::SourceDirectType),
        ]))));

    // row_number() OVER (
    //     PARTITION BY ordinality
    //     ORDER BY subgroup_rank, <the subgroup shuffle>, recognizability DESC, stable_hash
    // ) AS relation_rank
    let window = WindowStatement::partition_by(STRATIFIED_EXAMPLES.column(&Example::Ordinality))
        .then_order_by(
            STRATIFIED_EXAMPLES.column(&Example::SubgroupRank),
            Ordering::Ascending,
            None,
        )
        .then_order_by(subgroup_shuffle, Ordering::Ascending, None)
        .then_order_by(
            STRATIFIED_EXAMPLES.column(&Example::Recognizability),
            Ordering::Descending,
            None,
        )
        .then_order_by(
            STRATIFIED_EXAMPLES.column(&Example::StableHash),
            Ordering::Ascending,
            None,
        );

    SelectStatement::builder()
        .selects(vec![
            // SELECT *, <the pool ranking window> AS relation_rank
            SelectExpression::Asterisk(None),
            SelectExpression::aliased(
                Expression::Window(Box::new(Function::RowNumber.into()), window),
                Example::RelationRank.name().into_identifier(),
            ),
        ])
        .from({
            // FROM stratified_examples WHERE subgroup_rank <= <subgroup pool>
            FromItem::table(STRATIFIED_EXAMPLES)
        })
        .where_expression(WhereExpression::from_iter([STRATIFIED_EXAMPLES
            .column(&Example::SubgroupRank)
            .less_or_equal(subgroup_pool)]))
        .build()
}

/// The output columns of the example statement.
struct ExampleColumns {
    ordinality: usize,
    web_id: usize,
    entity_uuid: usize,
    source_web_id: usize,
    source_entity_uuid: usize,
    target_web_id: usize,
    target_entity_uuid: usize,
    source_label: usize,
    target_label: usize,
    source_direct_type: usize,
    source_type_closure: usize,
    source_frequency: usize,
    target_frequency: usize,
}

/// Builds the example statement.
///
/// The stages after `raw_examples` score, dedup by endpoint pair, and pool per relation in
/// `stable_hash` order: `scored_examples` counts endpoint frequencies and ranks duplicate pairs,
/// `stratified_examples` keeps one row per pair and ranks within each source-direct-type
/// subgroup, and `ranked_examples` orders each relation's pool deterministically.
///
/// # SQL
///
/// ```sql
/// WITH relations AS (<relations>),
///     links AS (<instances>),
///     raw_examples AS (<raw_examples>),
///     scored_examples AS (<scored_examples>),
///     stratified_examples AS (<stratified_examples>),
///     ranked_examples AS (<ranked_examples>)
/// SELECT <the identity, label, closure, and frequency columns of each pooled row>
/// FROM ranked_examples
/// WHERE relation_rank <= <pool>
/// ORDER BY ranked_examples.ordinality, ranked_examples.relation_rank
/// ```
fn example_statement<'params>(
    axes: &'params TemporalAxes,
    types: &'params (impl ToSql + Sync),
    subgroup_pool: &'params i64,
    pool: &'params i64,
) -> BoundStatement<'params, ExampleColumns> {
    let mut binder = Binder::default();
    let types_placeholder = binder.bind(types);
    let axes_points = Axes::bind(&mut binder, axes);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);
    let attachments = AttachmentVocabulary::bind(&mut binder);
    let field_separator = binder.bind(&FIELD_SEPARATOR);
    let no_direct_type = binder.bind(&NO_DIRECT_TYPE);
    let subgroup_pool_placeholder = binder.bind(subgroup_pool);
    let pool_placeholder = binder.bind(pool);

    // SELECT the identity, label, closure, and frequency columns of each pooled row
    let mut select = SelectList::default();
    let output =
        |select: &mut SelectList, column: Example| select.output(RANKED_EXAMPLES.column(&column));
    let columns = ExampleColumns {
        ordinality: output(&mut select, Example::Ordinality),
        web_id: output(&mut select, Example::WebId),
        entity_uuid: output(&mut select, Example::EntityUuid),
        source_web_id: output(&mut select, Example::SourceWebId),
        source_entity_uuid: output(&mut select, Example::SourceEntityUuid),
        target_web_id: output(&mut select, Example::TargetWebId),
        target_entity_uuid: output(&mut select, Example::TargetEntityUuid),
        source_label: output(&mut select, Example::SourceLabel),
        target_label: output(&mut select, Example::TargetLabel),
        source_direct_type: output(&mut select, Example::SourceDirectType),
        source_type_closure: output(&mut select, Example::SourceTypeClosure),
        source_frequency: output(&mut select, Example::SourceFrequency),
        target_frequency: output(&mut select, Example::TargetFrequency),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH relations AS (..), links AS (..), raw_examples AS (..),
            //     scored_examples AS (..), stratified_examples AS (..), ranked_examples AS (..)
            WithExpression::default()
                .with_statement(RELATIONS, relations(types_placeholder, link_root))
                .with_statement(LINKS, instances(axes_points))
                .with_statement(
                    RAW_EXAMPLES,
                    raw_examples(axes_points, attachments, field_separator, no_direct_type),
                )
                .with_statement(SCORED_EXAMPLES, scored_examples())
                .with_statement(STRATIFIED_EXAMPLES, stratified_examples())
                .with_statement(
                    RANKED_EXAMPLES,
                    ranked_examples(field_separator, subgroup_pool_placeholder),
                )
        })
        .selects(select.into_selects())
        .from({
            // FROM ranked_examples WHERE relation_rank <= <pool>
            FromItem::table(RANKED_EXAMPLES)
        })
        .where_expression(WhereExpression::from_iter([RANKED_EXAMPLES
            .column(&Example::RelationRank)
            .less_or_equal(pool_placeholder)]))
        .order_by_expression({
            // ORDER BY ranked_examples.ordinality, ranked_examples.relation_rank
            OrderByExpression::default()
                .with(
                    RANKED_EXAMPLES.column(&Example::Ordinality),
                    Ordering::Ascending,
                    None,
                )
                .with(
                    RANKED_EXAMPLES.column(&Example::RelationRank),
                    Ordering::Ascending,
                    None,
                )
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

// A window count includes the row it annotates, so the value is at least
// 1 and the fallback never fires.
fn frequency(value: i64) -> u64 {
    u64::try_from(value).unwrap_or(1)
}

// The bound rides to Postgres as a bigint; a configuration large enough
// to overflow it saturates to "no bound".
fn pool_bound(count: usize, factor: usize) -> i64 {
    i64::try_from(count.saturating_mul(factor)).unwrap_or(i64::MAX)
}

/// Applies one example row to its relation's facts.
fn apply_row(
    row: &Row,
    columns: &ExampleColumns,
    facts: &mut [RelationFacts],
) -> Result<(), tokio_postgres::Error> {
    let fact = fact_at(facts, row.try_get(columns.ordinality)?);

    let link_web_id: Uuid = row.try_get(columns.web_id)?;
    let link_entity_uuid: Uuid = row.try_get(columns.entity_uuid)?;
    let source_web_id: Uuid = row.try_get(columns.source_web_id)?;
    let source_entity_uuid: Uuid = row.try_get(columns.source_entity_uuid)?;
    let target_web_id: Uuid = row.try_get(columns.target_web_id)?;
    let target_entity_uuid: Uuid = row.try_get(columns.target_entity_uuid)?;
    fact.forbidden.extend(
        [
            link_web_id,
            link_entity_uuid,
            source_web_id,
            source_entity_uuid,
            target_web_id,
            target_entity_uuid,
        ]
        .iter()
        .map(Uuid::to_string),
    );

    fact.examples.push(OwnedExample {
        link_id: format!("{link_web_id}~{link_entity_uuid}"),
        source_id: format!("{source_web_id}~{source_entity_uuid}"),
        target_id: format!("{target_web_id}~{target_entity_uuid}"),
        source_label: row.try_get(columns.source_label)?,
        target_label: row.try_get(columns.target_label)?,
        source_direct_type: row.try_get(columns.source_direct_type)?,
        source_type_closure: row.try_get(columns.source_type_closure)?,
        source_frequency: frequency(row.try_get(columns.source_frequency)?),
        target_frequency: frequency(row.try_get(columns.target_frequency)?),
    });

    Ok(())
}

/// Fetches pooled example candidates over each link type's instances.
///
/// Instances are entities whose direct type is the relation, current and non-draft at the
/// dataset's axes, with both endpoints equally current and carrying a visible display label. One
/// row survives per endpoint pair, frequencies count each endpoint's occurrences among the
/// relation's instances before that dedup, and pooling bounds transfer per source-direct-type
/// subgroup first, then per relation, in a deterministic hash order.
pub(super) async fn example_rows(
    transaction: &Transaction<'_>,
    axes: TemporalAxes,
    parameters: CardParameters,
    types: &[Uuid],
    facts: &mut [RelationFacts],
) -> Result<(), tokio_postgres::Error> {
    let subgroup_pool = pool_bound(parameters.example_count, parameters.subgroup_pool_factor);
    let pool = pool_bound(parameters.example_count, parameters.pool_factor);

    let statement = example_statement(&axes, &types, &subgroup_pool, &pool);
    let rows = transaction
        .query(&statement.sql, &statement.parameters)
        .await?;

    for row in rows {
        apply_row(&row, &statement.columns, facts)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{super::super::sql::assert_placeholders_dense, example_statement};
    use crate::dataset::TemporalAxes;

    /// The example statement cites exactly the parameters it binds.
    #[test]
    fn statement_cites_its_whole_bind_list() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        let statement = example_statement(&axes, &types, &64, &256);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store.
    #[test]
    fn statement_renders_its_pinned_text() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        insta::assert_snapshot!(example_statement(&axes, &types, &64, &256).sql);
    }
}
