pub mod codec;
pub mod entity;
pub mod owner;

mod error;
mod metadata;
mod ontology;
mod restore;

use std::future::ready;

use async_scoped::TokioScope;
use async_trait::async_trait;
use error_stack::{ensure, Context, Report, Result, ResultExt};
use futures::{
    channel::mpsc, stream, Sink, SinkExt, Stream, StreamExt, TryFutureExt, TryStreamExt,
};
use graph_types::{
    account::{AccountGroupId, AccountId},
    knowledge::entity::Entity,
};
use hash_status::StatusCode;
use postgres_types::ToSql;
use serde::{Deserialize, Serialize};
use tokio_postgres::{
    error::SqlState,
    tls::{MakeTlsConnect, TlsConnect},
    Socket,
};
use type_system::{DataType, EntityType, PropertyType};

pub use self::{
    error::{SnapshotDumpError, SnapshotRestoreError},
    metadata::{BlockProtocolModuleVersions, CustomGlobalMetadata},
    ontology::OntologyTypeSnapshotRecord,
};
pub use crate::snapshot::metadata::SnapshotMetadata;
use crate::{
    snapshot::{entity::EntitySnapshotRecord, restore::SnapshotRecordBatch},
    store::{
        crud::Read, query::Filter, AsClient, InsertionError, PostgresStore, PostgresStorePool,
        StorePool,
    },
};

#[derive(Debug, Serialize, Deserialize)]
pub struct Account {
    id: AccountId,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountGroup {
    id: AccountGroupId,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SnapshotEntry {
    Snapshot(SnapshotMetadata),
    Account(Account),
    AccountGroup(AccountGroup),
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
            Self::Account(account) => {
                context.push_body(format!("account: {}", account.id));
            }
            Self::AccountGroup(account_group) => {
                context.push_body(format!("account group: {}", account_group.id));
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

impl<Tls: Clone + Send + Sync + 'static> PostgresStorePool<Tls>
where
    Tls: MakeTlsConnect<
            Socket,
            Stream: Send + Sync,
            TlsConnect: Send + TlsConnect<Socket, Future: Send>,
        >,
{
    async fn read_accounts(
        &self,
    ) -> Result<impl Stream<Item = Result<Account, SnapshotDumpError>> + Send, SnapshotDumpError>
    {
        // TODO: Make accounts a first-class `Record` type
        //   see https://linear.app/hash/issue/H-752
        Ok(self
            .acquire()
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "SELECT account_id FROM accounts",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Query))?
            .map_ok(|row| Account { id: row.get(0) })
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read)))
    }

    async fn read_account_groups(
        &self,
    ) -> Result<impl Stream<Item = Result<AccountGroup, SnapshotDumpError>> + Send, SnapshotDumpError>
    {
        // TODO: Make account groups a first-class `Record` type
        //   see https://linear.app/hash/issue/H-752
        Ok(self
            .acquire()
            .await
            .change_context(SnapshotDumpError::Query)?
            .as_client()
            .query_raw(
                "SELECT account_group_id FROM account_groups",
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Query))?
            .map_ok(|row| AccountGroup { id: row.get(0) })
            .map_err(|error| Report::new(error).change_context(SnapshotDumpError::Read)))
    }

    /// Convenience function to create a stream of snapshot entries.
    async fn create_dump_stream<'pool, T>(
        &'pool self,
    ) -> Result<impl Stream<Item = Result<T, SnapshotDumpError>> + Send + 'pool, SnapshotDumpError>
    where
        <Self as StorePool>::Store<'pool>: Read<T>,
        T: 'pool,
    {
        Ok(Read::<T>::read(
            &self
                .acquire()
                .await
                .change_context(SnapshotDumpError::Query)?,
            &Filter::All(vec![]),
            None,
        )
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
        sink: impl Sink<SnapshotEntry, Error = Report<impl Context>> + Send + 'static,
        chunk_size: usize,
    ) -> Result<(), SnapshotDumpError> {
        let (snapshot_record_tx, snapshot_record_rx) = mpsc::channel(chunk_size);
        let snapshot_record_tx = snapshot_record_tx
            .sink_map_err(|error| Report::new(error).change_context(SnapshotDumpError::Write));

        let ((), results) = TokioScope::scope_and_block(|scope| {
            scope.spawn(snapshot_record_rx.map(Ok).forward(
                sink.sink_map_err(|report| report.change_context(SnapshotDumpError::Write)),
            ));

            scope.spawn(
                stream::once(ready(Ok(SnapshotEntry::Snapshot(SnapshotMetadata {
                    block_protocol_module_versions: BlockProtocolModuleVersions {
                        graph: semver::Version::new(0, 3, 0),
                    },
                    custom: CustomGlobalMetadata,
                }))))
                .forward(snapshot_record_tx.clone()),
            );

            scope.spawn(
                self.read_accounts()
                    .try_flatten_stream()
                    .map_ok(SnapshotEntry::Account)
                    .forward(snapshot_record_tx.clone()),
            );

            scope.spawn(
                self.read_account_groups()
                    .try_flatten_stream()
                    .map_ok(SnapshotEntry::AccountGroup)
                    .forward(snapshot_record_tx.clone()),
            );

            scope.spawn(
                self.create_dump_stream::<OntologyTypeSnapshotRecord<DataType>>()
                    .try_flatten_stream()
                    .map_ok(SnapshotEntry::DataType)
                    .forward(snapshot_record_tx.clone()),
            );

            scope.spawn(
                self.create_dump_stream::<OntologyTypeSnapshotRecord<PropertyType>>()
                    .try_flatten_stream()
                    .map_ok(SnapshotEntry::PropertyType)
                    .forward(snapshot_record_tx.clone()),
            );

            scope.spawn(
                self.create_dump_stream::<OntologyTypeSnapshotRecord<EntityType>>()
                    .try_flatten_stream()
                    .map_ok(SnapshotEntry::EntityType)
                    .forward(snapshot_record_tx.clone()),
            );

            scope.spawn(
                self.create_dump_stream::<Entity>()
                    .try_flatten_stream()
                    .map_ok(|entity| SnapshotEntry::Entity(entity.into()))
                    .forward(snapshot_record_tx),
            );
        });

        for result in results {
            result.change_context(SnapshotDumpError::Read)??;
        }

        Ok(())
    }
}

impl<C: AsClient> SnapshotStore<C> {
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
    ///      possible. For each data, which is inserted, a temporary table is created. This table is
    ///      used to insert the data into the store without locking the store and avoiding yet
    ///      unfulfilled foreign key constraints.
    ///   2. The second stage is the `write` stage. This stage is executed for each record type. It
    ///      reads the batch of records from the channels and inserts them into the temporary
    ///      tables, which were created above.
    ///   3. The third stage is the `commit` stage. This stage is executed after all records have
    ///      been read from the stream. It is used to insert the data from the temporary tables into
    ///      the store and to drop the temporary tables. As foreign key constraints are now enabled,
    ///      this stage might fail. In this case, the transaction is rolled back and the error is
    ///      returned.
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

        let (snapshot_record_tx, snapshot_record_rx, metadata_rx) = restore::channel(chunk_size);

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
            .change_context(SnapshotRestoreError::Read)??;

        let mut found_metadata = false;
        for metadata in metadata_rx.collect::<Vec<SnapshotMetadata>>().await {
            if found_metadata {
                tracing::warn!("found more than one metadata record in the snapshot");
            }
            found_metadata = true;

            ensure!(
                metadata.block_protocol_module_versions.graph == semver::Version::new(0, 3, 0),
                SnapshotRestoreError::Unsupported
            );
        }

        ensure!(found_metadata, SnapshotRestoreError::MissingMetadata);

        tracing::info!("snapshot restore finished");

        Ok(())
    }
}
