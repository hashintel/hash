//! The corpus definition, as the shared fragments and the type-table bootstrap.
//!
//! [`scope`] is the one definition of the node universe and [`links`] composes the link universe
//! after it. Every statement that speaks about the corpus attaches these fragments to its WITH
//! clause, so the universe cannot drift between the type bootstrap, the node stream, and the
//! link stream: under the dataset's frozen snapshot, every execution of the same fragment
//! derives the identical row numbering.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, ColumnName, ColumnReference, CommonTableExpression, Constant,
    Correlation, Expression, FromItem, Function, GroupByClause, GroupingElement, NonEmptyVec,
    Placeholder, PostgresType, SelectClause, SelectExpression, SelectList, SelectStatement,
    SimpleSelect, SortBy, Table, WindowDefinition, WithClause,
    table::{
        DatabaseColumn, EntityEdge, EntityEditions, EntityEmbeddings, EntityIsOfType,
        EntityTemporalMetadata, OntologyIds,
    },
};

use super::{
    LINK_ROOT_BASE_URL,
    sql::{
        AttachmentVocabulary, Axes, MAPPING, Mapping, current_identity_join, edition_conjunction,
        type_mapping,
    },
    vocabulary::{CorpusTable, EditionSource, Links, Scope, TypeRows},
};
use crate::dataset::TemporalAxes;

/// The subquery deciding whether an edition is typed by the link entity type.
///
/// The test resolves the type through the store's materialized type closure and anchors on
/// the type's base URL rather than a version-pinned ontology id. It keys on the edition's own
/// type rather than on the edges it has, so a link with a missing left attachment is still no
/// point glyph.
///
/// # SQL
///
/// ```sql
/// SELECT
/// FROM entity_is_of_type AS is_link
/// INNER JOIN ontology_ids AS link_type
///   ON link_type.ontology_id = is_link.entity_type_ontology_id
///  AND link_type.base_url = <link_root>
/// WHERE is_link.entity_edition_id = <edition>
/// ```
pub(crate) fn link_typed(
    edition: impl Into<Expression>,
    link_root: Placeholder,
) -> SelectStatement {
    const IS_LINK: Aliased<EntityIsOfType> = Aliased::of(Table::EntityIsOfType, "is_link");
    const LINK_TYPE: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "link_type");

    SelectStatement::builder()
        .select_clause(
            SimpleSelect::builder()
                .selects({
                    // SELECT
                    Vec::new()
                })
                .from({
                    // FROM entity_is_of_type AS is_link
                    // JOIN ontology_ids AS link_type
                    //   ON link_type.ontology_id = is_link.entity_type_ontology_id
                    //  AND link_type.base_url = <link_root>
                    IS_LINK.from_item().inner_join_on(
                        LINK_TYPE.from_item(),
                        vec![
                            LINK_TYPE
                                .column(&OntologyIds::OntologyId)
                                .equal(IS_LINK.column(&EntityIsOfType::EntityTypeOntologyId)),
                            LINK_TYPE.column(&OntologyIds::BaseUrl).equal(link_root),
                        ],
                    )
                })
                .where_clause({
                    // WHERE is_link.entity_edition_id = <edition>
                    IS_LINK
                        .column(&EntityIsOfType::EntityEditionId)
                        .equal(edition)
                }),
        )
        .build()
}

/// Builds the node universe: the body of the `scope` table.
///
/// `scope` is every non-draft, non-archived, non-link entity holding a whole-entity embedding
/// whose edition is current at the dataset's temporal axes, with its dense row assigned by
/// canonical `(web_id, entity_uuid)` order. The ordering key is the entity's immutable identity,
/// so under the frozen snapshot every statement attaching this fragment re-derives the
/// identical numbering.
///
/// The embedding join is the admission condition rather than an enrichment: an entity without a
/// whole-entity embedding has no position to fit. One row per identity is the embedding table's
/// unique index promise (`(web_id, entity_uuid, property)` `NULLS NOT DISTINCT`), so
/// `row_number` cannot assign twice. `entity_temporal_metadata.draft_id` alone decides the draft
/// axis: the embedding table's own draft column never enters, because the unique index already
/// guarantees one whole-entity row per identity.
///
/// # SQL
///
/// ```sql
/// SELECT meta.web_id, meta.entity_uuid, meta.entity_edition_id,
///     row_number() OVER (ORDER BY meta.web_id, meta.entity_uuid) - 1 AS row
/// FROM entity_embeddings AS embedding
/// INNER JOIN entity_temporal_metadata AS meta ON <the identity join>
/// INNER JOIN entity_editions AS edition ON <the edition join>
/// WHERE embedding.property IS NULL AND NOT EXISTS (<link-typed>)
/// ```
pub(crate) fn scope(axes: Axes, link_root: Placeholder) -> SelectStatement {
    const EMBEDDING: Aliased<EntityEmbeddings> = Aliased::of(Table::EntityEmbeddings, "embedding");
    const META: Aliased<EntityTemporalMetadata> =
        Aliased::of(Table::EntityTemporalMetadata, "meta");
    const EDITION: Aliased<EntityEditions> = Aliased::of(Table::EntityEditions, "edition");

    // `row_number() OVER (ORDER BY meta.web_id, meta.entity_uuid) - 1`
    let row = Expression::from(Function::RowNumber)
        .window(
            WindowDefinition::builder().order_by(NonEmptyVec::from_array([
                SortBy::ascending(META.column(&EntityTemporalMetadata::WebId)),
                SortBy::ascending(META.column(&EntityTemporalMetadata::EntityUuid)),
            ])),
        )
        .subtract(Constant::U32(1));

    SelectStatement::builder()
        .select_clause(
            SimpleSelect::builder()
                .selects(vec![
                    // SELECT
                    //     meta.web_id AS web_id,
                    //     meta.entity_uuid AS entity_uuid,
                    //     meta.entity_edition_id AS entity_edition_id,
                    //     row_number() OVER (ORDER BY meta.web_id, meta.entity_uuid) - 1 AS row
                    SelectExpression::aliased(
                        META.column(&EntityTemporalMetadata::WebId),
                        Scope::WebId.name().into_identifier(),
                    ),
                    SelectExpression::aliased(
                        META.column(&EntityTemporalMetadata::EntityUuid),
                        Scope::EntityUuid.name().into_identifier(),
                    ),
                    SelectExpression::aliased(
                        META.column(&EntityTemporalMetadata::EditionId),
                        Scope::EntityEditionId.name().into_identifier(),
                    ),
                    SelectExpression::aliased(row, Scope::Row.name().into_identifier()),
                ])
                .from({
                    // FROM entity_embeddings AS embedding
                    // JOIN entity_temporal_metadata AS meta
                    //   ON meta.web_id = embedding.web_id
                    //  AND meta.entity_uuid = embedding.entity_uuid
                    //  AND <currency conditions>
                    // JOIN entity_editions AS edition
                    //   ON edition.entity_edition_id = meta.entity_edition_id AND NOT
                    // edition.archived
                    EMBEDDING
                        .from_item()
                        .inner_join_on(
                            META.from_item(),
                            current_identity_join(
                                META,
                                axes,
                                EMBEDDING.column(&EntityEmbeddings::WebId),
                                EMBEDDING.column(&EntityEmbeddings::EntityUuid),
                            ),
                        )
                        .inner_join_on(
                            EDITION.from_item(),
                            edition_conjunction(
                                EDITION,
                                META.column(&EntityTemporalMetadata::EditionId),
                            ),
                        )
                })
                .where_clause({
                    // WHERE embedding.property IS NULL AND NOT EXISTS (<link-typed>)
                    Expression::all(vec![
                        EMBEDDING.column(&EntityEmbeddings::Property).is_null(),
                        Expression::exists(link_typed(
                            META.column(&EntityTemporalMetadata::EditionId),
                            link_root,
                        ))
                        .not(),
                    ])
                }),
        )
        .build()
}

/// Builds the link universe: the body of the `links` table, composed after [`scope`].
///
/// A link entity's outgoing `has-left-entity` and `has-right-entity` edges self-join into the
/// link's single `(source, target)` pair - the graph admits no hypergraphs - and both endpoints
/// resolve through `scope`. Densification and admission happen in one motion, so a link whose
/// endpoint falls outside the corpus drops with its endpoint, and the delivered rows are exactly
/// the node stream's positions. The link entity itself passes the same temporal and archival
/// conditions as any node.
///
/// # SQL
///
/// ```sql
/// SELECT left_edge.source_web_id, left_edge.source_entity_uuid, meta.entity_edition_id,
///     source.row, target.row, left_edge.confidence, right_edge.confidence
/// FROM entity_edge AS left_edge
/// INNER JOIN entity_edge AS right_edge ON <the same source, kind has-right, outgoing>
/// INNER JOIN scope AS source ON <left_edge's target identity>
/// INNER JOIN scope AS target ON <right_edge's target identity>
/// INNER JOIN entity_temporal_metadata AS meta ON <the identity join>
/// INNER JOIN entity_editions AS edition ON <the edition join>
/// WHERE left_edge.kind = <has_left> AND left_edge.direction = <outgoing>
/// ```
pub(crate) fn links(axes: Axes, attachments: AttachmentVocabulary) -> SelectStatement {
    const LEFT_EDGE: Aliased<EntityEdge> = Aliased::of(Table::EntityEdge, "left_edge");
    const RIGHT_EDGE: Aliased<EntityEdge> = Aliased::of(Table::EntityEdge, "right_edge");
    const SOURCE: Aliased<Scope> = Aliased::renaming(CorpusTable::Scope.as_str(), "source");
    const TARGET: Aliased<Scope> = Aliased::renaming(CorpusTable::Scope.as_str(), "target");
    const META: Aliased<EntityTemporalMetadata> =
        Aliased::of(Table::EntityTemporalMetadata, "meta");
    const EDITION: Aliased<EntityEditions> = Aliased::of(Table::EntityEditions, "edition");

    // Resolves the edge's target to its scope row, densifying the endpoint.
    let endpoint_join = |scope: Aliased<Scope>, edge: Aliased<EntityEdge>| {
        vec![
            scope
                .column(&Scope::WebId)
                .equal(edge.column(&EntityEdge::TargetWebId)),
            scope
                .column(&Scope::EntityUuid)
                .equal(edge.column(&EntityEdge::TargetEntityUuid)),
        ]
    };

    SelectStatement::from(
        SimpleSelect::builder()
            .selects(vec![
                // SELECT
                //     left_edge.source_web_id AS web_id,
                //     left_edge.source_entity_uuid AS entity_uuid,
                //     meta.entity_edition_id AS entity_edition_id,
                //     source.row AS source_row,
                //     target.row AS target_row,
                //     left_edge.confidence AS source_confidence,
                //     right_edge.confidence AS target_confidence
                SelectExpression::aliased(
                    LEFT_EDGE.column(&EntityEdge::SourceWebId),
                    Links::WebId.name().into_identifier(),
                ),
                SelectExpression::aliased(
                    LEFT_EDGE.column(&EntityEdge::SourceEntityUuid),
                    Links::EntityUuid.name().into_identifier(),
                ),
                SelectExpression::aliased(
                    META.column(&EntityTemporalMetadata::EditionId),
                    Links::EntityEditionId.name().into_identifier(),
                ),
                SelectExpression::aliased(
                    SOURCE.column(&Scope::Row),
                    Links::SourceRow.name().into_identifier(),
                ),
                SelectExpression::aliased(
                    TARGET.column(&Scope::Row),
                    Links::TargetRow.name().into_identifier(),
                ),
                SelectExpression::aliased(
                    LEFT_EDGE.column(&EntityEdge::Confidence),
                    Links::SourceConfidence.name().into_identifier(),
                ),
                SelectExpression::aliased(
                    RIGHT_EDGE.column(&EntityEdge::Confidence),
                    Links::TargetConfidence.name().into_identifier(),
                ),
            ])
            .from({
                // FROM entity_edge AS left_edge
                // JOIN entity_edge AS right_edge
                //   ON right_edge.source_web_id = left_edge.source_web_id
                //  AND right_edge.source_entity_uuid = left_edge.source_entity_uuid
                //  AND right_edge.kind = <has_right> AND right_edge.direction = <outgoing>
                // JOIN scope AS source ON source resolves left_edge's target
                // JOIN scope AS target ON target resolves right_edge's target
                // JOIN entity_temporal_metadata AS meta
                //   ON meta names the link entity AND <currency conditions>
                // JOIN entity_editions AS edition
                //   ON edition.entity_edition_id = meta.entity_edition_id AND NOT
                // edition.archived
                LEFT_EDGE
                    .from_item()
                    .inner_join_on(
                        RIGHT_EDGE.from_item(),
                        vec![
                            RIGHT_EDGE
                                .column(&EntityEdge::SourceWebId)
                                .equal(LEFT_EDGE.column(&EntityEdge::SourceWebId)),
                            RIGHT_EDGE
                                .column(&EntityEdge::SourceEntityUuid)
                                .equal(LEFT_EDGE.column(&EntityEdge::SourceEntityUuid)),
                            RIGHT_EDGE
                                .column(&EntityEdge::Kind)
                                .equal(attachments.has_right),
                            RIGHT_EDGE
                                .column(&EntityEdge::Direction)
                                .equal(attachments.outgoing),
                        ],
                    )
                    .inner_join_on(SOURCE.from_item(), endpoint_join(SOURCE, LEFT_EDGE))
                    .inner_join_on(TARGET.from_item(), endpoint_join(TARGET, RIGHT_EDGE))
                    .inner_join_on(
                        META.from_item(),
                        current_identity_join(
                            META,
                            axes,
                            LEFT_EDGE.column(&EntityEdge::SourceWebId),
                            LEFT_EDGE.column(&EntityEdge::SourceEntityUuid),
                        ),
                    )
                    .inner_join_on(
                        EDITION.from_item(),
                        edition_conjunction(
                            EDITION,
                            META.column(&EntityTemporalMetadata::EditionId),
                        ),
                    )
            })
            .where_clause({
                // WHERE left_edge.kind = <has_left> AND left_edge.direction = <outgoing>
                Expression::all(vec![
                    LEFT_EDGE
                        .column(&EntityEdge::Kind)
                        .equal(attachments.has_left),
                    LEFT_EDGE
                        .column(&EntityEdge::Direction)
                        .equal(attachments.outgoing),
                ])
            })
            .build(),
    )
}

/// The ordinal mapping [`type_rows`] aggregates: each type id beside its 0-based ordinal.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum TypeOrdinals {
    /// The type's ontology id.
    OntologyId,
    /// The type's 0-based position in the type table.
    Ordinal,
}

impl DatabaseColumn<'_> for TypeOrdinals {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::OntologyId => "ontology_id".into(),
            Self::Ordinal => "ordinal".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::Ordinal => PostgresType::Int8,
        }
    }
}

/// Builds per-edition ordinal arrays: the body of the `type_rows` table.
///
/// `types` is the ordinal-ordered type table and `S` names the table whose editions receive
/// their direct-type ordinals. The aggregation works over sets in one hash join, so its cost
/// scales with the edition count rather than with rendered output rows.
///
/// # SQL
///
/// ```sql
/// SELECT is_of_type.entity_edition_id,
///     array_agg(mapping.ordinal ORDER BY mapping.ordinal) AS ordinals
/// FROM entity_is_of_type AS is_of_type
/// INNER JOIN (<the 0-based ordinal mapping>) AS mapping
///   ON mapping.ontology_id = is_of_type.entity_type_ontology_id
/// WHERE is_of_type.inheritance_depth = 0
///   AND is_of_type.entity_edition_id IN (SELECT entity_edition_id FROM <S>)
/// GROUP BY is_of_type.entity_edition_id
/// ```
pub(crate) fn type_rows<S: EditionSource>(types: Placeholder) -> SelectStatement {
    const IS_OF_TYPE: Aliased<EntityIsOfType> = Aliased::of(Table::EntityIsOfType, "is_of_type");
    const ORDINALS: Correlation<TypeOrdinals> = Correlation::new("mapping");

    // `unnest ... WITH ORDINALITY` numbers from one and the ordinal is 0-based.
    let ordinals = SelectStatement::builder()
        .select_clause(
            SimpleSelect::builder()
                .selects(vec![
                    // SELECT mapping.ontology_id, mapping.ordinality - 1 AS ordinal
                    SelectExpression::new(MAPPING.column(&Mapping::OntologyId)),
                    SelectExpression::aliased(
                        MAPPING
                            .column(&Mapping::Ordinality)
                            .subtract(Constant::U32(1)),
                        TypeOrdinals::Ordinal.name().into_identifier(),
                    ),
                ])
                .from({
                    // FROM unnest(<types>) WITH ORDINALITY AS mapping(ontology_id, ordinality)
                    type_mapping(types)
                }),
        )
        .build();

    // SELECT <S's edition column> FROM <S>
    let source_editions = SelectStatement::builder()
        .select_clause(
            SimpleSelect::builder()
                .selects(vec![SelectExpression::new(ColumnReference {
                    correlation: None,
                    name: S::edition_column(),
                })])
                .from(FromItem::table(S::TABLE)),
        )
        .build();

    SelectStatement::builder()
        .select_clause(
            SimpleSelect::builder()
                .selects(vec![
                    // SELECT
                    //     is_of_type.entity_edition_id AS entity_edition_id,
                    //     array_agg(mapping.ordinal ORDER BY mapping.ordinal) AS ordinals
                    SelectExpression::aliased(
                        IS_OF_TYPE.column(&EntityIsOfType::EntityEditionId),
                        TypeRows::EntityEditionId.name().into_identifier(),
                    ),
                    SelectExpression::aliased(
                        Function::ArrayAgg {
                            expression: Box::new(ORDINALS.column(&TypeOrdinals::Ordinal)),
                            order_by: Some(
                                NonEmptyVec::from_array([SortBy::ascending(
                                    ORDINALS.column(&TypeOrdinals::Ordinal),
                                )])
                                .into(),
                            ),
                        },
                        TypeRows::Ordinals.name().into_identifier(),
                    ),
                ])
                .from({
                    // FROM entity_is_of_type AS is_of_type
                    // JOIN (<ordinals>) AS mapping
                    //   ON mapping.ontology_id = is_of_type.entity_type_ontology_id
                    IS_OF_TYPE.from_item().inner_join_on(
                        FromItem::subquery(ordinals).alias(ORDINALS).build(),
                        vec![
                            ORDINALS
                                .column(&TypeOrdinals::OntologyId)
                                .equal(IS_OF_TYPE.column(&EntityIsOfType::EntityTypeOntologyId)),
                        ],
                    )
                })
                .where_clause({
                    // WHERE is_of_type.inheritance_depth = 0
                    //   AND is_of_type.entity_edition_id = ANY(<source editions>)
                    Expression::all(vec![
                        IS_OF_TYPE
                            .column(&EntityIsOfType::InheritanceDepth)
                            .equal(Constant::U32(0)),
                        IS_OF_TYPE
                            .column(&EntityIsOfType::EntityEditionId)
                            .r#in(Expression::Select(Box::new(source_editions))),
                    ])
                })
                .group_by({
                    // GROUP BY is_of_type.entity_edition_id
                    GroupByClause::builder().grouping_elements(GroupingElement::Expressions(
                        NonEmptyVec::from(IS_OF_TYPE.column(&EntityIsOfType::EntityEditionId)),
                    ))
                }),
        )
        .build()
}

/// The output column of the type-table bootstrap.
pub(crate) struct TypeTableColumns {
    /// The reachable type's ontology id.
    pub ontology_id: usize,
}

/// Builds the type-table bootstrap statement.
///
/// The statement lists every type reachable from the corpus - the direct types of every scoped
/// edition and every corpus link's edition - in uuid byte order, so each result position is the
/// ontology row id.
///
/// # SQL
///
/// ```sql
/// WITH scope AS (<scope>), links AS (<links>)
/// SELECT DISTINCT ON (is_of_type.entity_type_ontology_id) is_of_type.entity_type_ontology_id
/// FROM (SELECT entity_edition_id FROM scope
///       UNION ALL SELECT entity_edition_id FROM links) AS editions
/// INNER JOIN entity_is_of_type AS is_of_type
///   ON is_of_type.entity_edition_id = editions.entity_edition_id
/// ORDER BY is_of_type.entity_type_ontology_id
/// ```
pub(crate) fn type_table_statement(axes: &TemporalAxes) -> BoundStatement<'_, TypeTableColumns> {
    const EDITIONS: Correlation<Scope> = Correlation::new("editions");
    const IS_OF_TYPE: Aliased<EntityIsOfType> = Aliased::of(Table::EntityIsOfType, "is_of_type");

    let mut binder = Binder::default();
    let axes_points = Axes::bind(&mut binder, axes);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);
    let attachments = AttachmentVocabulary::bind(&mut binder);

    // SELECT entity_edition_id FROM scope UNION ALL SELECT entity_edition_id FROM links
    let edition_column = |column: ColumnName<'static>, table: CorpusTable| {
        SimpleSelect::builder()
            .selects(vec![SelectExpression::new(ColumnReference {
                correlation: None,
                name: column,
            })])
            .from(FromItem::table(table))
            .build()
    };
    let corpus_editions = SelectClause::from(edition_column(
        Scope::EntityEditionId.name(),
        CorpusTable::Scope,
    ))
    .union_all(edition_column(
        Links::EntityEditionId.name(),
        CorpusTable::Links,
    ));

    let mut select = SelectList::default();
    let columns = TypeTableColumns {
        ontology_id: select.output(IS_OF_TYPE.column(&EntityIsOfType::EntityTypeOntologyId)),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH scope AS (<scope>), links AS (<links>)
            WithClause::builder().common_table_expressions(NonEmptyVec::from_array([
                CommonTableExpression::builder()
                    .name(CorpusTable::Scope)
                    .statement(scope(axes_points, link_root)),
                CommonTableExpression::builder()
                    .name(CorpusTable::Links)
                    .statement(links(axes_points, attachments)),
            ]))
        })
        .select_clause(
            SimpleSelect::builder()
                .distinct_on({
                    // SELECT DISTINCT ON (is_of_type.entity_type_ontology_id): with the
                    // ordering below this is `SELECT DISTINCT`, and uuid byte order is the
                    // ordinal contract anyway.
                    IS_OF_TYPE.column(&EntityIsOfType::EntityTypeOntologyId)
                })
                .selects(select.into_selects())
                .from({
                    // FROM (<corpus editions>) AS editions
                    // JOIN entity_is_of_type AS is_of_type
                    //   ON is_of_type.entity_edition_id = editions.entity_edition_id
                    FromItem::subquery(corpus_editions)
                        .alias(EDITIONS)
                        .build()
                        .inner_join_on(
                            IS_OF_TYPE.from_item(),
                            vec![
                                IS_OF_TYPE
                                    .column(&EntityIsOfType::EntityEditionId)
                                    .equal(EDITIONS.column(&Scope::EntityEditionId)),
                            ],
                        )
                }),
        )
        .order_by(NonEmptyVec::from_array(
            // ORDER BY is_of_type.entity_type_ontology_id
            [SortBy::ascending(
                IS_OF_TYPE.column(&EntityIsOfType::EntityTypeOntologyId),
            )],
        ))
        .build();

    BoundStatement::new(&statement, binder, columns)
}

#[cfg(test)]
mod tests {
    use super::{super::sql::assert_placeholders_dense, type_table_statement};
    use crate::dataset::TemporalAxes;

    /// The bootstrap statement cites exactly the parameters it binds.
    #[test]
    fn statement_cites_its_whole_bind_list() {
        let axes = TemporalAxes::now();

        let statement = type_table_statement(&axes);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store.
    #[test]
    fn statement_text() {
        let axes = TemporalAxes::now();

        insta::assert_snapshot!(type_table_statement(&axes).sql);
    }
}
