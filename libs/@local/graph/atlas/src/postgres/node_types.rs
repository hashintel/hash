//! The direct-type lookup over requested identities, under the frozen-snapshot regime.
//!
//! The statement executes on the dataset's one repeatable-read transaction. It resolves each
//! requested identity to its current edition at the dataset's axes and answers the edition's
//! direct types as ordinals into the bound type table - exactly the depth-0 type rows the node
//! stream carries. Result identity keys each answer, and the caller counts the answers against
//! its requests.

use hash_graph_postgres_store::store::postgres::query::{
    Binder, BoundStatement, FromItem, Function, PostgresType, SelectList, SelectStatement,
    WithExpression,
};
use smallvec::SmallVec;
use tokio_postgres::{Row, types::ToSql};
use uuid::Uuid;

use super::{
    corpus,
    id::ArchivedEntityId,
    requests::requests,
    sql::Axes,
    vocabulary::{CorpusTable, Requests, TypeRows},
};
use crate::{
    dataset::{TemporalAxes, postgres::PostgresDatasetError},
    identity::OntologyRowId,
};

/// The output columns of the node-type lookup.
pub(crate) struct NodeTypeColumns {
    /// The web the entity belongs to.
    pub web_id: usize,
    /// The entity's identity within its web.
    pub entity_uuid: usize,
    /// The direct-type ordinals, ascending.
    pub ordinals: usize,
}

/// Builds the direct-type lookup over the requested identities.
///
/// The statement resolves each identity to its current edition and answers that edition's
/// direct types as ascending type-table ordinals, the empty array when the edition lists none.
/// The caller counts the answers against its requests. A missing row is an identity that is
/// draft-only, archived, or absent at the axes.
///
/// # SQL
///
/// ```sql
/// WITH requests AS (<requests>), type_rows AS (<type_rows>)
/// SELECT requests.web_id, requests.entity_uuid,
///     COALESCE(type_rows.ordinals, ARRAY[]::int8[])
/// FROM requests
/// LEFT JOIN type_rows ON type_rows.entity_edition_id = requests.entity_edition_id
/// ```
pub(crate) fn node_type_statement<'params>(
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

/// Converts a column of SQL ordinals into ontology row references.
pub(crate) fn ontology_rows(
    ordinals: Vec<i64>,
) -> Result<SmallVec<OntologyRowId, 2>, PostgresDatasetError> {
    ordinals
        .into_iter()
        .map(|ordinal| {
            u64::try_from(ordinal)
                .map(OntologyRowId::new)
                .map_err(|_error| PostgresDatasetError::Ordinal { value: ordinal })
        })
        .collect()
}

/// Decodes one direct-type row.
pub(crate) fn decode_node_types(
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
        ontology_rows(ordinals)?,
    ))
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{super::sql::assert_placeholders_dense, node_type_statement};
    use crate::dataset::TemporalAxes;

    /// The statement cites exactly the parameters it binds.
    #[test]
    fn statement_cites_its_whole_bind_list() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = node_type_statement(&axes, &types, &web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store.
    #[test]
    fn statement_text() {
        let axes = TemporalAxes::now();
        let types = vec![Uuid::nil()];
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = node_type_statement(&axes, &types, &web_ids, &entity_uuids);
        insta::assert_snapshot!(statement.sql);
    }
}
