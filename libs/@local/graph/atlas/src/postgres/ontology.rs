//! The ontology payload lookups, under the frozen-snapshot regime.
//!
//! Both lookups take the dataset's transaction directly and execute their statements
//! themselves, reshaping the rows before streaming: the supertype rows gather into per-type
//! parent lists, and the icon rows decode into owned icons. The answers arrive in ontology row
//! order, the order the bound type table fixes, so a position here names the same type at
//! every consumer of the table.

use futures::{Stream, stream};
use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, Constant, Correlation, Expression, FromItem, NonEmptyVec, ReferenceTable,
    SelectList, SelectStatement, SimpleSelect, SortBy, Table, Transpile as _,
    table::{EntityTypeInheritsFrom, EntityTypes},
};
use smallvec::SmallVec;
use tokio_postgres::Transaction;
use uuid::Uuid;

use super::{
    id::ArchivedOntologyTypeUuid,
    sql::{MAPPING, Mapping, NearestIcon, nearest_declared_icon, type_mapping, uuid_array},
};
use crate::{
    dataset::{Ontology, auxiliary::OwnedIcon, postgres::PostgresDatasetError},
    identity::OntologyRowId,
};

/// Opens the ontology stream: each type's direct supertypes, in ontology row order.
///
/// Parents outside the type table cannot occur: the store materializes closures per edition, so
/// every depth-0 parent of a reachable type is itself reachable.
///
/// # Panics
///
/// This panics when the store returns a source outside the type table, which the statement's
/// own filter forbids.
///
/// # SQL
///
/// ```sql
/// SELECT inherits.source_entity_type_ontology_id, inherits.target_entity_type_ontology_id
/// FROM entity_type_inherits_from AS inherits
/// WHERE inherits.depth = 0
///   AND inherits.source_entity_type_ontology_id IN (<types>::uuid[])
/// ORDER BY inherits.source_entity_type_ontology_id, inherits.target_entity_type_ontology_id
/// ```
pub(crate) async fn ontology<'t>(
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
        .select_clause(
            SimpleSelect::builder()
                .selects(select.into_selects())
                .from({
                    // FROM <the all-depth inheritance table> AS inherits
                    FromItem::table(Table::Reference(ReferenceTable::EntityTypeInheritsFrom {
                        inheritance_depth: None,
                    }))
                    .alias(INHERITS)
                    .build()
                })
                .where_clause({
                    // WHERE inherits.depth = 0 AND the source = ANY(<types>)
                    Expression::all(vec![
                        INHERITS
                            .column(&EntityTypeInheritsFrom::Depth)
                            .equal(Constant::U32(0)),
                        source
                            .clone()
                            .r#in(Expression::from(types_placeholder).cast(uuid_array())),
                    ])
                }),
        )
        .order_by(NonEmptyVec::from_array([
            // ORDER BY the source, then the target
            SortBy::ascending(source).build(),
            SortBy::ascending(target).build(),
        ]))
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

/// Opens the icon payload stream, in ontology row order.
///
/// Each type answers exactly one row, because every join is outer and the unnested type table
/// survives them. The lateral picks the nearest declared icon in the type's closed schema, and
/// a chain without one answers SQL NULL for the decoder to default.
///
/// # SQL
///
/// ```sql
/// SELECT icon.value
/// FROM unnest(<types>::uuid[]) WITH ORDINALITY AS mapping(ontology_id, ordinality)
/// LEFT JOIN entity_types AS types ON types.ontology_id = mapping.ontology_id
/// LEFT JOIN LATERAL (<the nearest declared icon>) AS icon ON TRUE
/// ORDER BY mapping.ordinality
/// ```
pub(crate) async fn ontology_icons<'t>(
    transaction: &Transaction<'_>,
    types: &'t [Uuid],
) -> Result<
    impl Stream<Item = Result<OwnedIcon, PostgresDatasetError>> + use<'t>,
    PostgresDatasetError,
> {
    const TYPES: Aliased<EntityTypes> = Aliased::of(Table::EntityTypes, "types");
    const ICON: Correlation<NearestIcon> = Correlation::new("icon");

    let mut binder = Binder::default();
    let types_placeholder = binder.bind(&types);

    // SELECT icon.value
    let mut select = SelectList::default();
    let icon_index = select.output(ICON.column(&NearestIcon::Value));

    let statement = SelectStatement::builder()
        .select_clause(
            SimpleSelect::builder()
                .selects(select.into_selects())
                .from({
                    // FROM unnest(<types>) WITH ORDINALITY AS mapping(ontology_id, ordinality)
                    // LEFT JOIN entity_types AS types ON types.ontology_id = mapping.ontology_id
                    // LEFT JOIN LATERAL (<nearest icon>) AS icon ON TRUE
                    //
                    // LEFT joins keep every ordinal at exactly one output row: an inner join
                    // miss would shift every later position instead of delivering an empty icon.
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
                            FromItem::subquery(nearest_declared_icon(TYPES))
                                .alias(ICON)
                                .lateral(true),
                            Vec::<Expression>::new(),
                        )
                }),
        )
        .order_by(NonEmptyVec::from_array(
            // ORDER BY mapping.ordinality
            [SortBy::ascending(MAPPING.column(&Mapping::Ordinality)).build()],
        ))
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
