use async_trait::async_trait;
use chrono::{DateTime, Utc};
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::ToSql;
use tokio_postgres::{GenericClient, RowStream};

use crate::{
    knowledge::{EntityId, PersistedEntity},
    ontology::{types::uri::VersionedUri, AccountId},
    store::{
        crud,
        query::{EntityQuery, EntityVersion},
        AsClient, PostgresStore, QueryError,
    },
};

async fn by_id_by_latest_version(
    client: &(impl GenericClient + Sync),
    entity_id: EntityId,
) -> Result<RowStream, QueryError> {
    client
        .query_raw(
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
            &[&entity_id],
        )
        .await
        .into_report()
        .change_context(QueryError)
}

async fn by_latest_version(client: &(impl GenericClient + Sync)) -> Result<RowStream, QueryError> {
    client
        .query_raw(
            r#"
            SELECT DISTINCT ON(entity_id) properties, entity_id, entities.version, ids.base_uri, ids.version, created_by
            FROM entities
            INNER JOIN ids ON ids.version_id = entities.entity_type_version_id
            ORDER BY entity_id, entities.version DESC;
            "#,
            // Requires a concrete type, which implements `IntoIterator<Item = impl BorrowToSql>`
            [] as [&(dyn ToSql + Sync); 0],
        ).await
        .into_report()
        .change_context(QueryError)
}

#[async_trait]
impl<C: AsClient> crud::Read<PersistedEntity> for PostgresStore<C> {
    type Query<'q> = EntityQuery;

    async fn read<'query>(
        &self,
        query: &Self::Query<'query>,
    ) -> Result<Vec<PersistedEntity>, QueryError> {
        let row_stream = match (query.id(), query.version()) {
            (Some(entity_id), Some(EntityVersion::Latest)) => {
                by_id_by_latest_version(self.as_client(), entity_id).await?
            }
            (None, Some(EntityVersion::Latest)) => by_latest_version(self.as_client()).await?,
            _ => todo!(),
        };

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
