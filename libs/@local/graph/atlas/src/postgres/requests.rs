//! The shared request kit binding caller identities as the statements' request table.
//!
//! Every identity-keyed statement starts from the same bound pair - a web-id array and an
//! entity-uuid array, aligned by position - and this module holds that shape's one spelling,
//! from the array split through the [`requests`] fragment resolving each request row to its
//! current edition. The kit fixes no execution regime. The
//! statement that attaches these fragments decides whether they run on the dataset's frozen
//! snapshot or on a caller's own connection, and its own module doc names which.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, ColumnName, Correlation, Expression, FromItem, Function, Placeholder, PostgresType,
    SelectExpression, SelectStatement, SimpleSelect, Table,
    table::{DatabaseColumn, EntityEditions, EntityTemporalMetadata},
};
use uuid::Uuid;

use super::{
    id::ArchivedEntityId,
    sql::{Axes, current_identity_join, edition_conjunction, uuid_array},
    vocabulary::Requests,
};

/// The columns of the unnested request pair, introduced by [`request_pair`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Request {
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
pub(crate) const REQUEST: Correlation<Request> = Correlation::new("request");

/// Builds the `request` rows: the bound identity pair unnested one row per requested identity.
///
/// # SQL
///
/// ```sql
/// unnest(<web_ids>::uuid[], <entity_uuids>::uuid[]) AS request(web_id, entity_uuid)
/// ```
pub(crate) fn request_pair(web_ids: Placeholder, entity_uuids: Placeholder) -> FromItem<'static> {
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
pub(crate) fn request_arrays<I: Iterator<Item = ArchivedEntityId>>(
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
///
/// # SQL
///
/// ```sql
/// SELECT meta.web_id, meta.entity_uuid, meta.entity_edition_id
/// FROM unnest(<web_ids>::uuid[], <entity_uuids>::uuid[]) AS request(web_id, entity_uuid)
/// INNER JOIN entity_temporal_metadata AS meta
///   ON meta.web_id = request.web_id
///  AND meta.entity_uuid = request.entity_uuid
///  AND <the currency conditions>
/// INNER JOIN entity_editions AS edition
///   ON edition.entity_edition_id = meta.entity_edition_id
///  AND NOT edition.archived
/// ```
pub(crate) fn requests(
    axes: Axes,
    web_ids: Placeholder,
    entity_uuids: Placeholder,
) -> SelectStatement {
    const META: Aliased<EntityTemporalMetadata> =
        Aliased::of(Table::EntityTemporalMetadata, "meta");
    const EDITION: Aliased<EntityEditions> = Aliased::of(Table::EntityEditions, "edition");

    SelectStatement::builder()
        .select_clause(
            SimpleSelect::builder()
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
                    //   ON edition.entity_edition_id = meta.entity_edition_id
                    //  AND NOT edition.archived
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
                            edition_conjunction(
                                EDITION,
                                META.column(&EntityTemporalMetadata::EditionId),
                            ),
                        )
                }),
        )
        .build()
}
