use error_stack::{IntoReport, Result, ResultExt};
use futures::{Stream, StreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::uri::{BaseUri, VersionedUri};

use crate::{
    knowledge::{EntityId, Link, PersistedLink},
    ontology::AccountId,
    store::{postgres::parameter_list, AsClient, QueryError},
};

pub struct LinkRecord {
    pub link_type_id: VersionedUri,
    pub source_entity_id: EntityId,
    pub target_entity_id: EntityId,
    pub owned_by_id: AccountId,
    pub index: Option<i32>,
    pub created_by_id: AccountId,
}

impl From<LinkRecord> for PersistedLink {
    fn from(record: LinkRecord) -> Self {
        Self::new(
            Link::new(
                record.source_entity_id,
                record.target_entity_id,
                record.link_type_id,
                record.index,
            ),
            record.owned_by_id,
            record.created_by_id,
        )
    }
}

pub type RecordStream = impl Stream<Item = Result<LinkRecord, QueryError>>;

fn row_stream_to_record_stream(
    row_stream: RowStream,
) -> impl Stream<Item = Result<LinkRecord, QueryError>> {
    row_stream.map(|row_result| {
        let row = row_result.into_report().change_context(QueryError)?;

        Ok(LinkRecord {
            link_type_id: VersionedUri::new(
                BaseUri::new(row.get(0)).expect("invalid BaseUri"),
                row.get::<_, i64>(1) as u32,
            ),
            source_entity_id: row.get(2),
            target_entity_id: row.get(3),
            owned_by_id: row.get(4),
            created_by_id: row.get(5),
            index: row.get(6),
        })
    })
}

pub async fn read_all_links(client: &impl AsClient) -> Result<RecordStream, QueryError> {
    let row_stream = client
        .as_client()
        .query_raw(
            r#"
            SELECT base_uri, version, source_entity_id, target_entity_id, owned_by_id, created_by_id, link_index
            FROM links
            JOIN type_ids ON version_id = link_type_version_id
            -- Nulls will be last with default ascending order (default is ASC NULLS LAST)
            ORDER BY link_index ASC
            "#,
            parameter_list([]),
        )
        .await
        .into_report()
        .change_context(QueryError)?;
    Ok(row_stream_to_record_stream(row_stream))
}

pub async fn read_links_by_source(
    client: &impl AsClient,
    entity_id: EntityId,
) -> Result<RecordStream, QueryError> {
    let row_stream = client
        .as_client()
        .query_raw(
            r#"
            SELECT base_uri, version, source_entity_id, target_entity_id, owned_by_id, created_by_id, link_index
            FROM links
            JOIN type_ids ON version_id = link_type_version_id
            WHERE source_entity_id = $1
            -- Nulls will be last with default ascending order (default is ASC NULLS LAST)
            ORDER BY link_index ASC
            "#,
            parameter_list([&entity_id]),
        )
        .await
        .into_report()
        .change_context(QueryError)?;
    Ok(row_stream_to_record_stream(row_stream))
}

pub async fn read_links_by_target(
    client: &impl AsClient,
    entity_id: EntityId,
) -> Result<RecordStream, QueryError> {
    let row_stream = client
        .as_client()
        .query_raw(
            r#"
            SELECT base_uri, version, source_entity_id, target_entity_id, owned_by_id, created_by_id
            FROM links
            JOIN type_ids ON version_id = link_type_version_id
            WHERE target_entity_id = $1
            -- When reading links by target, the ordering becomes irrelevant, as the target could
            -- have a variety of link that are meaningless to sort by their index.
            "#,
            parameter_list([&entity_id]),
        )
        .await
        .into_report()
        .change_context(QueryError)?;
    Ok(row_stream_to_record_stream(row_stream))
}
