//! The endpoint-association facts, covering the current source types that constrain each
//! relation.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, ColumnName, Constant, Correlation, Expression, FromItem,
    Function, JoinType, OrderByExpression, Placeholder, PostgresType, SelectExpression, SelectList,
    SelectStatement, Table, WithExpression,
    table::{DatabaseColumn, EntityTypes, OntologyIds, OntologyTemporalMetadata},
};
use hash_graph_store::query::Ordering;
use tokio_postgres::{Row, Transaction, types::ToSql};
use uuid::Uuid;

use super::{
    super::{
        super::TemporalAxes,
        sql::{MAPPING, Mapping, json_field, json_text, type_mapping},
    },
    DESCRIPTION_KEY, ID_KEY, OwnedAssociation, RelationFacts, TITLE_KEY, fact_at,
};

/// The link-constraints key of a resolved type schema.
const LINKS_KEY: &str = "links";
/// The constraint's item schema key.
const ITEMS_KEY: &str = "items";
/// The item schema's allowed-targets key.
const ONE_OF_KEY: &str = "oneOf";
/// The constraint's minimum-cardinality key.
const MIN_ITEMS_KEY: &str = "minItems";
/// The constraint's maximum-cardinality key.
const MAX_ITEMS_KEY: &str = "maxItems";
/// A target reference's URL key.
const REF_KEY: &str = "$ref";

/// Matches the version suffix after a base id, anchored to consume the whole remainder.
///
/// Travels as a bound parameter, so the statement text carries no quoted literal.
const VERSION_SUFFIX: &str = "^v/[0-9]+$";
/// Matches a trailing version suffix, for erasing it from a versioned URL.
const TRAILING_VERSION_SUFFIX: &str = "v/[0-9]+$";
/// The replacement erasing a matched version suffix.
const VERSION_ERASURE: &str = "";

/// The columns of the `current_types` CTE: the latest current version of every entity type.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum CurrentType {
    /// The type's base id.
    BaseUrl,
    /// The version's ontology id.
    OntologyId,
    /// The version's versioned URL.
    VersionedUrl,
    /// The version's title.
    Title,
    /// The version's description.
    Description,
    /// The resolved schema's link constraints.
    Links,
}

impl DatabaseColumn<'_> for CurrentType {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::BaseUrl => "base_url".into(),
            Self::OntologyId => "ontology_id".into(),
            Self::VersionedUrl => "versioned_url".into(),
            Self::Title => "title".into(),
            Self::Description => "description".into(),
            Self::Links => "links".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::BaseUrl | Self::VersionedUrl | Self::Title | Self::Description => {
                PostgresType::Text
            }
            Self::OntologyId => PostgresType::Uuid,
            Self::Links => PostgresType::JsonB,
        }
    }
}

/// The columns of the `relations` CTE: the type table with ordinality and base id.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Relation {
    /// The type's 1-based position in the type table.
    Ordinality,
    /// The type's base id.
    BaseUrl,
}

impl DatabaseColumn<'_> for Relation {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Ordinality => "ordinality".into(),
            Self::BaseUrl => "base_url".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Ordinality => PostgresType::Int8,
            Self::BaseUrl => PostgresType::Text,
        }
    }
}

/// The columns of the `matched` CTE: each source's newest constraint per scoped type.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Matched {
    /// The constrained type's ordinality.
    Ordinality,
    /// The source's base id.
    BaseUrl,
    /// The source's ontology id.
    OntologyId,
    /// The source's versioned URL.
    VersionedUrl,
    /// The source's title.
    Title,
    /// The source's description.
    Description,
    /// The constraint's allowed-target references.
    OneOf,
    /// The constraint's minimum cardinality.
    MinItems,
    /// The constraint's maximum cardinality.
    MaxItems,
}

impl DatabaseColumn<'_> for Matched {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Ordinality => "ordinality".into(),
            Self::BaseUrl => "base_url".into(),
            Self::OntologyId => "ontology_id".into(),
            Self::VersionedUrl => "versioned_url".into(),
            Self::Title => "title".into(),
            Self::Description => "description".into(),
            Self::OneOf => "one_of".into(),
            Self::MinItems => "min_items".into(),
            Self::MaxItems => "max_items".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Ordinality | Self::MinItems | Self::MaxItems => PostgresType::Int8,
            Self::BaseUrl | Self::VersionedUrl | Self::Title | Self::Description => {
                PostgresType::Text
            }
            Self::OntologyId => PostgresType::Uuid,
            Self::OneOf => PostgresType::JsonB,
        }
    }
}

/// The columns of one `jsonb_each` constraint entry.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum ConstraintEntry {
    /// The constrained type's versioned URL, as the `links` key.
    Key,
    /// The constraint schema.
    Value,
}

impl DatabaseColumn<'_> for ConstraintEntry {
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

/// The column of one unnested `oneOf` reference.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum ReferenceValue {
    /// The reference schema, carrying `$ref`.
    Value,
}

impl DatabaseColumn<'_> for ReferenceValue {
    fn name(&self) -> ColumnName<'static> {
        "value".into()
    }

    fn postgres_type(&self) -> PostgresType {
        PostgresType::JsonB
    }
}

/// The column of the deduplicated reference base ids.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum ReferenceBase {
    /// The referenced target's base id.
    RefBaseUrl,
}

impl DatabaseColumn<'_> for ReferenceBase {
    fn name(&self) -> ColumnName<'static> {
        "ref_base_url".into()
    }

    fn postgres_type(&self) -> PostgresType {
        PostgresType::Text
    }
}

/// The columns of the `targets` lateral: per-source target prose, aggregated in target order.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Targets {
    /// The targets' titles.
    Titles,
    /// The targets' descriptions.
    Descriptions,
    /// The targets' base ids.
    BaseUrls,
    /// The targets' versioned URLs.
    VersionedUrls,
    /// The targets' ontology ids.
    OntologyIds,
}

impl DatabaseColumn<'_> for Targets {
    fn name(&self) -> ColumnName<'static> {
        match self {
            Self::Titles => "titles".into(),
            Self::Descriptions => "descriptions".into(),
            Self::BaseUrls => "base_urls".into(),
            Self::VersionedUrls => "versioned_urls".into(),
            Self::OntologyIds => "ontology_ids".into(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::Titles | Self::Descriptions | Self::BaseUrls | Self::VersionedUrls => {
                PostgresType::Array(Box::new(PostgresType::Text))
            }
            Self::OntologyIds => PostgresType::Array(Box::new(PostgresType::Uuid)),
        }
    }
}

/// The CTE holding the latest current version of every entity type.
const CURRENT_TYPES: Correlation<CurrentType> = Correlation::new("current_types");
/// The CTE holding the type table with each type's ordinality and base id.
const RELATIONS: Correlation<Relation> = Correlation::new("relations");
/// The CTE holding each source type's newest constraint per scoped type.
const MATCHED: Correlation<Matched> = Correlation::new("matched");

/// Builds the `current_types` table: the latest current version of every entity type.
fn current_types(transaction_point: Placeholder) -> SelectStatement {
    const TYPES: Aliased<EntityTypes> = Aliased::of(Table::EntityTypes, "types");
    const IDS: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "ids");
    const META: Aliased<OntologyTemporalMetadata> =
        Aliased::of(Table::OntologyTemporalMetadata, "meta");

    let schema = || TYPES.column(&EntityTypes::Schema);

    SelectStatement::builder()
        .distinct({
            // SELECT DISTINCT ON (ids.base_url): with the version-descending ordering below,
            // each base id keeps its newest current version.
            vec![IDS.column(&OntologyIds::BaseUrl)]
        })
        .selects(vec![
            // SELECT
            //     ids.base_url AS base_url,
            //     types.ontology_id AS ontology_id,
            //     types.schema ->> '$id' AS versioned_url,
            //     types.schema ->> 'title' AS title,
            //     types.schema ->> 'description' AS description,
            //     types.closed_schema -> 'links' AS links
            SelectExpression::aliased(
                IDS.column(&OntologyIds::BaseUrl),
                CurrentType::BaseUrl.name().into_identifier(),
            ),
            SelectExpression::aliased(
                TYPES.column(&EntityTypes::OntologyId),
                CurrentType::OntologyId.name().into_identifier(),
            ),
            SelectExpression::aliased(
                json_text(schema(), ID_KEY),
                CurrentType::VersionedUrl.name().into_identifier(),
            ),
            SelectExpression::aliased(
                json_text(schema(), TITLE_KEY),
                CurrentType::Title.name().into_identifier(),
            ),
            SelectExpression::aliased(
                json_text(schema(), DESCRIPTION_KEY),
                CurrentType::Description.name().into_identifier(),
            ),
            SelectExpression::aliased(
                json_field(TYPES.column(&EntityTypes::ClosedSchema), LINKS_KEY),
                CurrentType::Links.name().into_identifier(),
            ),
        ])
        .from({
            // FROM entity_types AS types
            // JOIN ontology_ids AS ids ON ids.ontology_id = types.ontology_id
            // JOIN ontology_temporal_metadata AS meta
            //   ON meta.ontology_id = types.ontology_id
            //  AND meta.transaction_time @> <transaction point>
            TYPES
                .from_item()
                .inner_join_on(
                    IDS.from_item(),
                    vec![
                        IDS.column(&OntologyIds::OntologyId)
                            .equal(TYPES.column(&EntityTypes::OntologyId)),
                    ],
                )
                .inner_join_on(
                    META.from_item(),
                    vec![
                        META.column(&OntologyTemporalMetadata::OntologyId)
                            .equal(TYPES.column(&EntityTypes::OntologyId)),
                        META.column(&OntologyTemporalMetadata::TransactionTime)
                            .time_interval_contains_timestamp(transaction_point),
                    ],
                )
        })
        .order_by_expression({
            // ORDER BY ids.base_url, ids.version DESC
            OrderByExpression::default()
                .with(IDS.column(&OntologyIds::BaseUrl), Ordering::Ascending, None)
                .with(
                    IDS.column(&OntologyIds::Version),
                    Ordering::Descending,
                    None,
                )
        })
        .build()
}

/// Builds the `relations` table: the type table with each type's ordinality and base id.
fn relations(types: Placeholder) -> SelectStatement {
    const IDS: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "ids");

    SelectStatement::builder()
        .selects(vec![
            // SELECT mapping.ordinality, ids.base_url AS base_url
            SelectExpression::new(MAPPING.column(&Mapping::Ordinality)),
            SelectExpression::aliased(
                IDS.column(&OntologyIds::BaseUrl),
                Relation::BaseUrl.name().into_identifier(),
            ),
        ])
        .from({
            // FROM unnest(<types>) WITH ORDINALITY AS mapping(ontology_id, ordinality)
            // JOIN ontology_ids AS ids ON ids.ontology_id = mapping.ontology_id
            type_mapping(types).inner_join_on(
                IDS.from_item(),
                vec![
                    IDS.column(&OntologyIds::OntologyId)
                        .equal(MAPPING.column(&Mapping::OntologyId)),
                ],
            )
        })
        .build()
}

/// Builds the `matched` table: each source type's newest constraint per scoped type.
///
/// A `links` key constrains a scoped type when it starts with the type's base id and the
/// remainder is exactly a version suffix. A source constraining more than one version
/// contributes the newest, which the version-descending ordering under the DISTINCT pair
/// selects.
fn matched(version_suffix: Placeholder) -> SelectStatement {
    const SOURCE: Correlation<CurrentType> = Correlation::new("source");
    const CONSTRAINT_ENTRY: Correlation<ConstraintEntry> = Correlation::new("constraint_entry");

    // substring(constraint_entry.key FROM char_length(relations.base_url) + <offset>)
    let key_remainder = |offset: u32| {
        Expression::from(Function::Substring {
            string: Box::new(CONSTRAINT_ENTRY.column(&ConstraintEntry::Key)),
            start: Box::new(
                Expression::from(Function::CharLength(Box::new(
                    RELATIONS.column(&Relation::BaseUrl),
                )))
                .add(Constant::U32(offset)),
            ),
        })
    };

    SelectStatement::builder()
        .distinct({
            // SELECT DISTINCT ON (relations.ordinality, source.base_url)
            vec![
                RELATIONS.column(&Relation::Ordinality),
                SOURCE.column(&CurrentType::BaseUrl),
            ]
        })
        .selects(vec![
            // SELECT
            //     relations.ordinality,
            //     source.base_url,
            //     source.ontology_id,
            //     source.versioned_url,
            //     source.title,
            //     source.description,
            //     constraint_entry.value -> 'items' -> 'oneOf' AS one_of,
            //     (constraint_entry.value ->> 'minItems')::bigint AS min_items,
            //     (constraint_entry.value ->> 'maxItems')::bigint AS max_items
            SelectExpression::new(RELATIONS.column(&Relation::Ordinality)),
            SelectExpression::new(SOURCE.column(&CurrentType::BaseUrl)),
            SelectExpression::new(SOURCE.column(&CurrentType::OntologyId)),
            SelectExpression::new(SOURCE.column(&CurrentType::VersionedUrl)),
            SelectExpression::new(SOURCE.column(&CurrentType::Title)),
            SelectExpression::new(SOURCE.column(&CurrentType::Description)),
            SelectExpression::aliased(
                json_field(
                    json_field(CONSTRAINT_ENTRY.column(&ConstraintEntry::Value), ITEMS_KEY),
                    ONE_OF_KEY,
                ),
                Matched::OneOf.name().into_identifier(),
            ),
            SelectExpression::aliased(
                json_text(
                    CONSTRAINT_ENTRY.column(&ConstraintEntry::Value),
                    MIN_ITEMS_KEY,
                )
                .grouped()
                .cast(PostgresType::Int8),
                Matched::MinItems.name().into_identifier(),
            ),
            SelectExpression::aliased(
                json_text(
                    CONSTRAINT_ENTRY.column(&ConstraintEntry::Value),
                    MAX_ITEMS_KEY,
                )
                .grouped()
                .cast(PostgresType::Int8),
                Matched::MaxItems.name().into_identifier(),
            ),
        ])
        .from(
            // FROM current_types AS source
            // CROSS JOIN LATERAL jsonb_each(source.links) AS constraint_entry(key, value)
            // JOIN relations
            //   ON starts_with(constraint_entry.key, relations.base_url)
            //  AND <the key's remainder> ~ <version suffix>
            FromItem::table(CURRENT_TYPES)
                .alias(SOURCE)
                .build()
                .cross_join(
                    FromItem::function(Function::JsonEach(Box::new(
                        SOURCE.column(&CurrentType::Links),
                    )))
                    .lateral(true)
                    .alias(CONSTRAINT_ENTRY)
                    .column_aliases(vec![
                        ConstraintEntry::Key.name(),
                        ConstraintEntry::Value.name(),
                    ]),
                )
                .join(JoinType::Inner, FromItem::table(RELATIONS))
                .on(vec![
                    CONSTRAINT_ENTRY
                        .column(&ConstraintEntry::Key)
                        .starts_with(RELATIONS.column(&Relation::BaseUrl)),
                    key_remainder(1).regex_match(version_suffix),
                ])
                .build(),
        )
        .order_by_expression({
            // ORDER BY relations.ordinality, source.base_url,
            //     (<the key's version digits>)::bigint DESC
            //
            // The version digits start after `<base_url>v/`, which is the base id plus two
            // characters.
            OrderByExpression::default()
                .with(
                    RELATIONS.column(&Relation::Ordinality),
                    Ordering::Ascending,
                    None,
                )
                .with(
                    SOURCE.column(&CurrentType::BaseUrl),
                    Ordering::Ascending,
                    None,
                )
                .with(
                    key_remainder(3).cast(PostgresType::Int8),
                    Ordering::Descending,
                    None,
                )
        })
        .build()
}

/// Builds the `targets` lateral: the constraint's references resolved to latest-current prose.
fn targets(trailing_version_suffix: Placeholder, version_erasure: Placeholder) -> SelectStatement {
    const ELEMENTS: Correlation<ReferenceValue> = Correlation::new("reference");
    const REFERENCE: Correlation<ReferenceBase> = Correlation::new("reference");
    const TARGET: Aliased<CurrentType> = CURRENT_TYPES.renames("target");

    // regexp_replace(reference.value ->> '$ref', <trailing version suffix>, '')
    let reference_base = || {
        Expression::from(Function::RegexpReplace {
            string: Box::new(json_text(ELEMENTS.column(&ReferenceValue::Value), REF_KEY)),
            pattern: Box::new(trailing_version_suffix.into()),
            replacement: Box::new(version_erasure.into()),
        })
    };

    // Each reference's base id, its version suffix erased, deduplicated before target prose
    // resolves per base id.
    let reference_base_urls = SelectStatement::builder()
        .distinct({
            // SELECT DISTINCT ON (<the reference base id>) <the reference base id> AS ref_base_url
            vec![reference_base()]
        })
        .selects(vec![SelectExpression::aliased(
            reference_base(),
            ReferenceBase::RefBaseUrl.name().into_identifier(),
        )])
        .from(
            // FROM jsonb_array_elements(matched.one_of) AS reference(value)
            FromItem::function(Function::JsonArrayElements(Box::new(
                MATCHED.column(&Matched::OneOf),
            )))
            .alias(ELEMENTS)
            .column_aliases(vec![ReferenceValue::Value.name()])
            .build(),
        )
        .build();

    // array_agg(target.<column> ORDER BY target.base_url) AS <alias>
    let aggregated = |column: CurrentType, alias: Targets| {
        SelectExpression::aliased(
            Function::ArrayAgg {
                expression: Box::new(TARGET.column(&column)),
                order_by: OrderByExpression::default().with(
                    TARGET.column(&CurrentType::BaseUrl),
                    Ordering::Ascending,
                    None,
                ),
            },
            alias.name().into_identifier(),
        )
    };

    SelectStatement::builder()
        .selects(vec![
            // SELECT
            //     array_agg(target.title ORDER BY target.base_url) AS titles,
            //     array_agg(target.description ORDER BY target.base_url) AS descriptions,
            //     array_agg(target.base_url ORDER BY target.base_url) AS base_urls,
            //     array_agg(target.versioned_url ORDER BY target.base_url) AS versioned_urls,
            //     array_agg(target.ontology_id ORDER BY target.base_url) AS ontology_ids
            aggregated(CurrentType::Title, Targets::Titles),
            aggregated(CurrentType::Description, Targets::Descriptions),
            aggregated(CurrentType::BaseUrl, Targets::BaseUrls),
            aggregated(CurrentType::VersionedUrl, Targets::VersionedUrls),
            aggregated(CurrentType::OntologyId, Targets::OntologyIds),
        ])
        .from({
            // FROM (<reference base ids>) AS reference
            // JOIN current_types AS target ON target.base_url = reference.ref_base_url
            FromItem::subquery(reference_base_urls)
                .alias(REFERENCE)
                .build()
                .inner_join_on(
                    TARGET.from_item(),
                    vec![
                        TARGET
                            .column(&CurrentType::BaseUrl)
                            .equal(REFERENCE.column(&ReferenceBase::RefBaseUrl)),
                    ],
                )
        })
        .build()
}

/// The output columns of the association statement.
struct AssociationColumns {
    ordinality: usize,
    base_url: usize,
    versioned_url: usize,
    ontology_id: usize,
    title: usize,
    description: usize,
    min_items: usize,
    max_items: usize,
    target_titles: usize,
    target_descriptions: usize,
    target_base_urls: usize,
    target_versioned_urls: usize,
    target_ontology_ids: usize,
}

/// Builds the association statement.
///
/// Inside the statement, `matched` is each source type's newest `links` constraint keyed under
/// any version of a scoped type's base id, and the target lateral resolves the constraint's
/// references to latest-current prose per base id.
fn association_statement<'params>(
    types: &'params (impl ToSql + Sync),
    transaction_time: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, AssociationColumns> {
    const TARGETS: Correlation<Targets> = Correlation::new("targets");

    let mut binder = Binder::default();
    let types_placeholder = binder.bind(types);
    let transaction_point = binder.bind(transaction_time);
    let version_suffix = binder.bind(&VERSION_SUFFIX);
    let trailing_version_suffix = binder.bind(&TRAILING_VERSION_SUFFIX);
    let version_erasure = binder.bind(&VERSION_ERASURE);

    // SELECT matched.<the source and constraint columns>, targets.<the aggregated targets>
    let mut select = SelectList::default();
    let columns = AssociationColumns {
        ordinality: select.output(MATCHED.column(&Matched::Ordinality)),
        base_url: select.output(MATCHED.column(&Matched::BaseUrl)),
        versioned_url: select.output(MATCHED.column(&Matched::VersionedUrl)),
        ontology_id: select.output(MATCHED.column(&Matched::OntologyId)),
        title: select.output(MATCHED.column(&Matched::Title)),
        description: select.output(MATCHED.column(&Matched::Description)),
        min_items: select.output(MATCHED.column(&Matched::MinItems)),
        max_items: select.output(MATCHED.column(&Matched::MaxItems)),
        target_titles: select.output(TARGETS.column(&Targets::Titles)),
        target_descriptions: select.output(TARGETS.column(&Targets::Descriptions)),
        target_base_urls: select.output(TARGETS.column(&Targets::BaseUrls)),
        target_versioned_urls: select.output(TARGETS.column(&Targets::VersionedUrls)),
        target_ontology_ids: select.output(TARGETS.column(&Targets::OntologyIds)),
    };

    let statement = SelectStatement::builder()
        .with({
            // WITH current_types AS (<current_types>),
            //     relations AS (<relations>),
            //     matched AS (<matched>)
            WithExpression::default()
                .with_statement(CURRENT_TYPES, current_types(transaction_point))
                .with_statement(RELATIONS, relations(types_placeholder))
                .with_statement(MATCHED, matched(version_suffix))
        })
        .selects(select.into_selects())
        .from({
            // FROM matched
            // LEFT JOIN LATERAL (<targets>) AS targets ON TRUE
            FromItem::table(MATCHED).build().left_join_on(
                FromItem::subquery(targets(trailing_version_suffix, version_erasure))
                    .alias(TARGETS)
                    .lateral(true),
                Vec::<Expression>::new(),
            )
        })
        .order_by_expression({
            // ORDER BY matched.ordinality, matched.base_url
            OrderByExpression::default()
                .with(
                    MATCHED.column(&Matched::Ordinality),
                    Ordering::Ascending,
                    None,
                )
                .with(MATCHED.column(&Matched::BaseUrl), Ordering::Ascending, None)
        })
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Applies one association row to its relation's facts.
fn apply_row(
    row: &Row,
    columns: &AssociationColumns,
    facts: &mut [RelationFacts],
) -> Result<(), tokio_postgres::Error> {
    let fact = fact_at(facts, row.try_get(columns.ordinality)?);

    let source_base_url: String = row.try_get(columns.base_url)?;
    let source_versioned_url: Option<String> = row.try_get(columns.versioned_url)?;
    let source_ontology_id: Uuid = row.try_get(columns.ontology_id)?;
    fact.forbidden.push(source_base_url.clone());
    fact.forbidden.extend(source_versioned_url);
    fact.forbidden.push(source_ontology_id.to_string());

    let titles: Vec<Option<String>> = row
        .try_get::<_, Option<_>>(columns.target_titles)?
        .unwrap_or_default();
    let descriptions: Vec<Option<String>> = row
        .try_get::<_, Option<_>>(columns.target_descriptions)?
        .unwrap_or_default();
    let base_urls: Vec<String> = row
        .try_get::<_, Option<_>>(columns.target_base_urls)?
        .unwrap_or_default();
    let versioned_urls: Vec<Option<String>> = row
        .try_get::<_, Option<_>>(columns.target_versioned_urls)?
        .unwrap_or_default();
    let ontology_ids: Vec<Uuid> = row
        .try_get::<_, Option<_>>(columns.target_ontology_ids)?
        .unwrap_or_default();
    fact.forbidden.extend(base_urls);
    fact.forbidden.extend(versioned_urls.into_iter().flatten());
    fact.forbidden
        .extend(ontology_ids.iter().map(Uuid::to_string));

    fact.associations.push(OwnedAssociation {
        source_id: source_base_url,
        source_title: row
            .try_get::<_, Option<String>>(columns.title)?
            .unwrap_or_default(),
        source_description: row.try_get(columns.description)?,
        targets: titles
            .into_iter()
            .zip(descriptions)
            .map(|(title, description)| (title.unwrap_or_default(), description))
            .collect(),
        minimum_targets: cardinality(row.try_get(columns.min_items)?),
        maximum_targets: cardinality(row.try_get(columns.max_items)?),
    });

    Ok(())
}

/// Fetches every current source type constraining each scoped type.
///
/// A source constrains a type when the latest current version of its resolved schema holds a
/// `links` key under the type's base id at any version, and a source constraining more than one
/// version contributes the newest constraint. Allowed targets resolve per base id to their
/// latest current prose, ordered by target id. A target reference whose base id is no longer
/// current drops out.
pub(super) async fn association_rows(
    transaction: &Transaction<'_>,
    axes: TemporalAxes,
    types: &[Uuid],
    facts: &mut [RelationFacts],
) -> Result<(), tokio_postgres::Error> {
    let statement = association_statement(&types, &axes.transaction_time);
    let rows = transaction
        .query(&statement.sql, &statement.parameters)
        .await?;

    for row in rows {
        apply_row(&row, &statement.columns, facts)?;
    }

    Ok(())
}

fn cardinality(value: Option<i64>) -> Option<usize> {
    usize::try_from(value?).ok()
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{super::super::sql::assert_placeholders_dense, association_statement};
    use crate::dataset::TemporalAxes;

    /// The association statement cites exactly the parameters it binds.
    #[test]
    fn statement_cites_its_whole_bind_list() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];

        let statement = association_statement(&types, &axes.transaction_time);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }
}

#[cfg(test)]
mod prepare_probe {
    use tokio_postgres::NoTls;
    use uuid::Uuid;

    use super::association_statement;
    use crate::dataset::TemporalAxes;

    #[tokio::test]
    async fn statement_prepares_against_the_live_store() {
        let (client, connection) = tokio_postgres::connect(
            "host=localhost user=postgres password=postgres dbname=graph",
            NoTls,
        )
        .await
        .expect("the graph store is reachable");
        tokio::spawn(connection);

        let axes = TemporalAxes::now();
        let types: Vec<Uuid> = Vec::new();
        let statement = association_statement(&types, &axes.transaction_time);
        if let Err(error) = client.prepare(&statement.sql).await {
            panic!("association: {error}");
        }
    }
}
