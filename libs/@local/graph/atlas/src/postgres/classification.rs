//! The node-versus-link classification over requested identities, under the serving-time regime.
//!
//! The statement executes on its caller's own connection at axes taken at the call, so a
//! verdict describes the store as it stands rather than as any fit observed it.
//! [`Classification`] states the type law the verdict applies. Result identity keys each
//! answer, and the caller counts the answers against its requests.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, Expression, FromItem, Placeholder, SelectList,
    SelectStatement, Table, WithExpression, table::EntityEdge,
};
use tokio_postgres::{Row, types::ToSql};
use uuid::Uuid;

use super::{
    LINK_ROOT_BASE_URL, corpus,
    id::ArchivedEntityId,
    requests::requests,
    sql::{AttachmentVocabulary, Axes},
    vocabulary::{CorpusTable, Requests},
};
use crate::dataset::{TemporalAxes, postgres::PostgresDatasetError};

/// The output columns of the classification lookup.
pub(crate) struct ClassificationColumns {
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
    Edge {
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
///
/// # SQL
///
/// ```sql
/// WITH requests AS (<requests>)
/// SELECT requests.web_id, requests.entity_uuid, EXISTS (<link-typed>),
///     left_edge.target_web_id, left_edge.target_entity_uuid,
///     right_edge.target_web_id, right_edge.target_entity_uuid
/// FROM requests
/// LEFT JOIN entity_edge AS left_edge ON <the outgoing has-left edge>
/// LEFT JOIN entity_edge AS right_edge ON <the outgoing has-right edge>
/// ```
pub(crate) fn classification_statement<'params>(
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
pub(crate) fn decode_classification(
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
        Classification::Edge {
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

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{super::sql::assert_placeholders_dense, classification_statement};
    use crate::dataset::TemporalAxes;

    /// The statement cites exactly the parameters it binds.
    #[test]
    fn statement_cites_its_whole_bind_list() {
        let axes = TemporalAxes::now();
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = classification_statement(&axes, &web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered statement, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store. Reviewing a diff, hold it to the
    /// statement's own contract: both attachment edges join outer, so a link with an absent
    /// or incomplete attachment pair still answers.
    #[test]
    fn statement_text() {
        let axes = TemporalAxes::now();
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = classification_statement(&axes, &web_ids, &entity_uuids);
        insta::assert_snapshot!(statement.sql);
    }
}
