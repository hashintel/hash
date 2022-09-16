use chrono::{DateTime, Utc};
use error_stack::{IntoReport, Result, ResultExt};
use futures::{Stream, StreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::uri::{BaseUri, VersionedUri};

use crate::{
    knowledge::{Entity, EntityId, PersistedEntity},
    ontology::AccountId,
    store::{postgres::parameter_list, AsClient, QueryError},
};

pub struct EntityRecord {
    pub entity: Entity,
    pub id: EntityId,
    pub version: DateTime<Utc>,
    pub type_uri: VersionedUri,
    pub account_id: AccountId,
    pub is_latest: bool,
}

impl From<EntityRecord> for PersistedEntity {
    fn from(record: EntityRecord) -> Self {
        Self::new(
            record.entity,
            record.id,
            record.version,
            record.type_uri,
            record.account_id,
        )
    }
}

pub type RecordStream = impl Stream<Item = Result<EntityRecord, QueryError>>;

fn row_stream_to_record_stream(
    row_stream: RowStream,
) -> impl Stream<Item = Result<EntityRecord, QueryError>> {
    row_stream.map(|row_result| {
        let row = row_result.into_report().change_context(QueryError)?;

        Ok(EntityRecord {
            entity: serde_json::from_value(row.get(0)).expect("invalid entity"),
            id: row.get(1),
            version: row.get(2),
            type_uri: VersionedUri::new(
                BaseUri::new(row.get(3)).expect("invalid BaseUri"),
                row.get::<_, i64>(4) as u32,
            ),
            account_id: row.get(5),
            is_latest: row.get(6),
        })
    })
}

pub async fn read_all_entities(client: &impl AsClient) -> Result<RecordStream, QueryError> {
    let row_stream = client
        .as_client()
        .query_raw(
            r#"
            SELECT properties, entity_id, entities.version, type_ids.base_uri, type_ids.version, owned_by_id, MAX(entities.version) OVER (PARTITION by entity_id) = entities.version as latest
            FROM entities
            INNER JOIN type_ids
            ON type_ids.version_id = entities.entity_type_version_id
            ORDER BY entity_id, entities.version DESC;
            "#,
            parameter_list([]),
        )
        .await
        .into_report()
        .change_context(QueryError)?;
    Ok(row_stream_to_record_stream(row_stream))
}

pub async fn read_latest_entity_by_id(
    client: &impl AsClient,
    entity_id: EntityId,
) -> Result<EntityRecord, QueryError> {
    let row = client
        .as_client()
        .query_one(
            r#"
            SELECT properties, entity_id, entities.version, type_ids.base_uri, type_ids.version, owned_by_id
            FROM entities
            INNER JOIN type_ids ON type_ids.version_id = entities.entity_type_version_id
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
        .change_context(QueryError)?;

    Ok(EntityRecord {
        entity: serde_json::from_value(row.get(0)).expect("invalid entity"),
        id: row.get(1),
        version: row.get(2),
        type_uri: VersionedUri::new(
            BaseUri::new(row.get(3)).expect("invalid BaseUri"),
            row.get::<_, i64>(4) as u32,
        ),
        account_id: row.get(5),
        is_latest: true,
    })
}
