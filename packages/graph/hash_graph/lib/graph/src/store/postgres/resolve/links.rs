use error_stack::{IntoReport, Result, ResultExt};
use futures::{Stream, StreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::uri::{BaseUri, VersionedUri};

use crate::{
    knowledge::EntityId,
    ontology::AccountId,
    store::{postgres::parameter_list, AsClient, QueryError},
};

pub struct LinkRecord {
    pub type_uri: VersionedUri,
    pub source_entity_id: EntityId,
    pub target_entity_id: EntityId,
    pub account_id: AccountId,
    pub is_active: bool,
}

pub type RecordStream = impl Stream<Item = Result<LinkRecord, QueryError>>;

fn row_stream_to_record_stream(row_stream: RowStream) -> RecordStream {
    row_stream.map(|row_result| {
        let row = row_result.into_report().change_context(QueryError)?;

        Ok(LinkRecord {
            type_uri: VersionedUri::new(
                BaseUri::new(row.get(0)).expect("invalid BaseUri"),
                row.get::<_, i64>(1) as u32,
            ),
            source_entity_id: row.get(2),
            target_entity_id: row.get(3),
            account_id: row.get(4),
            is_active: row.get(5),
        })
    })
}

pub async fn read_all_active_links(client: &impl AsClient) -> Result<RecordStream, QueryError> {
    let row_stream = client
        .as_client()
        .query_raw(
            r#"
            SELECT base_uri, version, source_entity_id, target_entity_id, created_by, active
            FROM links
            JOIN ids ON version_id = link_type_version_id
            WHERE active
            "#,
            parameter_list([]),
        )
        .await
        .into_report()
        .change_context(QueryError)?;
    Ok(row_stream_to_record_stream(row_stream))
}
