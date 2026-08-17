//! The prose and ancestry facts, carrying each type's own phrasing and its inheritance chain.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, Correlation, FromItem, OrderByExpression, ReferenceTable,
    SelectList, SelectStatement, Table, WhereExpression,
    table::{EntityTypeInheritsFrom, EntityTypes, OntologyIds},
};
use hash_graph_store::query::Ordering;
use tokio_postgres::{Transaction, types::ToSql};
use uuid::Uuid;

use super::{
    super::{
        LINK_ROOT_BASE_URL,
        sql::{MAPPING, Mapping, json_field, json_text, type_mapping},
    },
    DESCRIPTION_KEY, ID_KEY, OwnedType, RelationFacts, TITLE_KEY, fact_at,
};

/// The inverse-phrasing key of a link type schema.
const INVERSE_KEY: &str = "inverse";

/// The output columns of the prose statement.
struct ProseColumns {
    base_url: usize,
    versioned_url: usize,
    title: usize,
    description: usize,
    inverse_title: usize,
}

/// Builds the prose statement, reading each type's own prose in type-table order.
///
/// # SQL
///
/// ```sql
/// SELECT
///     ids.base_url,
///     types.schema ->> '$id',
///     types.schema ->> 'title',
///     types.schema ->> 'description',
///     types.schema -> 'inverse' ->> 'title'
/// FROM unnest(<types>) WITH ORDINALITY AS mapping(ontology_id, ordinality)
/// JOIN entity_types AS types ON types.ontology_id = mapping.ontology_id
/// JOIN ontology_ids AS ids ON ids.ontology_id = mapping.ontology_id
/// ORDER BY mapping.ordinality
/// ```
fn prose_statement(types: &(impl ToSql + Sync)) -> BoundStatement<'_, ProseColumns> {
    const TYPES: Aliased<EntityTypes> = Aliased::of(Table::EntityTypes, "types");
    const IDS: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "ids");

    let mut binder = Binder::default();
    let types_placeholder = binder.bind(types);

    let schema = || TYPES.column(&EntityTypes::Schema);

    let mut select = SelectList::default();
    let columns = ProseColumns {
        base_url: select.output(IDS.column(&OntologyIds::BaseUrl)),
        versioned_url: select.output(json_text(schema(), ID_KEY)),
        title: select.output(json_text(schema(), TITLE_KEY)),
        description: select.output(json_text(schema(), DESCRIPTION_KEY)),
        inverse_title: select.output(json_text(json_field(schema(), INVERSE_KEY), TITLE_KEY)),
    };

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from(
            type_mapping(types_placeholder)
                .inner_join_on(
                    TYPES.from_item(),
                    vec![
                        TYPES
                            .column(&EntityTypes::OntologyId)
                            .equal(MAPPING.column(&Mapping::OntologyId)),
                    ],
                )
                .inner_join_on(
                    IDS.from_item(),
                    vec![
                        IDS.column(&OntologyIds::OntologyId)
                            .equal(MAPPING.column(&Mapping::OntologyId)),
                    ],
                ),
        )
        .order_by_expression(OrderByExpression::default().with(
            MAPPING.column(&Mapping::Ordinality),
            Ordering::Ascending,
            None,
        ))
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Fetches every type's own prose and base id, seeding the facts table.
///
/// The `n`-th returned facts belong to `types[n]`: the statement orders by the unnest
/// ordinality, and the row count check makes a violated referential contract loud.
///
/// # Panics
///
/// This panics when a type in `types` resolves no versioned type row, which the store's foreign
/// keys forbid.
pub(super) async fn prose_rows(
    transaction: &Transaction<'_>,
    types: &[Uuid],
) -> Result<Vec<RelationFacts>, tokio_postgres::Error> {
    let statement = prose_statement(&types);
    let rows = transaction
        .query(&statement.sql, &statement.parameters)
        .await?;

    assert_eq!(
        rows.len(),
        types.len(),
        "every type reachable from an edition resolves its versioned type row",
    );

    let mut facts = Vec::with_capacity(types.len());
    for (row, id) in rows.iter().zip(types) {
        let base_url: String = row.try_get(statement.columns.base_url)?;
        let versioned_url: Option<String> = row.try_get(statement.columns.versioned_url)?;

        let mut forbidden = vec![id.to_string(), base_url.clone()];
        forbidden.extend(versioned_url);

        facts.push(RelationFacts {
            relation: OwnedType {
                id: base_url,
                title: row
                    .try_get::<_, Option<String>>(statement.columns.title)?
                    .unwrap_or_default(),
                description: row.try_get(statement.columns.description)?,
                inverse_title: row.try_get(statement.columns.inverse_title)?,
            },
            ancestors: Vec::new(),
            associations: Vec::new(),
            examples: Vec::new(),
            forbidden,
        });
    }

    Ok(facts)
}

/// The output columns of the ancestor statement.
struct AncestorColumns {
    ordinality: usize,
    base_url: usize,
    versioned_url: usize,
    title: usize,
    description: usize,
    ancestor_id: usize,
}

/// Builds the ancestor statement, walking the all-depth inheritance table to each type's
/// ancestors.
///
/// # SQL
///
/// ```sql
/// SELECT
///     mapping.ordinality,
///     ids.base_url,
///     types.schema ->> '$id',
///     types.schema ->> 'title',
///     types.schema ->> 'description',
///     inherits.target_entity_type_ontology_id
/// FROM unnest(<types>) WITH ORDINALITY AS mapping(ontology_id, ordinality)
/// JOIN <the all-depth inheritance table> AS inherits
///   ON inherits.source_entity_type_ontology_id = mapping.ontology_id
/// JOIN entity_types AS types ON types.ontology_id = inherits.target_entity_type_ontology_id
/// JOIN ontology_ids AS ids ON ids.ontology_id = types.ontology_id
/// JOIN ontology_ids AS own ON own.ontology_id = mapping.ontology_id
/// WHERE ids.base_url != <link root> AND ids.base_url != own.base_url
/// ORDER BY mapping.ordinality, inherits.depth, inherits.target_entity_type_ontology_id
/// ```
fn ancestor_statement(types: &(impl ToSql + Sync)) -> BoundStatement<'_, AncestorColumns> {
    const INHERITS: Correlation<EntityTypeInheritsFrom> = Correlation::new("inherits");
    const TYPES: Aliased<EntityTypes> = Aliased::of(Table::EntityTypes, "types");
    const IDS: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "ids");
    const OWN: Aliased<OntologyIds> = Aliased::of(Table::OntologyIds, "own");

    let mut binder = Binder::default();
    let types_placeholder = binder.bind(types);
    let link_root = binder.bind(&LINK_ROOT_BASE_URL);

    let schema = || TYPES.column(&EntityTypes::Schema);
    let ancestor = || INHERITS.column(&EntityTypeInheritsFrom::TargetEntityTypeOntologyId);

    let mut select = SelectList::default();
    let columns = AncestorColumns {
        ordinality: select.output(MAPPING.column(&Mapping::Ordinality)),
        base_url: select.output(IDS.column(&OntologyIds::BaseUrl)),
        versioned_url: select.output(json_text(schema(), ID_KEY)),
        title: select.output(json_text(schema(), TITLE_KEY)),
        description: select.output(json_text(schema(), DESCRIPTION_KEY)),
        ancestor_id: select.output(ancestor()),
    };

    let statement = SelectStatement::builder()
        .selects(select.into_selects())
        .from(
            type_mapping(types_placeholder)
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
                    TYPES.from_item(),
                    vec![TYPES.column(&EntityTypes::OntologyId).equal(ancestor())],
                )
                .inner_join_on(
                    IDS.from_item(),
                    vec![
                        IDS.column(&OntologyIds::OntologyId)
                            .equal(TYPES.column(&EntityTypes::OntologyId)),
                    ],
                )
                .inner_join_on(
                    OWN.from_item(),
                    vec![
                        OWN.column(&OntologyIds::OntologyId)
                            .equal(MAPPING.column(&Mapping::OntologyId)),
                    ],
                ),
        )
        .where_expression(WhereExpression::from_iter([
            IDS.column(&OntologyIds::BaseUrl).not_equal(link_root),
            IDS.column(&OntologyIds::BaseUrl)
                .not_equal(OWN.column(&OntologyIds::BaseUrl)),
        ]))
        .order_by_expression(
            OrderByExpression::default()
                .with(
                    MAPPING.column(&Mapping::Ordinality),
                    Ordering::Ascending,
                    None,
                )
                .with(
                    INHERITS.column(&EntityTypeInheritsFrom::Depth),
                    Ordering::Ascending,
                    None,
                )
                .with(ancestor(), Ordering::Ascending, None),
        )
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Fetches every type's ancestors ordered by (depth, id).
///
/// The store's inheritance table holds no self rows, and the statement excludes other versions
/// of a type's own base id along with it. The link root contributes no prose.
pub(super) async fn ancestor_rows(
    transaction: &Transaction<'_>,
    types: &[Uuid],
    facts: &mut [RelationFacts],
) -> Result<(), tokio_postgres::Error> {
    let statement = ancestor_statement(&types);
    let rows = transaction
        .query(&statement.sql, &statement.parameters)
        .await?;

    for row in rows {
        let fact = fact_at(facts, row.try_get(statement.columns.ordinality)?);

        let base_url: String = row.try_get(statement.columns.base_url)?;
        let versioned_url: Option<String> = row.try_get(statement.columns.versioned_url)?;
        let ancestor_id: Uuid = row.try_get(statement.columns.ancestor_id)?;
        fact.forbidden.push(base_url.clone());
        fact.forbidden.extend(versioned_url);
        fact.forbidden.push(ancestor_id.to_string());

        fact.ancestors.push(OwnedType {
            id: base_url,
            title: row
                .try_get::<_, Option<String>>(statement.columns.title)?
                .unwrap_or_default(),
            description: row.try_get(statement.columns.description)?,
            inverse_title: None,
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{
        super::super::sql::assert_placeholders_dense, ancestor_statement, prose_statement,
    };

    /// The prose statement cites exactly the parameters it binds.
    #[test]
    fn prose_statement_cites_its_whole_bind_list() {
        let types = vec![Uuid::nil()];

        let statement = prose_statement(&types);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered prose statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store.
    #[test]
    fn prose_statement_text() {
        let types = vec![Uuid::nil()];

        insta::assert_snapshot!(prose_statement(&types).sql);
    }

    /// The ancestor statement cites exactly the parameters it binds.
    #[test]
    fn ancestor_statement_cites_its_whole_bind_list() {
        let types = vec![Uuid::nil()];

        let statement = ancestor_statement(&types);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered ancestor statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store.
    #[test]
    fn ancestor_statement_text() {
        let types = vec![Uuid::nil()];

        insta::assert_snapshot!(ancestor_statement(&types).sql);
    }
}
