pub mod account;
pub mod codec;
pub mod entity;

mod error;
mod metadata;
mod ontology;
mod restore;

use async_trait::async_trait;
use error_stack::{Context, IntoReport, Report, Result, ResultExt};
use futures::{stream, SinkExt, Stream, StreamExt, TryFutureExt, TryStreamExt};
use hash_status::StatusCode;
use serde::{Deserialize, Serialize};
use tokio_postgres::error::SqlState;
use type_system::{DataType, EntityType, PropertyType};

pub use self::{
    error::{SnapshotDumpError, SnapshotRestoreError},
    metadata::{BlockProtocolModuleVersions, CustomGlobalMetadata},
    ontology::{
        CustomOntologyMetadata, OntologyTemporalMetadata, OntologyTypeMetadata,
        OntologyTypeSnapshotRecord,
    },
};
pub use crate::snapshot::metadata::SnapshotMetadata;
use crate::{
    knowledge::Entity,
    snapshot::{entity::EntitySnapshotRecord, restore::SnapshotRecordBatch},
    store::{crud::Read, query::Filter, AsClient, InsertionError, PostgresStore},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SnapshotEntry {
    Snapshot(SnapshotMetadata),
    DataType(OntologyTypeSnapshotRecord<DataType>),
    PropertyType(OntologyTypeSnapshotRecord<PropertyType>),
    EntityType(OntologyTypeSnapshotRecord<EntityType>),
    Entity(EntitySnapshotRecord),
}

impl SnapshotEntry {
    pub fn install_error_stack_hook() {
        error_stack::Report::install_debug_hook::<Self>(|entry, context| match entry {
            Self::Snapshot(global_metadata) => {
                context.push_body(format!(
                    "graph version: {}",
                    global_metadata.block_protocol_module_versions.graph
                ));
            }
            Self::DataType(data_type) => {
                context.push_body(format!("data type: {}", data_type.metadata.record_id));
                if context.alternate() {
                    if let Ok(json) = serde_json::to_string_pretty(data_type) {
                        context.push_appendix(format!("{}:\n{json}", data_type.metadata.record_id));
                    }
                }
            }
            Self::PropertyType(property_type) => {
                context.push_body(format!(
                    "property type: {}",
                    property_type.metadata.record_id
                ));
                if context.alternate() {
                    if let Ok(json) = serde_json::to_string_pretty(property_type) {
                        context.push_appendix(format!(
                            "{}:\n{json}",
                            property_type.metadata.record_id
                        ));
                    }
                }
            }
            Self::EntityType(entity_type) => {
                context.push_body(format!("entity type: {}", entity_type.metadata.record_id));
                if context.alternate() {
                    if let Ok(json) = serde_json::to_string_pretty(entity_type) {
                        context
                            .push_appendix(format!("{}:\n{json}", entity_type.metadata.record_id));
                    }
                }
            }
            Self::Entity(entity) => {
                context.push_body(format!("entity: {}", entity.metadata.record_id.entity_id));
                if context.alternate() {
                    if let Ok(json) = serde_json::to_string_pretty(entity) {
                        context.push_appendix(format!(
                            "{}:\n{json}",
                            entity.metadata.record_id.entity_id
                        ));
                    }
                }
            }
        });
    }
}

#[async_trait]
trait WriteBatch<C> {
    async fn begin(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError>;
    async fn write(&self, postgres_client: &PostgresStore<C>) -> Result<(), InsertionError>;
    async fn commit(postgres_client: &PostgresStore<C>) -> Result<(), InsertionError>;
}

pub struct SnapshotStore<C>(PostgresStore<C>);

impl<C> SnapshotStore<C> {
    pub const fn new(store: PostgresStore<C>) -> Self {
        Self(store)
    }
}

impl<C: AsClient> SnapshotStore<C> {
    /// Convenience function to create a stream of snapshot entries.
    async fn create_dump_stream<T>(
        &self,
    ) -> Result<impl Stream<Item = Result<T, SnapshotDumpError>> + Send, SnapshotDumpError>
    where
        PostgresStore<C>: Read<T>,
    {
        Ok(Read::<T>::read(&self.0, &Filter::All(vec![]), None)
            .await
            .map_err(|future_error| future_error.change_context(SnapshotDumpError::Query))?
            .map_err(|stream_error| stream_error.change_context(SnapshotDumpError::Read)))
    }

    /// Reads the snapshot from the store into the given sink.
    ///
    /// The sink is expected to be a `futures::Sink` that can be used to write the snapshot entries
    /// into.
    ///
    /// # Errors
    ///
    /// - If reading a record from the datastore fails
    /// - If writing a record into the sink fails
    pub fn dump_snapshot(
        &self,
    ) -> impl Stream<Item = Result<SnapshotEntry, SnapshotDumpError>> + '_ {
        // TODO: Postgres does not allow to have multiple queries open at the same time. This means
        //       that each stream needs to be fully processed before the next one can be created.
        //       We might want to work around this by using a single stream that yields all the
        //       entries or even use multiple connections to the database.
        //   see https://app.asana.com/0/0/1204347352251098/f

        stream::once(async {
            SnapshotEntry::Snapshot(SnapshotMetadata {
                block_protocol_module_versions: BlockProtocolModuleVersions {
                    graph: semver::Version::new(0, 3, 0),
                },
                custom: CustomGlobalMetadata,
            })
        })
        .map(Ok)
        .chain(
            self.create_dump_stream::<OntologyTypeSnapshotRecord<DataType>>()
                .try_flatten_stream()
                .map_ok(SnapshotEntry::DataType),
        )
        .chain(
            self.create_dump_stream::<OntologyTypeSnapshotRecord<PropertyType>>()
                .try_flatten_stream()
                .map_ok(SnapshotEntry::PropertyType),
        )
        .chain(
            self.create_dump_stream::<OntologyTypeSnapshotRecord<EntityType>>()
                .try_flatten_stream()
                .map_ok(SnapshotEntry::EntityType),
        )
        .chain(
            self.create_dump_stream::<Entity>()
                .try_flatten_stream()
                .map_ok(|entity| SnapshotEntry::Entity(entity.into())),
        )
    }

    /// Reads the snapshot from from the stream into the store.
    ///
    /// The data emitted by the stream is read in a separate thread and is sent to different
    /// channels for each record type. Each channel holds a buffer of `chunk_size` entries. The
    /// receivers of the channels are then used to insert the records into the store. When a write
    /// operation to the store succeeds, the next entry is read from the channel, even if the
    /// buffer of the channel is not full yet. This ensures, that the store is continuously writing
    /// to the database and does not wait for the buffer to be full.
    ///
    /// Writing to the store happens in three stages:
    ///   1. The first stage is the `begin` stage. This stage is executed before any records are
    ///      read from the stream. It is used to create a transaction, so a possible rollback is
    ///      possible. For each data, which is inserted, a temporary table is created. This table
    ///      is used to insert the data into the store without locking the store and avoiding
    ///      yet unfulfilled foreign key constraints.
    ///   2. The second stage is the `write` stage. This stage is executed for each record type. It
    ///      reads the batch of records from the channels and inserts them into the temporary
    ///      tables, which were created above.
    ///   3. The third stage is the `commit` stage. This stage is executed after all records have
    ///      been read from the stream. It is used to insert the data from the temporary tables
    ///      into the store and to drop the temporary tables. As foreign key constraints are now
    ///      enabled, this stage might fail. In this case, the transaction is rolled back and the
    ///      error is returned.
    ///
    /// If the input stream contains an `Err` value, the snapshot restore is aborted and the error
    /// is returned.
    ///
    /// # Errors
    ///
    /// - If reading a record from the provided stream fails
    /// - If writing a record into the datastore fails
    pub async fn restore_snapshot(
        &mut self,
        snapshot: impl Stream<Item = Result<SnapshotEntry, impl Context>> + Send + 'static,
        chunk_size: usize,
    ) -> Result<(), SnapshotRestoreError> {
        tracing::info!("snapshot restore started");

        let (snapshot_record_tx, snapshot_record_rx) = restore::channel(chunk_size);

        let read_thread = tokio::spawn(
            snapshot
                .map_err(|report| report.change_context(SnapshotRestoreError::Read))
                .forward(
                    snapshot_record_tx
                        .sink_map_err(|report| report.change_context(SnapshotRestoreError::Buffer)),
                ),
        );

        let client = self
            .0
            .transaction()
            .await
            .change_context(SnapshotRestoreError::Write)?;

        SnapshotRecordBatch::begin(&client)
            .await
            .change_context(SnapshotRestoreError::Write)?;

        let client = snapshot_record_rx
            .map(Ok::<_, Report<SnapshotRestoreError>>)
            .try_fold(client, |client, records: SnapshotRecordBatch| async move {
                records
                    .write(&client)
                    .await
                    .change_context(SnapshotRestoreError::Write)?;
                Ok(client)
            })
            .await?;

        tracing::info!("snapshot reading finished, committing...");

        SnapshotRecordBatch::commit(&client)
            .await
            .change_context(SnapshotRestoreError::Write)
            .map_err(|report| {
                if let Some(error) = report
                    .downcast_ref()
                    .and_then(tokio_postgres::Error::as_db_error)
                {
                    match *error.code() {
                        SqlState::FOREIGN_KEY_VIOLATION => {
                            report.attach_printable(StatusCode::NotFound)
                        }
                        SqlState::UNIQUE_VIOLATION => {
                            report.attach_printable(StatusCode::AlreadyExists)
                        }
                        _ => report,
                    }
                } else {
                    report
                }
            })?;

        client
            .commit()
            .await
            .change_context(SnapshotRestoreError::Write)
            .attach_printable("unable to commit snapshot to the store")?;

        read_thread
            .await
            .into_report()
            .change_context(SnapshotRestoreError::Read)??;

        tracing::info!("snapshot restore finished");

        Ok(())
    }
}
