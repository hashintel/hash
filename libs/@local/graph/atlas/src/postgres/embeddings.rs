//! The embedding lookups over requested identities.
//!
//! One builder produces both statements, so the request join and the answer shape are a single
//! definition and the projection is the only difference between them. The canonical lookup
//! executes on the dataset's frozen-snapshot transaction and answers the stored whole-entity
//! embedding at full width. The projector lookup executes on its caller's own connection at
//! serving time and answers the embedding's
//! l2-normalized projector prefix, bit-identical to the representation row a fit reads for the
//! same stored embedding. Result identity keys each answer, and the caller counts the answers
//! against its requests.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, Expression, SelectList, SelectStatement, Table,
    WhereExpression, table::EntityEmbeddings,
};
use tokio_postgres::{Row, types::ToSql};
use uuid::Uuid;

use super::{
    id::ArchivedEntityId,
    requests::{REQUEST, Request, request_pair},
    vector::{PgVector, normalized_prefix},
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, PROJECTOR_DIMENSIONS, postgres::PostgresDatasetError},
    math::BoxedVecN,
};

/// The output columns of one embedding lookup.
pub(crate) struct EmbeddingLookupColumns {
    /// The web the entity belongs to.
    pub web_id: usize,
    /// The entity's identity within its web.
    pub entity_uuid: usize,
    /// The requested projection of the whole-entity embedding.
    pub embedding: usize,
}

/// Builds an embedding lookup over the requested identities, with the caller's projection.
///
/// # SQL
///
/// ```sql
/// SELECT embeddings.web_id, embeddings.entity_uuid, <projection>
/// FROM unnest(<web_ids>::uuid[], <entity_uuids>::uuid[]) AS request(web_id, entity_uuid)
/// INNER JOIN entity_embeddings AS embeddings
///   ON embeddings.web_id = request.web_id
///  AND embeddings.entity_uuid = request.entity_uuid
/// WHERE embeddings.property IS NULL
/// ```
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

/// Builds the canonical-embedding lookup over the requested identities.
///
/// The statement delivers the full-width embedding for every requested identity the store
/// holds a whole-entity embedding for. The caller counts the answers against its requests. A
/// missing row is an identity whose whole-entity embedding the store does not hold.
pub(crate) fn canonical_embedding_statement<'params>(
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
pub(crate) fn projector_embedding_statement<'params>(
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, EmbeddingLookupColumns> {
    embedding_lookup(web_ids, entity_uuids, normalized_prefix)
}

/// Decodes one canonical-embedding row.
pub(crate) fn decode_canonical_embedding(
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
pub(crate) fn decode_projector_embedding(
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

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::{
        super::sql::assert_placeholders_dense, canonical_embedding_statement,
        projector_embedding_statement,
    };

    /// Both lookups cite exactly the parameters they bind.
    #[test]
    fn statements_cite_their_whole_bind_list() {
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = canonical_embedding_statement(&web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = projector_embedding_statement(&web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    /// The rendered canonical lookup, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store.
    #[test]
    fn canonical_statement_text() {
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        insta::assert_snapshot!(canonical_embedding_statement(&web_ids, &entity_uuids).sql);
    }

    /// The rendered projector lookup, pinned as the text the store receives.
    ///
    /// The pin makes any rendering change a visible snapshot diff in review instead of a
    /// silent swap of what runs against the store. Reviewing a diff, hold it to the
    /// statement's own contract: the projection is the node stream's own normalized-prefix
    /// expression, so an answer stays bit-identical to the representation row a fit reads.
    #[test]
    fn projector_statement_text() {
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        insta::assert_snapshot!(projector_embedding_statement(&web_ids, &entity_uuids).sql);
    }
}
