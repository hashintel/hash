use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::ToSql;
use tokio_postgres::GenericClient;

use crate::{
    knowledge::{Entity, EntityId},
    store::{crud, AsClient, PostgresStore, QueryError},
    AllLatest,
};

#[async_trait]
impl<C: AsClient> crud::Read<'_, EntityId, Entity> for PostgresStore<C> {
    type Output = Entity;

    async fn get(&self, identifier: EntityId) -> Result<Self::Output, QueryError> {
        let row = self
            .as_client()
            .query_one(
                r#"
                    SELECT properties
                    FROM entities
                    WHERE entity_id = $1 AND version = (
                        SELECT MAX("version")
                        FROM entities
                        WHERE entity_id = $1
                    );
                "#,
                &[&identifier],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(identifier)?;

        Ok(serde_json::from_value(row.get(0))
            .report()
            .change_context(QueryError)?)
    }
}

#[async_trait]
impl<C: AsClient> crud::Read<'_, AllLatest, Entity> for PostgresStore<C> {
    type Output = Vec<Entity>;

    async fn get(&self, _: AllLatest) -> Result<Self::Output, QueryError> {
        let row_stream = self
            .as_client()
            .query_raw(
                r#"
                    SELECT DISTINCT ON(entity_id) properties
                    FROM entities
                    ORDER BY entity_id, version DESC;
                    "#,
                // Requires a concrete type, which implements
                // `IntoIterator<Item = impl BorrowToSql>`
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .report()
            .change_context(QueryError)?;

        row_stream
            .map(|row_result| {
                let row = row_result.report().change_context(QueryError)?;
                serde_json::from_value(row.get(0))
                    .report()
                    .change_context(QueryError)
            })
            .try_collect()
            .await
    }
}
