//! The hydration statements, composed as values of the store's statement AST.
//!
//! Every statement here resolves the caller's identity arrays against the store's current state:
//! the temporal join conditions compare against `now()`, so a hydration answers about the graph
//! as it stands when the statement runs. Input order rides the ordinality column, and absent
//! entities go missing from the result rather than arriving empty.
//!
//! # The masking contract
//!
//! Every read of an entity's properties object passes through [`masked_properties`], the one
//! constructor of a properties-valued expression, so a protected property reaches no properties
//! column of any trailer. The single deliberate exception is [`label_attribution`], which reads
//! the unmasked object to resolve which label path produced the cached label and delivers no
//! value from it. The tests hold both reads to their constructors.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, ColumnName, Constant, Correlation, Expression, FromItem,
    Function, OrderByExpression, Placeholder, PostgresType, SelectExpression, SelectList,
    SelectStatement, Table, WhereExpression,
    table::{
        DatabaseColumn, EntityEditionCache, EntityEditions, EntityTemporalMetadata, EntityTypes,
        OntologyIds,
    },
};
use hash_graph_store::query::Ordering;
use tokio_postgres::types::ToSql;

/// The version marker between a type's base URL and its version number.
///
/// Travels as a bound parameter, so the statement text carries no quoted literal.
const VERSION_INFIX: &str = "v/";

/// The `jsonpath` collecting every `allOf` entry's `labelProperty` path from a closed schema.
///
/// Travels as a bound parameter, so the statement text carries no quoted literal.
const LABEL_PROPERTY_PATHS: &str = "$.allOf[*].labelProperty";

/// The `jsonb_typeof` names of simple-typed values, the values a trailer delivers inline.
///
/// Travels as one bound array, so the statement text carries no quoted literals.
const SIMPLE_JSON_TYPES: &[&str] = &["string", "number", "boolean", "null"];

/// The columns of the unnested request pair, introduced by [`resolved_identities`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Ids {
    /// The web half of the requested identity.
    WebId,
    /// The entity half of the requested identity.
    EntityUuid,
    /// The request's 1-based input position.
    Index,
}

impl DatabaseColumn<'_> for Ids {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::WebId => "web_id".into(),
            Self::EntityUuid => "entity_uuid".into(),
            Self::Index => "index".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid => PostgresType::Uuid,
            Self::Index => PostgresType::Int8,
        }
    }
}

/// The columns of one unnested property, introduced by the properties lateral.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Prop {
    /// The property's base URL.
    Key,
    /// The property's value.
    Value,
}

impl DatabaseColumn<'_> for Prop {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Key => "key".into(),
            Self::Value => "value".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Key => PostgresType::Text,
            Self::Value => PostgresType::JsonB,
        }
    }
}

/// The outputs of the properties lateral.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Props {
    /// The simple-typed survivors of the masked object, as one `jsonb` map.
    Simple,
    /// The masked object's whole property count.
    Total,
}

impl DatabaseColumn<'_> for Props {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Simple => "simple".into(),
            Self::Total => "total".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Simple => PostgresType::JsonB,
            Self::Total => PostgresType::Int4,
        }
    }
}

/// The columns of one unnested direct-type URL inside the label lateral.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Direct {
    /// The direct type's versioned URL.
    Url,
    /// The URL's 1-based position in canonical direct-type order.
    Position,
}

impl DatabaseColumn<'_> for Direct {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Url => "url".into(),
            Self::Position => "position".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Url => PostgresType::Text,
            Self::Position => PostgresType::Int8,
        }
    }
}

/// The columns of one unnested label-property path inside the label lateral.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum LabelPath {
    /// The label-property path, a property base URL.
    Path,
    /// The path's 1-based position within its type's `allOf` list.
    Ordinality,
}

impl DatabaseColumn<'_> for LabelPath {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Path => "path".into(),
            Self::Ordinality => "ordinality".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Path => PostgresType::Text,
            Self::Ordinality => PostgresType::Int8,
        }
    }
}

/// The output of the label lateral.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum LabelProperty {
    /// The label-providing path's own name.
    Path,
}

impl DatabaseColumn<'_> for LabelProperty {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Path => "path".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Path => PostgresType::Text,
        }
    }
}

/// The unnested request pair, one row per requested identity.
const IDS: Correlation<Ids> = Correlation::new("ids");
/// The entity's temporal metadata, resolved by identity and currency.
const META: Aliased<EntityTemporalMetadata> = Aliased::of(Table::EntityTemporalMetadata, "meta");
/// The entity's current edition.
const EDITION: Aliased<EntityEditions> = Aliased::of(Table::EntityEditions, "edition");
/// The edition's cached derivations, absent when the cache has not caught up.
const CACHE: Aliased<EntityEditionCache> = Aliased::of(Table::EntityEditionCache, "cache");
/// One property of the masked object, inside the properties lateral.
const PROP: Correlation<Prop> = Correlation::new("prop");
/// The properties lateral's outputs.
const PROPS: Correlation<Props> = Correlation::new("props");
/// One direct-type URL, inside the label lateral.
const DIRECT: Correlation<Direct> = Correlation::new("direct");
/// One label-property path, inside the label lateral.
const LABEL_PATH: Correlation<LabelPath> = Correlation::new("label_path");
/// The label lateral's output.
const LABEL_PROPERTY: Correlation<LabelProperty> = Correlation::new("label_property");
/// The ontology-id table, under its own name.
const ONTOLOGY_IDS: Aliased<OntologyIds> = Aliased::table(Table::OntologyIds);
/// The entity-type table, under its own name.
const ENTITY_TYPES: Aliased<EntityTypes> = Aliased::table(Table::EntityTypes);

/// The `uuid[]` type, for casting a bound identity array where inference needs the annotation.
fn uuid_array() -> PostgresType {
    PostgresType::Array(Box::new(PostgresType::Uuid))
}

/// The `text[]` type, for casting a bound name array where inference needs the annotation.
fn text_array() -> PostgresType {
    PostgresType::Array(Box::new(PostgresType::Text))
}

/// Builds the masked properties object, the one constructor of a properties-valued expression.
///
/// The subtraction removes every protected base URL before any aggregation or count sees the
/// object, so a protected property is absent from the delivered map and absent from the count
/// that grounds the completeness flag.
fn masked_properties(protected: Placeholder) -> Expression {
    // (edition.properties - $protected::text[])
    EDITION
        .column(EntityEditions::Properties)
        .json_delete(Expression::from(protected).cast(text_array()))
}

/// Builds the label-attribution read, the one deliberate read of the unmasked object.
///
/// The label lateral resolves which `labelProperty` path produced the cached label (migration
/// V51 derives that label), so it reads the object the label cache read and delivers only the
/// path's own name. Masking the read would attribute the label to the next candidate path
/// instead of the one that produced it.
fn label_attribution(path: Expression) -> Expression {
    // jsonb_extract_path(edition.properties, <path>)
    Expression::from(Function::JsonExtractPath(vec![
        EDITION.column(EntityEditions::Properties),
        path,
    ]))
}

/// The delivered direct-type URLs: the cached array cut to its direct-type prefix.
fn direct_type_urls() -> Expression {
    // (cache.versioned_urls)[1:cache.direct_types]
    Expression::ArraySlice {
        expr: Box::new(CACHE.column(EntityEditionCache::VersionedUrls)),
        lower: Box::new(Expression::Constant(Constant::U32(1))),
        upper: Box::new(CACHE.column(EntityEditionCache::DirectTypes)),
    }
}

/// The shared FROM item every hydration statement stands on.
///
/// Resolves each requested identity to its current edition and the edition's cache row. The
/// join conditions compare against `now()`: non-draft, current at both axes at the moment the
/// statement runs. The cache join stays outer, so an entity whose cache row has not landed
/// still resolves, with empty derived columns.
fn resolved_identities(web_ids: Placeholder, entity_uuids: Placeholder) -> FromItem<'static> {
    // FROM unnest($web_ids::uuid[], $entity_uuids::uuid[])
    //     WITH ORDINALITY AS ids (web_id, entity_uuid, index)
    // JOIN entity_temporal_metadata AS meta
    //   ON meta.web_id = ids.web_id
    //  AND meta.entity_uuid = ids.entity_uuid
    //  AND meta.draft_id IS NULL
    //  AND meta.transaction_time @> now()
    //  AND meta.decision_time @> now()
    // JOIN entity_editions AS edition
    //   ON edition.entity_edition_id = meta.entity_edition_id
    //  AND NOT edition.archived
    // LEFT OUTER JOIN entity_edition_cache AS cache
    //   ON cache.entity_edition_id = meta.entity_edition_id
    FromItem::function(Function::Unnest(vec![
        Expression::from(web_ids).cast(uuid_array()),
        Expression::from(entity_uuids).cast(uuid_array()),
    ]))
    .with_ordinality(true)
    .alias(IDS)
    .column_aliases(vec![
        Ids::WebId.name(),
        Ids::EntityUuid.name(),
        Ids::Index.name(),
    ])
    .build()
    .inner_join_on(
        META.from_item(),
        vec![
            META.column(EntityTemporalMetadata::WebId)
                .equal(IDS.column(Ids::WebId)),
            META.column(EntityTemporalMetadata::EntityUuid)
                .equal(IDS.column(Ids::EntityUuid)),
            META.column(EntityTemporalMetadata::DraftId).is_null(),
            META.column(EntityTemporalMetadata::TransactionTime)
                .time_interval_contains_timestamp(Function::Now),
            META.column(EntityTemporalMetadata::DecisionTime)
                .time_interval_contains_timestamp(Function::Now),
        ],
    )
    .inner_join_on(
        EDITION.from_item(),
        vec![
            EDITION
                .column(EntityEditions::EditionId)
                .equal(META.column(EntityTemporalMetadata::EditionId)),
            EDITION.column(EntityEditions::Archived).not(),
        ],
    )
    .left_join_on(
        CACHE.from_item(),
        vec![
            CACHE
                .column(EntityEditionCache::EntityEditionId)
                .equal(META.column(EntityTemporalMetadata::EditionId)),
        ],
    )
}

/// Builds the properties lateral, aggregating the masked object's simple survivors and its
/// whole count.
///
/// The filter runs in the store, so nested values never cross the connection, while the count
/// covers the whole masked object, the completeness flag's ground truth. Both read the masked
/// object, so a protected property is absent from the map and absent from the count.
fn properties_lateral(protected: Placeholder, simple_types: Placeholder) -> FromItem<'static> {
    // LATERAL (
    //     SELECT
    //         jsonb_object_agg(prop.key, prop.value)
    //             FILTER (WHERE jsonb_typeof(prop.value) = ANY($simple_types::text[])),
    //         count(*)::int4
    //     FROM jsonb_each((edition.properties - $protected::text[])) AS prop (key, value)
    // ) AS props (simple, total)
    FromItem::subquery(
        SelectStatement::builder()
            .selects(vec![
                SelectExpression::new(Function::JsonObjectAgg {
                    key: Box::new(PROP.column(Prop::Key)),
                    value: Box::new(PROP.column(Prop::Value)),
                    filter: Some(Box::new(
                        Expression::from(Function::JsonTypeof(Box::new(PROP.column(Prop::Value))))
                            .r#in(Expression::from(simple_types).cast(text_array())),
                    )),
                }),
                SelectExpression::new(
                    Expression::from(Function::Count(None)).cast(PostgresType::Int4),
                ),
            ])
            .from(
                FromItem::function(Function::JsonEach(Box::new(masked_properties(protected))))
                    .alias(PROP)
                    .column_aliases(vec![Prop::Key.name(), Prop::Value.name()])
                    .build(),
            )
            .build(),
    )
    .lateral(true)
    .alias(PROPS)
    .column_aliases(vec![Props::Simple.name(), Props::Total.name()])
    .build()
}

/// Builds the label lateral, resolving the path that provides the display label and nothing of
/// its value.
///
/// Mirrors the `entity_edition_cache` label derivation (migration V51): the delivered path is
/// the first `allOf` `labelProperty` path that resolves non-null in canonical direct-type
/// order. The existence test rides [`label_attribution`], the one deliberate unmasked read.
fn label_property_lateral(
    version_infix: Placeholder,
    label_paths: Placeholder,
) -> FromItem<'static> {
    // LATERAL (
    //     SELECT label_path.path
    //     FROM unnest((cache.versioned_urls)[1:cache.direct_types])
    //         WITH ORDINALITY AS direct (url, position)
    //     JOIN ontology_ids
    //       ON ontology_ids.base_url || $version_infix::text || ontology_ids.version = direct.url
    //     JOIN entity_types
    //       ON entity_types.ontology_id = ontology_ids.ontology_id
    //     CROSS JOIN LATERAL jsonb_array_elements_text(
    //         jsonb_path_query_array(entity_types.closed_schema, $label_paths::jsonpath)
    //     ) WITH ORDINALITY AS label_path (path, ordinality)
    //     WHERE jsonb_extract_path(edition.properties, label_path.path) IS NOT NULL
    //     ORDER BY direct.position, label_path.ordinality
    //     LIMIT 1
    // ) AS label_property (path)
    FromItem::subquery(
        SelectStatement::builder()
            .selects(vec![SelectExpression::new(
                LABEL_PATH.column(LabelPath::Path),
            )])
            .from(
                FromItem::function(Function::Unnest(vec![direct_type_urls()]))
                    .with_ordinality(true)
                    .alias(DIRECT)
                    .column_aliases(vec![Direct::Url.name(), Direct::Position.name()])
                    .build()
                    .inner_join_on(
                        ONTOLOGY_IDS.from_item(),
                        vec![
                            Expression::concatenate(vec![
                                ONTOLOGY_IDS.column(OntologyIds::BaseUrl),
                                Expression::from(version_infix).cast(PostgresType::Text),
                                ONTOLOGY_IDS.column(OntologyIds::Version),
                            ])
                            .equal(DIRECT.column(Direct::Url)),
                        ],
                    )
                    .inner_join_on(
                        ENTITY_TYPES.from_item(),
                        vec![
                            ENTITY_TYPES
                                .column(EntityTypes::OntologyId)
                                .equal(ONTOLOGY_IDS.column(OntologyIds::OntologyId)),
                        ],
                    )
                    .cross_join(
                        FromItem::function(Function::JsonArrayElementsText(Box::new(
                            Expression::from(Function::JsonPathQueryArray(
                                Box::new(ENTITY_TYPES.column(EntityTypes::ClosedSchema)),
                                Box::new(
                                    Expression::from(label_paths).cast(PostgresType::JsonPath),
                                ),
                            )),
                        )))
                        .with_ordinality(true)
                        .lateral(true)
                        .alias(LABEL_PATH)
                        .column_aliases(vec![LabelPath::Path.name(), LabelPath::Ordinality.name()])
                        .build(),
                    ),
            )
            .where_expression(WhereExpression::from_iter([label_attribution(
                LABEL_PATH.column(LabelPath::Path),
            )
            .is_not_null()]))
            .order_by_expression(
                OrderByExpression::default()
                    .with(DIRECT.column(Direct::Position), Ordering::Ascending, None)
                    .with(
                        LABEL_PATH.column(LabelPath::Ordinality),
                        Ordering::Ascending,
                        None,
                    ),
            )
            .limit(1)
            .build(),
    )
    .lateral(true)
    .alias(LABEL_PROPERTY)
    .column_aliases(vec![LabelProperty::Path.name()])
    .build()
}

/// Which request rows the two laterals answer for.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum DetailRows {
    /// Only the source: the first input identity reads its properties and label attribution.
    ///
    /// The locate node hydration answers for the source alone, because a locate response
    /// delivers detail for its source while every delivered node still reads its direct-type
    /// URLs.
    SourceOnly,
    /// Every delivered row reads its properties and label attribution.
    ///
    /// The locate link hydration answers for every row, because every edge in a locate response
    /// carries its capped properties and a completeness flag beside each cap.
    EveryRow,
}

impl DetailRows {
    /// The lateral join's condition admitting exactly these rows.
    fn condition(self) -> Expression {
        match self {
            // ON ids.index = 1
            Self::SourceOnly => IDS
                .column(Ids::Index)
                .equal(Expression::Constant(Constant::U32(1))),
            // ON TRUE
            Self::EveryRow => Expression::Constant(Constant::Boolean(true)),
        }
    }
}

/// The output columns of a locate hydration.
pub(super) struct LocateColumns {
    /// The request's 1-based input position.
    pub index: usize,
    /// The direct-type versioned URLs, in canonical order, `NULL` without a cache row.
    pub type_urls: usize,
    /// The simple-typed survivors of the masked object, `NULL` on rows the detail condition
    /// excludes.
    pub simple: usize,
    /// The masked object's whole property count, `NULL` on rows the detail condition excludes.
    pub total: usize,
    /// The base URL providing the display label, `NULL` when no path resolves.
    pub label_property: usize,
}

/// Builds the locate hydration statement.
///
/// Direct-type URLs for every delivered entity, plus - for the rows the detail condition
/// admits - the
/// simple-valued properties, the whole-set property count, and the base URL providing the
/// display label. Input order rides the ordinality column, and absent entities go missing from
/// the result.
///
/// Completeness attests the deliverable set: both property columns read the masked object, so
/// `total` against the delivered map is no signal that a withheld property exists.
pub(super) fn locate_statement<'params>(
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
    protected: &'params (impl ToSql + Sync),
    detail_rows: DetailRows,
) -> BoundStatement<'params, LocateColumns> {
    let mut binder = Binder::default();
    let web_ids = binder.bind(web_ids);
    let entity_uuids = binder.bind(entity_uuids);
    let protected = binder.bind(protected);
    let simple_types = binder.bind(&SIMPLE_JSON_TYPES);
    let version_infix = binder.bind(&VERSION_INFIX);
    let label_paths = binder.bind(&LABEL_PROPERTY_PATHS);

    // SELECT ids.index, <direct-type URLs>, props.simple, props.total, label_property.path
    let mut select = SelectList::default();
    let columns = LocateColumns {
        index: select.output(IDS.column(Ids::Index)),
        type_urls: select.output(direct_type_urls()),
        simple: select.output(PROPS.column(Props::Simple)),
        total: select.output(PROPS.column(Props::Total)),
        label_property: select.output(LABEL_PROPERTY.column(LabelProperty::Path)),
    };

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from(
            // <resolved identities>
            // LEFT OUTER JOIN <properties lateral> ON <detail condition>
            // LEFT OUTER JOIN <label lateral> ON <detail condition>
            resolved_identities(web_ids, entity_uuids)
                .left_join_on(
                    properties_lateral(protected, simple_types),
                    vec![detail_rows.condition()],
                )
                .left_join_on(
                    label_property_lateral(version_infix, label_paths),
                    vec![detail_rows.condition()],
                ),
        )
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// The output columns of the edges link hydration.
pub(super) struct EdgesColumns {
    /// The request's 1-based input position.
    pub index: usize,
    /// The first direct-type versioned URL, `NULL` without a cache row.
    pub first_type_url: usize,
}

/// Builds the edges link hydration statement.
///
/// Each delivered link reads its first direct-type versioned URL, input order preserved through
/// the ordinality column, absent entities missing from the result. The column reads the edition
/// cache alone, so the statement takes no protected-property parameter.
pub(super) fn edges_link_statement<'params>(
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, EdgesColumns> {
    let mut binder = Binder::default();
    let web_ids = binder.bind(web_ids);
    let entity_uuids = binder.bind(entity_uuids);

    // SELECT ids.index, (cache.versioned_urls)[1]
    let mut select = SelectList::default();
    let columns = EdgesColumns {
        index: select.output(IDS.column(Ids::Index)),
        first_type_url: select.output(Expression::ArrayElement {
            expr: Box::new(CACHE.column(EntityEditionCache::VersionedUrls)),
            index: 1,
        }),
    };

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from(resolved_identities(web_ids, entity_uuids))
        .build();

    BoundStatement::new(&statement, binder, columns)
}

#[cfg(test)]
mod tests {
    use hash_graph_postgres_store::store::postgres::query::{Binder, Transpile as _};
    use uuid::Uuid;

    use super::{
        super::statement_fixtures, DetailRows, SIMPLE_JSON_TYPES, edges_link_statement,
        locate_statement, masked_properties,
    };

    /// Asserts that a statement cites exactly the parameters its bind list carries.
    ///
    /// A value bound but never rendered is the failure this pins, because the store rejects such
    /// a statement at execution with an unread-parameter error.
    fn assert_placeholders_dense(sql: &str, parameter_count: usize) {
        use alloc::collections::BTreeSet;

        let mut cited = BTreeSet::new();
        let mut characters = sql.chars().peekable();
        while let Some(character) = characters.next() {
            if character != '$' {
                continue;
            }
            // A `$` without digits is statement text, such as a JSON key like `'$id'`.
            let mut index = 0_usize;
            while let Some(digit) = characters.peek().and_then(|next| next.to_digit(10)) {
                index = index * 10 + digit as usize;
                characters.next();
            }
            if index > 0 {
                cited.insert(index);
            }
        }

        let expected: BTreeSet<usize> = (1..=parameter_count).collect();
        assert_eq!(
            cited, expected,
            "the statement's placeholders and its bind list disagree"
        );
    }

    /// The rendered spelling of the masked read, with the protected array at its bind position.
    fn masked_spelling() -> String {
        let mut binder = Binder::default();
        let _web_ids = binder.bind(&0_i32);
        let _entity_uuids = binder.bind(&0_i32);
        let protected = binder.bind(&0_i32);

        masked_properties(protected).transpile_to_string()
    }

    /// The rendered spelling of the properties column itself, whatever reads it.
    fn properties_spelling() -> String {
        super::EDITION
            .column(super::EntityEditions::Properties)
            .transpile_to_string()
    }

    /// Every property read in every statement is the masked read or the attribution read.
    ///
    /// The attribution read delivers no value: it stands inside `jsonb_extract_path(`, the
    /// existence test that resolves which path produced the label.
    #[test]
    #[expect(clippy::string_slice)]
    fn every_property_read_is_masked() {
        let web_ids: Vec<Uuid> = Vec::new();
        let entity_uuids: Vec<Uuid> = Vec::new();
        let protected: Vec<String> = Vec::new();

        let masked = masked_spelling();
        let properties = properties_spelling();
        let attribution = format!("jsonb_extract_path({properties}");

        for (name, sql, reads_properties) in [
            (
                "locate detail",
                locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::SourceOnly).sql,
                true,
            ),
            (
                "locate link",
                locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::EveryRow).sql,
                true,
            ),
            (
                "edges link",
                edges_link_statement(&web_ids, &entity_uuids).sql,
                false,
            ),
        ] {
            let masked_offset = masked
                .find(&properties)
                .expect("the masked spelling contains the properties column it masks");
            let attribution_offset = attribution.len() - properties.len();

            let unmasked: Vec<usize> = sql
                .match_indices(&properties)
                .filter(|&(at, _)| {
                    let masked_here =
                        at >= masked_offset && sql[at - masked_offset..].starts_with(&masked);
                    let attributed_here = at >= attribution_offset
                        && sql[at - attribution_offset..].starts_with(&attribution);

                    !masked_here && !attributed_here
                })
                .map(|(at, _)| at)
                .collect();

            assert_eq!(
                unmasked,
                Vec::<usize>::new(),
                "{name} reads the properties column outside its two constructors, at these offsets"
            );

            assert_eq!(
                sql.contains(&masked),
                reads_properties,
                "{name} disagrees with its census row about reading the properties object"
            );
        }
    }

    /// The module has exactly two properties-column reads: the two named constructors.
    ///
    /// A third read of the properties column anywhere outside this test module fails the count,
    /// so a new statement cannot read the object except through a constructor the masking
    /// contract names.
    #[test]
    fn the_constructors_are_the_only_property_reads() {
        let source = include_str!("statements.rs");
        let (module, _tests) = source
            .split_once("#[cfg(test)]")
            .expect("this module carries its test module");

        assert_eq!(
            module.matches("EntityEditions::Properties").count(),
            2,
            "a properties-column read exists outside the two named constructors"
        );
    }

    /// Every statement cites exactly the parameters it binds, and the protected array stays at
    /// the position the client binds it.
    #[test]
    fn statements_bind_densely_and_uniformly() {
        let web_ids: Vec<Uuid> = Vec::new();
        let entity_uuids: Vec<Uuid> = Vec::new();
        let protected: Vec<String> = Vec::new();

        let detail = locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::SourceOnly);
        let link = locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::EveryRow);
        let edges = edges_link_statement(&web_ids, &entity_uuids);

        assert_placeholders_dense(&detail.sql, detail.parameters.len());
        assert_placeholders_dense(&link.sql, link.parameters.len());
        assert_placeholders_dense(&edges.sql, edges.parameters.len());

        assert_eq!(
            detail.parameters.len(),
            6,
            "the identity pair, the protected array, and the three bound constants"
        );
        assert_eq!(edges.parameters.len(), 2, "the identity pair alone");

        let masked = masked_spelling();
        assert!(
            masked.contains("$3"),
            "the masked read binds the protected array at the client's position"
        );
    }

    /// A detail-rows change moves the two lateral join conditions and nothing else.
    #[test]
    fn detail_rows_are_the_whole_difference() {
        let web_ids: Vec<Uuid> = Vec::new();
        let entity_uuids: Vec<Uuid> = Vec::new();
        let protected: Vec<String> = Vec::new();

        let detail = locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::SourceOnly);
        let link = locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::EveryRow);

        let widened = detail.sql.replace("ON \"ids\".\"index\" = 1", "ON TRUE");
        assert_eq!(
            widened, link.sql,
            "the two locate statements differ beyond their lateral join conditions"
        );
    }

    /// Every statement renders exactly its pinned fixture.
    ///
    /// The fixtures hold the store-received text, so a rendering change - a statement edit here,
    /// or a change in the statement AST's own spelling upstream - lands as a fixture diff in
    /// review instead of a silent swap of what runs against the store.
    #[test]
    fn statements_render_their_fixtures() {
        let web_ids: Vec<Uuid> = Vec::new();
        let entity_uuids: Vec<Uuid> = Vec::new();
        let protected: Vec<String> = Vec::new();

        assert_eq!(
            locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::SourceOnly).sql,
            statement_fixtures::LOCATE_DETAIL,
            "the locate detail statement moved off its pinned rendering"
        );
        assert_eq!(
            locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::EveryRow).sql,
            statement_fixtures::LOCATE_LINK,
            "the locate link statement moved off its pinned rendering"
        );
        assert_eq!(
            edges_link_statement(&web_ids, &entity_uuids).sql,
            statement_fixtures::EDGES_LINK,
            "the edges link statement moved off its pinned rendering"
        );
    }

    /// The simple-type filter travels as the bound constant, not as statement text.
    #[test]
    fn simple_types_travel_bound() {
        let web_ids: Vec<Uuid> = Vec::new();
        let entity_uuids: Vec<Uuid> = Vec::new();
        let protected: Vec<String> = Vec::new();

        let detail = locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::SourceOnly);

        for type_name in SIMPLE_JSON_TYPES {
            assert!(
                !detail.sql.contains(type_name),
                "a simple-type name is spliced into the statement text instead of bound"
            );
        }
    }
}

#[cfg(test)]
mod prepare_probe {
    use tokio_postgres::NoTls;
    use uuid::Uuid;

    use super::{DetailRows, edges_link_statement, locate_statement};

    #[tokio::test]
    async fn statements_prepare_against_the_live_store() {
        let (client, connection) = tokio_postgres::connect(
            "host=localhost user=postgres password=postgres dbname=graph",
            NoTls,
        )
        .await
        .expect("the graph store is reachable");
        tokio::spawn(connection);

        let web_ids: Vec<Uuid> = Vec::new();
        let entity_uuids: Vec<Uuid> = Vec::new();
        let protected: Vec<String> = Vec::new();

        for (name, sql) in [
            (
                "locate detail",
                locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::SourceOnly).sql,
            ),
            (
                "locate link",
                locate_statement(&web_ids, &entity_uuids, &protected, DetailRows::EveryRow).sql,
            ),
            (
                "edges link",
                edges_link_statement(&web_ids, &entity_uuids).sql,
            ),
        ] {
            if let Err(error) = client.prepare(&sql).await {
                panic!("{name}: {error}");
            }
        }
    }
}
