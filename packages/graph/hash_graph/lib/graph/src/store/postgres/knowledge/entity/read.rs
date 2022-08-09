use async_trait::async_trait;
use chrono::{DateTime, Utc};
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::ToSql;
use tokio_postgres::GenericClient;

use crate::{
    knowledge::EntityId,
    ontology::AccountId,
    store::{crud, AsClient, PostgresStore, QueryError},
    AllLatest, PersistedEntity, VersionedUri,
};

#[async_trait]
impl<C: AsClient> crud::Read<'_, EntityId, PersistedEntity> for PostgresStore<C> {
    type Output = PersistedEntity;

    async fn get(&self, identifier: EntityId) -> Result<Self::Output, QueryError> {
        let row = self
            .as_client()
            .query_one(
                r#"
                SELECT properties, entity_id, entities.version, ids.base_uri, ids.version, created_by
                FROM entities
                INNER JOIN ids ON ids.version_id = entities.entity_type_version_id
                WHERE entity_id = $1 AND entities.version = (
                    SELECT MAX("version")
                    FROM entities
                    WHERE entity_id = $1
                );
                "#,
                &[&identifier],
            )
            .await
            .into_report()
            .change_context(QueryError)
            .attach_printable(identifier)?;

        let entity = serde_json::from_value(row.get(0))
            .into_report()
            .change_context(QueryError)?;

        let entity_id: EntityId = row.get(1);
        let entity_version: DateTime<Utc> = row.get(2);
        let type_base_uri: String = row.get(3);
        let type_version: i64 = row.get(4);
        let created_by: AccountId = row.get(5);

        let type_versioned_uri = VersionedUri::new(type_base_uri, type_version as u32);
        Ok(PersistedEntity::new(
            entity,
            entity_id,
            entity_version,
            type_versioned_uri,
            created_by,
        ))
    }
}

#[async_trait]
impl<C: AsClient> crud::Read<'_, AllLatest, PersistedEntity> for PostgresStore<C> {
    type Output = Vec<PersistedEntity>;

    async fn get(&self, _: AllLatest) -> Result<Self::Output, QueryError> {
        let row_stream = self
            .as_client()
            .query_raw(
                r#"
                SELECT DISTINCT ON(entity_id) properties, entity_id, entities.version, ids.base_uri, ids.version, created_by
                FROM entities
                INNER JOIN ids ON ids.version_id = entities.entity_type_version_id
                ORDER BY entity_id, entities.version DESC;
                "#,
                // Requires a concrete type, which implements
                // `IntoIterator<Item = impl BorrowToSql>`
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .into_report()
            .change_context(QueryError)?;

        row_stream
            .map(|row_result| {
                let row = row_result.into_report().change_context(QueryError)?;
                let entity = serde_json::from_value(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;

                let entity_id: EntityId = row.get(1);
                let entity_version: DateTime<Utc> = row.get(2);
                let type_base_uri: String = row.get(3);
                let type_version: i64 = row.get(4);
                let created_by: AccountId = row.get(5);

                let type_versioned_uri = VersionedUri::new(type_base_uri, type_version as u32);
                Ok(PersistedEntity::new(
                    entity,
                    entity_id,
                    entity_version,
                    type_versioned_uri,
                    created_by,
                ))
            })
            .try_collect()
            .await
    }
}
