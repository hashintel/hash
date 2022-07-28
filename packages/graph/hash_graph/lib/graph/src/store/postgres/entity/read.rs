use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    knowledge::{Entity, EntityId},
    store::{crud, AsClient, PostgresStore, QueryError},
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
