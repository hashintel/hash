//! Batched whole-entity embedding queries with full-width and projector projections.
//!
//! Use [`canonical_embedding_statement`] for stored vectors at full width, or
//! [`projector_embedding_statement`] for the normalized prefix used as a dataset representation.
//!
//! Pass equal-length UUID arrays, pairing each web ID with the entity UUID at the same position.
//! Each result includes that identity. Match results by identity rather than result position: the
//! query has no ordering guarantee and omits identities without a whole-entity embedding.
//!
//! The lookup selects by entity identity, independently of edition selection. Visibility follows
//! the connection or transaction executing the statement.

use hash_graph_postgres_store::store::postgres::query::{
    Aliased, Binder, BoundStatement, Expression, SelectList, SelectStatement, SimpleSelect, Table,
    table::EntityEmbeddings,
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

/// Column positions for decoding an embedding query's identity and vector.
pub(crate) struct EmbeddingLookupColumns {
    /// Position of the web ID.
    pub web_id: usize,
    /// Position of the entity UUID within that web.
    pub entity_uuid: usize,
    /// Position of the projected embedding.
    pub embedding: usize,
}

/// Selects whole-entity embeddings with a configurable vector projection.
///
/// `web_ids` and `entity_uuids` bind as UUID arrays paired by position. `projection` selects the
/// vector expression while the identity columns and whole-entity filter remain fixed.
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
        .select_clause(
            SimpleSelect::builder()
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
                .where_clause({
                    // WHERE embeddings.property IS NULL
                    EMBEDDING.column(&EntityEmbeddings::Property).is_null()
                }),
        )
        .build();

    BoundStatement::new(&statement, binder, columns)
}

/// Selects the stored full-width embedding for each requested entity.
///
/// The query returns every matching whole-entity embedding unchanged. The UUID arrays must pair web
/// IDs and entity UUIDs by position. Decode results with [`decode_canonical_embedding`].
pub(crate) fn canonical_embedding_statement<'params>(
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, EmbeddingLookupColumns> {
    embedding_lookup(web_ids, entity_uuids, |embedding| {
        embedding.column(&EntityEmbeddings::Embedding)
    })
}

/// Selects each requested entity's embedding prefix for projection.
///
/// [`normalized_prefix`] selects the leading [`PROJECTOR_DIMENSIONS`] components and applies
/// pgvector's L2 normalization in the database. For the same stored embedding, the result is
/// bit-identical to its dataset representation.
///
/// The UUID arrays must pair web IDs and entity UUIDs by position. Decode results with
/// [`decode_projector_embedding`].
pub(crate) fn projector_embedding_statement<'params>(
    web_ids: &'params (impl ToSql + Sync),
    entity_uuids: &'params (impl ToSql + Sync),
) -> BoundStatement<'params, EmbeddingLookupColumns> {
    embedding_lookup(web_ids, entity_uuids, normalized_prefix)
}

/// Reads an entity identity and full-width vector from a query result.
///
/// # Errors
///
/// Returns [`PostgresDatasetError::Query`] if a selected column is missing or cannot decode,
/// including a vector with a width other than [`CANONICAL_DIMENSIONS`].
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

/// Reads an entity identity and projector-input vector from a query result.
///
/// # Errors
///
/// Returns [`PostgresDatasetError::Query`] if a selected column is missing or cannot decode,
/// including a vector with a width other than [`PROJECTOR_DIMENSIONS`].
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

    #[test]
    fn statements_cite_their_whole_bind_list() {
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        let statement = canonical_embedding_statement(&web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());

        let statement = projector_embedding_statement(&web_ids, &entity_uuids);
        assert_placeholders_dense(&statement.sql, statement.parameters.len());
    }

    #[test]
    fn canonical_statement_text() {
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        insta::assert_snapshot!(canonical_embedding_statement(&web_ids, &entity_uuids).sql);
    }

    #[test]
    fn projector_statement_text() {
        let web_ids = vec![Uuid::nil()];
        let entity_uuids = vec![Uuid::nil()];

        insta::assert_snapshot!(projector_embedding_statement(&web_ids, &entity_uuids).sql);
    }
}
