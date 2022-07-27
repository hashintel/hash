use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use serde::Deserialize;
use tokio_postgres::GenericClient;

use crate::{
    knowledge::{Entity, EntityId},
    ontology::{types::Persisted, VersionId},
    store::{crud, postgres::database_type::DatabaseType, AsClient, PostgresStore, QueryError},
};

#[async_trait]
impl<C: AsClient, T> crud::Read<VersionId, T> for PostgresStore<C>
where
    for<'de> T: DatabaseType + Deserialize<'de>,
{
    type Output = Persisted<T>;

    async fn get(&self, index: &VersionId) -> Result<Self::Output, QueryError> {
        // SAFETY: We insert a table name here, but `T::table()` is only accessible from within this
        //   module.
        let row = self
            .as_client()
            .query_one(
                &format!(
                    r#"
                    SELECT version_id, schema, created_by
                    FROM {}
                    WHERE version_id = $1;
                    "#,
                    T::table()
                ),
                &[index],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(*index)?;

        Ok(Persisted::new(
            row.get(0),
            serde_json::from_value(row.get(1))
                .report()
                .change_context(QueryError)?,
            row.get(2),
        ))
    }
}

#[async_trait]
impl<C: AsClient> crud::Read<EntityId, Entity> for PostgresStore<C> {
    type Output = Entity;

    async fn get(&self, index: &EntityId) -> Result<Self::Output, QueryError> {
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
                &[index],
            )
            .await
            .report()
            .change_context(QueryError)
            .attach_printable(*index)?;

        Ok(serde_json::from_value(row.get(0))
            .report()
            .change_context(QueryError)?)
    }
}
