//! Stores and recovers one journal per shard using local files or S3.
//!
//! [`crate::runtime`] manages this layer for application domains. For custom runtimes, open an
//! [`OpenedShard`], recover its state, then enable commands on the [`RecoveredShard`]. Verify
//! ownership before enabling the writer. Opening a replacement writer invalidates the old one.
//!
//! [`ShardCommandHandle`] serializes submissions and applies each record after it is durable.
//! Keep the [`ShardOwner`] until shutdown. Dropping it stops the shard.
//! [`AppendFailureKind`] distinguishes safe retries from writes that require recovery.
//! Use [`read_journal`] to inspect stored events without acquiring a writer.
use alloc::sync::Arc;
use core::{num::NonZeroU64, ops::Bound, time::Duration};
use std::path::PathBuf;

use bytes::Bytes;
use error_stack::{Report, ResultExt as _};
use opendata_common::{
    StorageConfig,
    storage::config::{
        AwsObjectStoreConfig, BlockCacheConfig, FoyerMemoryCacheConfig, LocalObjectStoreConfig,
        ObjectStoreConfig, SlateDbStorageConfig,
    },
};
use opendata_log::{
    Config, LogDb, LogDbReader, LogRead, ReadVisibility, ReaderConfig, Record, Sequence,
};

use crate::{
    DurableError,
    registry::{DurableRecord, RecordRegistry, UntrimmedJournalRecord},
    routing::Shard,
};

mod command_loop;

#[cfg(any(test, feature = "test-util"))]
pub use command_loop::start_recovered;
pub use command_loop::{
    ControlResolution, OpenedShard, RecoveredShard, ShardCommandConfig, ShardCommandError,
    ShardCommandErrorKind, ShardCommandHandle, ShardCommandOutcome, ShardOwner, StartedShard,
    StartupRecovery, StateChangeFeed,
};
#[cfg(any(test, feature = "test-util"))]
pub use command_loop::{TestHarness, TestHold};

const EVENTS_KEY: &[u8] = b"events";
const PROJECTION_SNAPSHOTS_KEY: &[u8] = b"projection-snapshots";
const APPEND_TIMEOUT: Duration = Duration::from_secs(30);
const DURABILITY_TIMEOUT: Duration = Duration::from_secs(60);
/// Retries a stalled durability subscription before reporting an uncertain append result. A
/// leased shard stops on that result and must reacquire its lease.
const DURABILITY_WAIT_ATTEMPTS: u32 = 3;
const PINNED_FENCE_MESSAGE: &str = "detected newer db client";

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
/// Determines whether an append can be retried or its writer must be replaced.
pub enum AppendFailureKind {
    /// Storage was not changed. Retrying the append is safe.
    #[display("record was not committed")]
    DefinitelyNotCommitted,
    /// The record may be stored. Recover before deciding whether to retry it.
    #[display("record commit status is unknown")]
    CommitUnknown,
    /// A replacement writer owns the journal. This writer must stop.
    #[display("writer no longer owns the journal")]
    Fenced,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("shard append failed: {kind}")]
/// Classifies an append failure returned in an [`error_stack::Report`].
pub struct ShardAppendError {
    pub kind: AppendFailureKind,
}

/// Invalid storage options or a failure to create the local storage directory.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum StorageConfigError {
    #[display("unsupported shard-log blob URL {url:?}")]
    UnsupportedUrl { url: String },
    #[display("blob URL has an empty S3 bucket")]
    EmptyS3Bucket,
    #[display("S3 bucket {bucket:?} requires an AWS region")]
    MissingAwsRegion { bucket: String },
    #[display("could not create local storage directory {}", path.display())]
    CreateLocalDirectory { path: PathBuf },
}

/// A journal open failure. The report retains the storage or timeout error.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum ShardLogOpenError {
    #[display("could not open writer for shard {}", shard.get())]
    Writer { shard: Shard },
    #[display("opening writer for shard {} timed out after {timeout:?}", shard.get())]
    WriterTimeout { shard: Shard, timeout: Duration },
    #[display("could not open reader for shard {}", shard.get())]
    Reader { shard: Shard },
    #[display("opening reader for shard {} timed out after {timeout:?}", shard.get())]
    ReaderTimeout { shard: Shard, timeout: Duration },
}

#[derive(Debug, Clone)]
/// A journal's storage configuration and shared record registry.
///
/// Share one registry across locations that must agree on record names and codecs.
pub struct ShardLogLocation {
    shard: crate::routing::Shard,
    source: LogSource,
    read_timeout: Duration,
    durability_timeout: Duration,
    registry: Arc<RecordRegistry>,
}

/// Selects object storage or an in-memory test journal.
#[derive(Debug, Clone)]
#[cfg_attr(
    any(test, feature = "test-util"),
    expect(
        clippy::large_enum_variant,
        reason = "the production storage variant is inline; the simulation handle exists only for \
                  tests"
    )
)]
enum LogSource {
    Storage(StorageConfig),
    #[cfg(any(test, feature = "test-util"))]
    Sim(crate::sim::SimLogHandle),
}

impl LogSource {
    #[cfg_attr(
        not(any(test, feature = "test-util")),
        expect(
            clippy::missing_const_for_fn,
            clippy::unnecessary_wraps,
            reason = "simulation storage access constructs an error through this shared interface"
        )
    )]
    fn storage(&self) -> Result<&StorageConfig, Report<DurableError>> {
        match self {
            Self::Storage(storage) => Ok(storage),
            #[cfg(any(test, feature = "test-util"))]
            Self::Sim(_handle) => Err(Report::new(DurableError)
                .attach("a simulated shard log has no storage configuration")),
        }
    }
}

impl ShardLogLocation {
    /// A shard log at an explicit storage configuration.
    ///
    /// `read_timeout` bounds read-only opens. `durability_timeout` bounds writer opens, closes, and
    /// each wait for an append to become durable.
    #[must_use]
    pub const fn new(
        shard: crate::routing::Shard,
        storage: StorageConfig,
        read_timeout: Duration,
        durability_timeout: Duration,
        registry: Arc<RecordRegistry>,
    ) -> Self {
        Self {
            shard,
            source: LogSource::Storage(storage),
            read_timeout,
            durability_timeout,
            registry,
        }
    }

    /// A shard log served by the deterministic-simulation journal. Reads,
    /// appends, and recovery use the scheduled append outcomes.
    #[cfg(any(test, feature = "test-util"))]
    #[must_use]
    pub const fn simulated(
        shard: crate::routing::Shard,
        journal: crate::sim::SimLogHandle,
        registry: Arc<RecordRegistry>,
    ) -> Self {
        Self {
            shard,
            source: LogSource::Sim(journal),
            registry,
            read_timeout: DURABILITY_TIMEOUT,
            durability_timeout: DURABILITY_TIMEOUT,
        }
    }

    /// Builds a shard location from explicit storage options.
    ///
    /// # Errors
    ///
    /// Returns an error if the storage options are invalid or local directory creation fails.
    pub fn for_kernel(
        shard: crate::routing::Shard,
        log_path: &str,
        options: &LogStorageOptions,
        registry: Arc<RecordRegistry>,
    ) -> Result<Self, Report<StorageConfigError>> {
        Ok(Self {
            shard,
            read_timeout: DURABILITY_TIMEOUT,
            durability_timeout: DURABILITY_TIMEOUT,
            source: LogSource::Storage(storage_for_path(options, log_path)?),
            registry,
        })
    }

    #[cfg(any(test, feature = "test-util"))]
    #[must_use]
    pub fn disposable_local(
        shard: crate::routing::Shard,
        log_path: &str,
        object_store_root: &std::path::Path,
        registry: Arc<RecordRegistry>,
    ) -> Self {
        use opendata_common::storage::config::{
            LocalObjectStoreConfig, ObjectStoreConfig, SlateDbStorageConfig,
        };

        Self {
            shard,
            registry,
            read_timeout: DURABILITY_TIMEOUT,
            durability_timeout: DURABILITY_TIMEOUT,
            source: LogSource::Storage(StorageConfig::SlateDb(SlateDbStorageConfig {
                path: log_path.to_owned(),
                object_store: ObjectStoreConfig::Local(LocalObjectStoreConfig {
                    path: object_store_root.display().to_string(),
                }),
                settings_path: None,
                block_cache: None,
                meta_cache: None,
            })),
        }
    }
}

/// Storage location and cache budgets shared by the owned shards.
#[derive(Debug, Clone)]
pub struct LogStorageOptions {
    pub blob_url: String,
    pub aws_region: Option<String>,
    /// Number of shards sharing the cache budgets.
    pub shard_capacity: NonZeroU64,
    pub block_cache_bytes: u64,
    pub meta_cache_bytes: u64,
}

/// # Errors
///
/// Returns an error for an unsupported URL, an empty S3 bucket, a missing AWS region, or failed
/// directory creation.
pub fn storage_for_path(
    options: &LogStorageOptions,
    control_path: &str,
) -> Result<StorageConfig, Report<StorageConfigError>> {
    let url = &options.blob_url;
    let (object_store, prefix) = if let Some(path) = url.strip_prefix("file://") {
        std::fs::create_dir_all(path).change_context_lazy(|| {
            StorageConfigError::CreateLocalDirectory {
                path: PathBuf::from(path),
            }
        })?;
        (
            ObjectStoreConfig::Local(LocalObjectStoreConfig {
                path: path.to_owned(),
            }),
            String::new(),
        )
    } else if let Some(value) = url.strip_prefix("s3://") {
        let (bucket, prefix) = value.split_once('/').unwrap_or((value, ""));
        if bucket.is_empty() {
            return Err(Report::new(StorageConfigError::EmptyS3Bucket));
        }
        let Some(region) = options.aws_region.clone() else {
            return Err(Report::new(StorageConfigError::MissingAwsRegion {
                bucket: bucket.to_owned(),
            }));
        };
        (
            ObjectStoreConfig::Aws(AwsObjectStoreConfig {
                region,
                bucket: bucket.to_owned(),
            }),
            prefix.trim_matches('/').to_owned(),
        )
    } else {
        return Err(Report::new(StorageConfigError::UnsupportedUrl {
            url: url.clone(),
        }));
    };
    let path = if prefix.is_empty() {
        control_path.to_owned()
    } else {
        format!("{prefix}/{control_path}")
    };
    let block_cache_capacity = options
        .block_cache_bytes
        .div_euclid(options.shard_capacity.get())
        .max(64 * 1024);
    let meta_cache_capacity = options
        .meta_cache_bytes
        .div_euclid(options.shard_capacity.get())
        .max(64 * 1024);
    Ok(StorageConfig::SlateDb(SlateDbStorageConfig {
        path,
        object_store,
        settings_path: None,
        block_cache: Some(BlockCacheConfig::FoyerMemory(FoyerMemoryCacheConfig {
            capacity: block_cache_capacity,
            shards: None,
        })),
        meta_cache: Some(BlockCacheConfig::FoyerMemory(FoyerMemoryCacheConfig {
            capacity: meta_cache_capacity,
            shards: None,
        })),
    }))
}

/// Reads a shard’s complete journal without acquiring a writer or changing its epoch.
///
/// # Errors
///
/// Returns an error if opening, scanning, decoding, or sequence validation fails.
pub async fn read_journal<T: UntrimmedJournalRecord>(
    location: &ShardLogLocation,
) -> Result<Vec<(u64, T)>, Report<DurableError>> {
    location
        .registry
        .register(T::declaration())
        .change_context(DurableError)
        .attach("register journal record declaration")?;
    #[cfg(any(test, feature = "test-util"))]
    if let LogSource::Sim(journal) = &location.source {
        return decode_sim_entries(journal.durable_entries(crate::sim::SimKey::Events));
    }
    let reader = location.open_reader().await.change_context(DurableError)?;
    let result = scan_records(&reader, (Bound::Unbounded, Bound::Unbounded), None).await;
    reader.close().await;
    result
}

impl ShardLogLocation {
    #[must_use]
    pub const fn shard(&self) -> crate::routing::Shard {
        self.shard
    }

    async fn open_reader(&self) -> Result<LogDbReader, Report<ShardLogOpenError>> {
        let storage = self
            .source
            .storage()
            .change_context(ShardLogOpenError::Reader { shard: self.shard })?;
        tokio::time::timeout(
            self.read_timeout,
            LogDbReader::open(ReaderConfig {
                storage: storage.clone(),
                ..ReaderConfig::default()
            }),
        )
        .await
        .change_context(ShardLogOpenError::ReaderTimeout {
            shard: self.shard,
            timeout: self.read_timeout,
        })?
        .change_context(ShardLogOpenError::Reader { shard: self.shard })
    }
}

/// Owns the writer for one shard.
struct ShardLogWriter {
    backend: WriterBackend,
    durability_timeout: Duration,
    registry: Arc<RecordRegistry>,
}

enum WriterBackend {
    Real(LogDb),
    #[cfg(any(test, feature = "test-util"))]
    Sim(crate::sim::SimWriter),
}

/// Decodes simulated journal entries with the record type’s codec.
#[cfg(any(test, feature = "test-util"))]
fn decode_sim_entries<T: DurableRecord>(
    entries: Vec<(u64, Bytes)>,
) -> Result<Vec<(u64, T)>, Report<DurableError>> {
    entries
        .into_iter()
        .map(|(sequence, bytes)| {
            T::decode(&bytes)
                .map(|record| (sequence, record))
                .change_context(DurableError)
                .attach(format!(
                    "decode simulated shard sequence {sequence} as {}",
                    T::declaration().name
                ))
        })
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppendFault {
    None,
    #[cfg(any(test, feature = "test-util"))]
    DefinitelyNotCommitted,
    #[cfg(any(test, feature = "test-util"))]
    AfterInvocation,
    #[cfg(any(test, feature = "test-util"))]
    AfterAppend,
    #[cfg(any(test, feature = "test-util"))]
    AfterFlush,
    #[cfg(any(test, feature = "test-util"))]
    WrongSequence,
}

impl ShardLogWriter {
    async fn open(location: &ShardLogLocation) -> Result<Self, Report<ShardLogOpenError>> {
        let durability_timeout = location.durability_timeout;
        #[cfg(any(test, feature = "test-util"))]
        if let LogSource::Sim(journal) = &location.source {
            return Ok(Self {
                backend: WriterBackend::Sim(journal.open_writer()),
                durability_timeout,
                registry: Arc::clone(&location.registry),
            });
        }
        let storage = location
            .source
            .storage()
            .change_context(ShardLogOpenError::Writer {
                shard: location.shard,
            })?;
        let log = tokio::time::timeout(
            durability_timeout,
            LogDb::open(Config {
                storage: storage.clone(),
                read_visibility: ReadVisibility::Remote,
                // Larger blocks reduce S3 range requests during sequential replay.
                sst_block_size: Some(slatedb::SstBlockSize::Block64Kib),
                ..Config::default()
            }),
        )
        .await
        .change_context(ShardLogOpenError::WriterTimeout {
            shard: location.shard,
            timeout: durability_timeout,
        })?
        .change_context(ShardLogOpenError::Writer {
            shard: location.shard,
        })?;
        Ok(Self {
            backend: WriterBackend::Real(log),
            durability_timeout,
            registry: Arc::clone(&location.registry),
        })
    }

    async fn append<T: UntrimmedJournalRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<u64, Report<ShardAppendError>> {
        self.append_with_fault(value, AppendFault::None).await
    }

    /// Exclusive end of durable records captured from the writer opened with
    /// `ReadVisibility::Remote`. Records below this exclusive end are the
    /// complete startup-recovery window.
    fn durable_end_exclusive(&self) -> u64 {
        match &self.backend {
            WriterBackend::Real(log) => log.durable_sequence(),
            #[cfg(any(test, feature = "test-util"))]
            WriterBackend::Sim(writer) => writer.durable_end_exclusive(),
        }
    }

    async fn scan_suffix<T: UntrimmedJournalRecord>(
        &self,
        through_log_sequence: Option<u64>,
        durable_end_exclusive: u64,
    ) -> Result<Vec<(u64, T)>, Report<DurableError>> {
        self.registry
            .register(T::declaration())
            .change_context(DurableError)
            .attach("register journal record declaration")?;
        let range = recovery_range(through_log_sequence, durable_end_exclusive)?;
        match &self.backend {
            WriterBackend::Real(log) => scan_records(log, range.bounds, Some(range.window)).await,
            #[cfg(any(test, feature = "test-util"))]
            WriterBackend::Sim(writer) => decode_sim_entries(writer.scan(
                crate::sim::SimKey::Events,
                range.window.0,
                range.window.1,
            )),
        }
    }

    async fn scan_projection_snapshots<T: DurableRecord>(
        &self,
        durable_end_exclusive: u64,
    ) -> Result<Vec<(u64, Result<T, Report<crate::registry::CompatError>>)>, Report<DurableError>>
    {
        self.registry
            .register(T::declaration())
            .change_context(DurableError)
            .attach("register snapshot record declaration")?;
        match &self.backend {
            WriterBackend::Real(log) => {
                scan_snapshot_records(
                    log,
                    (Bound::Unbounded, Bound::Excluded(durable_end_exclusive)),
                    durable_end_exclusive,
                )
                .await
            }
            #[cfg(any(test, feature = "test-util"))]
            WriterBackend::Sim(writer) => Ok(writer
                .scan(crate::sim::SimKey::Snapshots, 0, durable_end_exclusive)
                .into_iter()
                .map(|(sequence, bytes)| (sequence, T::decode(&bytes)))
                .collect()),
        }
    }

    async fn append_with_fault<T: UntrimmedJournalRecord + Sync>(
        &self,
        value: &T,
        fault: AppendFault,
    ) -> Result<u64, Report<ShardAppendError>> {
        self.append_registered(EVENTS_KEY, value, fault).await
    }

    async fn append_registered<T: DurableRecord + Sync>(
        &self,
        key: &'static [u8],
        value: &T,
        fault: AppendFault,
    ) -> Result<u64, Report<ShardAppendError>> {
        self.registry
            .require::<T>()
            .change_context(ShardAppendError {
                kind: AppendFailureKind::DefinitelyNotCommitted,
            })
            .attach("validate durable-record registration")?;
        let bytes = value
            .encode()
            .change_context(ShardAppendError {
                kind: AppendFailureKind::DefinitelyNotCommitted,
            })
            .attach("encode durable shard record")?;
        self.append_encoded(key, Bytes::from(bytes), fault).await
    }

    async fn append_encoded(
        &self,
        key: &'static [u8],
        bytes: Bytes,
        fault: AppendFault,
    ) -> Result<u64, Report<ShardAppendError>> {
        match &self.backend {
            WriterBackend::Real(log) => {
                let record = Record {
                    key: Bytes::from_static(key),
                    value: bytes,
                };
                let _: AppendFault = fault;

                #[cfg(any(test, feature = "test-util"))]
                if fault == AppendFault::DefinitelyNotCommitted {
                    return Err(definitely_not_committed_message(
                        "append shard record",
                        "injected pre-invocation failure",
                    ));
                }

                // After invoking append, an error can leave the commit status unknown. A
                // writer-fenced response is terminal. Other errors require recovery.
                #[cfg(any(test, feature = "test-util"))]
                if fault == AppendFault::AfterInvocation {
                    return Err(post_invocation_message(
                        "append shard record",
                        "injected append-return failure",
                    ));
                }
                let output = log
                    .append_timeout(vec![record], APPEND_TIMEOUT)
                    .await
                    .map_err(|error| post_invocation_source("append shard record", error))?;
                #[cfg(any(test, feature = "test-util"))]
                if fault == AppendFault::AfterAppend {
                    return Err(post_invocation_message(
                        "append shard record",
                        "injected post-append failure",
                    ));
                }
                flush_with_timeout(log.flush(), self.durability_timeout).await?;
                #[cfg(any(test, feature = "test-util"))]
                if fault == AppendFault::AfterFlush {
                    let report = Report::new(DurableError).attach("injected post-flush failure");
                    return Err(post_invocation_report(
                        "wait for durable shard record",
                        report,
                    ));
                }
                wait_until_durable_with(
                    log,
                    output.start_sequence + 1,
                    self.durability_timeout,
                    DURABILITY_WAIT_ATTEMPTS,
                )
                .await
                .map_err(|report| {
                    post_invocation_report("wait for durable shard record", report)
                })?;
                #[cfg(any(test, feature = "test-util"))]
                if fault == AppendFault::WrongSequence {
                    return Ok(output.start_sequence.saturating_sub(1));
                }
                Ok(output.start_sequence)
            }
            #[cfg(any(test, feature = "test-util"))]
            WriterBackend::Sim(writer) => {
                let sim_key = if key == EVENTS_KEY {
                    crate::sim::SimKey::Events
                } else {
                    crate::sim::SimKey::Snapshots
                };
                match writer.append(sim_key, bytes.to_vec()) {
                    crate::sim::SimAppendResult::Acked(sequence) => Ok(sequence),
                    crate::sim::SimAppendResult::DefinitelyNotCommitted => {
                        Err(definitely_not_committed_message(
                            "append shard record",
                            "simulated pre-invocation failure",
                        ))
                    }
                    crate::sim::SimAppendResult::CommitUnknown => Err(post_invocation_message(
                        "append shard record",
                        "simulated append with unknown commit status",
                    )),
                    crate::sim::SimAppendResult::Fenced => Err(Report::new(ShardAppendError {
                        kind: AppendFailureKind::Fenced,
                    })
                    .attach("simulated newer writer epoch")),
                }
            }
        }
    }

    #[cfg(test)]
    fn raw_log(&self) -> &LogDb {
        match &self.backend {
            WriterBackend::Real(log) => log,
            WriterBackend::Sim(_writer) => panic!("a real log should be configured for this test"),
        }
    }

    async fn close(self) -> Result<(), Report<DurableError>> {
        let durability_timeout = self.durability_timeout;
        match self.backend {
            WriterBackend::Real(log) => tokio::time::timeout(durability_timeout, log.close())
                .await
                .change_context(DurableError)
                .attach(format!(
                    "close shard log timed out after {durability_timeout:?}"
                ))?
                .change_context(DurableError)
                .attach("close shard log"),
            #[cfg(any(test, feature = "test-util"))]
            WriterBackend::Sim(_writer) => Ok(()),
        }
    }
}

/// Reads journal records without acquiring a writer. Production recovery uses the active
/// writer’s view of the log.
#[cfg(any(test, feature = "test-util"))]
pub struct ShardLogRecovery {
    reader: LogDbReader,
    registry: Arc<RecordRegistry>,
}

#[cfg(any(test, feature = "test-util"))]
impl ShardLogRecovery {
    /// # Errors
    ///
    /// Returns an error when the shard storage cannot be opened before its timeout.
    pub async fn open(location: &ShardLogLocation) -> Result<Self, Report<ShardLogOpenError>> {
        Ok(Self {
            reader: location.open_reader().await?,
            registry: Arc::clone(&location.registry),
        })
    }

    /// # Errors
    ///
    /// Returns an error when journal scanning, decoding, or sequence validation fails.
    pub async fn scan<T: UntrimmedJournalRecord>(
        &self,
    ) -> Result<Vec<(u64, T)>, Report<DurableError>> {
        self.registry
            .register(T::declaration())
            .change_context(DurableError)
            .attach("register journal record declaration")?;
        scan_records(&self.reader, (Bound::Unbounded, Bound::Unbounded), None).await
    }

    /// # Errors
    ///
    /// Returns an error when journal scanning, decoding, or sequence validation fails.
    pub async fn scan_suffix<T: UntrimmedJournalRecord>(
        &self,
        through_log_sequence: Option<u64>,
        durable_end_exclusive: u64,
    ) -> Result<Vec<(u64, T)>, Report<DurableError>> {
        self.registry
            .register(T::declaration())
            .change_context(DurableError)
            .attach("register journal record declaration")?;
        let range = recovery_range(through_log_sequence, durable_end_exclusive)?;
        scan_records(&self.reader, range.bounds, Some(range.window)).await
    }

    /// Closes the reader, waiting up to the durability timeout. Close errors are discarded.
    pub async fn close(self) {
        let _: Result<_, _> = tokio::time::timeout(DURABILITY_TIMEOUT, self.reader.close()).await;
    }
}

struct RecoveryRange {
    bounds: (Bound<Sequence>, Bound<Sequence>),
    window: (u64, u64),
}

fn recovery_range(
    through_log_sequence: Option<u64>,
    durable_end_exclusive: u64,
) -> Result<RecoveryRange, Report<DurableError>> {
    let start = match through_log_sequence {
        Some(sequence) => sequence.checked_add(1).ok_or_else(|| {
            Report::new(DurableError)
                .attach("inclusive recovery sequence cannot advance past u64::MAX")
        })?,
        None => 0,
    };
    if start > durable_end_exclusive {
        return Err(Report::new(DurableError).attach(format!(
            "recovery start {start} is beyond durable end {durable_end_exclusive}"
        )));
    }
    Ok(RecoveryRange {
        bounds: (
            Bound::Included(start),
            Bound::Excluded(durable_end_exclusive),
        ),
        window: (start, durable_end_exclusive),
    })
}

async fn flush_with_timeout(
    flush: impl core::future::Future<Output = opendata_log::Result<()>>,
    timeout: Duration,
) -> Result<(), Report<ShardAppendError>> {
    tokio::time::timeout(timeout, flush)
        .await
        .map_err(|error| post_invocation_source("flush shard record", error))?
        .map_err(|error| post_invocation_source("flush shard record", error))
}

/// Reads and decodes the requested journal range, checking its sequence bounds.
async fn scan_records<T, R>(
    reader: &R,
    range: (Bound<Sequence>, Bound<Sequence>),
    expected_window: Option<(u64, u64)>,
) -> Result<Vec<(u64, T)>, Report<DurableError>>
where
    T: UntrimmedJournalRecord,
    R: LogRead + Sync,
{
    let mut iterator = reader
        .scan(Bytes::from_static(EVENTS_KEY), range)
        .await
        .change_context(DurableError)
        .attach("scan shard log")?;
    let mut records = Vec::new();
    while let Some(entry) = iterator
        .next()
        .await
        .change_context(DurableError)
        .attach("read shard log")?
    {
        if let Some((start, end)) = expected_window
            && (entry.sequence < start || entry.sequence >= end)
        {
            return Err(Report::new(DurableError).attach(format!(
                "scan returned sequence {} outside recovery window [{start}, {end})",
                entry.sequence
            )));
        }
        let record = T::decode(&entry.value)
            .change_context(DurableError)
            .attach(format!(
                "decode shard sequence {} as {}",
                entry.sequence,
                T::declaration().name
            ))?;
        records.push((entry.sequence, record));
    }
    if let Some((_start, expected_end)) = expected_window {
        let observed_end = iterator.next_sequence();
        if observed_end != expected_end {
            return Err(Report::new(DurableError).attach(format!(
                "remote recovery scan covered only through {observed_end}, expected exclusive end \
                 {expected_end}"
            )));
        }
    }
    Ok(records)
}

async fn scan_snapshot_records<T, R>(
    reader: &R,
    range: (Bound<Sequence>, Bound<Sequence>),
    expected_end: u64,
) -> Result<Vec<(u64, Result<T, Report<crate::registry::CompatError>>)>, Report<DurableError>>
where
    T: DurableRecord,
    R: LogRead + Sync,
{
    let mut iterator = reader
        .scan(Bytes::from_static(PROJECTION_SNAPSHOTS_KEY), range)
        .await
        .change_context(DurableError)
        .attach("scan projection-snapshot references")?;
    let mut records = Vec::new();
    while let Some(entry) = iterator
        .next()
        .await
        .change_context(DurableError)
        .attach("read projection-snapshot reference")?
    {
        if entry.sequence >= expected_end {
            return Err(Report::new(DurableError).attach(format!(
                "snapshot scan returned sequence {} at or beyond durable end {expected_end}",
                entry.sequence
            )));
        }
        records.push((entry.sequence, T::decode(&entry.value)));
    }
    if iterator.next_sequence() != expected_end {
        return Err(Report::new(DurableError).attach(format!(
            "snapshot scan covered only through {}, expected exclusive end {expected_end}",
            iterator.next_sequence()
        )));
    }
    Ok(records)
}

#[cfg(any(test, feature = "test-util"))]
pub(crate) fn definitely_not_committed_message(
    operation: &'static str,
    message: &'static str,
) -> Report<ShardAppendError> {
    Report::new(ShardAppendError {
        kind: AppendFailureKind::DefinitelyNotCommitted,
    })
    .attach(operation)
    .attach(message)
}

fn post_invocation_source<E>(operation: &'static str, error: E) -> Report<ShardAppendError>
where
    E: core::error::Error + Send + Sync + 'static,
{
    let message = error.to_string();
    let kind = post_invocation_failure_kind(&message);
    Report::new(error)
        .change_context(ShardAppendError { kind })
        .attach(operation)
}

#[cfg(any(test, feature = "test-util"))]
pub(crate) fn post_invocation_message(
    operation: &'static str,
    message: &'static str,
) -> Report<ShardAppendError> {
    Report::new(ShardAppendError {
        kind: post_invocation_failure_kind(message),
    })
    .attach(operation)
    .attach(message)
}

fn post_invocation_report(
    operation: &'static str,
    report: Report<DurableError>,
) -> Report<ShardAppendError> {
    let message = format!("{report:?}");
    report
        .change_context(ShardAppendError {
            kind: post_invocation_failure_kind(&message),
        })
        .attach(operation)
}

fn post_invocation_failure_kind(message: &str) -> AppendFailureKind {
    if message.to_ascii_lowercase().contains(PINNED_FENCE_MESSAGE) {
        AppendFailureKind::Fenced
    } else {
        AppendFailureKind::CommitUnknown
    }
}

/// Retries durability waits because the notification can arrive after the write.
/// Exhausting the attempts leaves the append status unknown and stops a leased shard.
async fn wait_until_durable_with(
    log: &LogDb,
    required: Sequence,
    attempt_timeout: Duration,
    attempts: u32,
) -> Result<(), Report<DurableError>> {
    for attempt in 1..=attempts {
        if log.durable_sequence() >= required {
            return Ok(());
        }
        let mut changes = log.subscribe_durable();
        let wait = tokio::time::timeout(attempt_timeout, async {
            while *changes.borrow_and_update() < required {
                changes
                    .changed()
                    .await
                    .change_context(DurableError)
                    .attach("shard durable sequence subscription closed")?;
            }
            Ok::<(), Report<DurableError>>(())
        })
        .await;
        match wait {
            Ok(result) => return result,
            Err(_elapsed) => {
                tracing::warn!(
                    attempt,
                    of = attempts,
                    required,
                    "durability wait timed out; checking again"
                );
            }
        }
    }
    Err(Report::new(DurableError).attach(format!(
        "shard durable sequence did not reach {required} within {attempts} waits of \
         {attempt_timeout:?}"
    )))
}

/// Provides direct append access for tests that seed journals or open competing writers.
#[cfg(any(test, feature = "test-util"))]
pub struct RawShardLog(ShardLogWriter);

#[cfg(any(test, feature = "test-util"))]
impl RawShardLog {
    /// # Errors
    ///
    /// Returns an error when the shard storage cannot be opened before its timeout.
    pub async fn open(location: &ShardLogLocation) -> Result<Self, Report<ShardLogOpenError>> {
        ShardLogWriter::open(location).await.map(Self)
    }

    /// # Errors
    ///
    /// Returns an error when record validation, append, or durable flush fails.
    pub async fn append<T: UntrimmedJournalRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<u64, Report<ShardAppendError>> {
        self.0
            .registry
            .register(T::declaration())
            .change_context(ShardAppendError {
                kind: AppendFailureKind::DefinitelyNotCommitted,
            })
            .attach("register raw-append declaration")?;
        self.0.append(value).await
    }

    /// # Errors
    ///
    /// Returns an error when snapshot validation, append, or durable flush fails.
    pub async fn append_projection_snapshot<T: DurableRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<u64, Report<ShardAppendError>> {
        self.0
            .registry
            .register(T::declaration())
            .change_context(ShardAppendError {
                kind: AppendFailureKind::DefinitelyNotCommitted,
            })
            .attach("register raw-append declaration")?;
        self.0
            .append_registered(PROJECTION_SNAPSHOTS_KEY, value, AppendFault::None)
            .await
    }

    #[must_use]
    pub fn durable_end_exclusive(&self) -> u64 {
        self.0.durable_end_exclusive()
    }

    /// # Errors
    ///
    /// Returns an error when the shard writer cannot be closed.
    pub async fn close(self) -> Result<(), Report<DurableError>> {
        self.0.close().await
    }
}
#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::time::Duration;

    use error_stack::{Report, ResultExt as _};
    use serde::{Deserialize, Serialize};
    use tempfile::TempDir;

    use super::{
        AppendFailureKind, OpenedShard, ShardLogLocation, ShardLogOpenError, ShardLogRecovery,
        ShardLogWriter, post_invocation_message, read_journal, wait_until_durable_with,
    };
    use crate::{
        registry::{
            CompatError, DurableRecord, MigrationPolicy, RecordDeclaration, RecordRegistry,
            UntrimmedJournalRecord, VersionedRecord,
        },
        routing::{Shard, shard_path},
    };

    #[tokio::test]
    async fn flush_stalled() {
        let error = super::flush_with_timeout(
            core::future::pending(),
            core::time::Duration::from_millis(1),
        )
        .await
        .expect_err("stalled flush should time out");
        assert_eq!(
            error.current_context().kind,
            AppendFailureKind::CommitUnknown
        );
        assert!(
            error.contains::<tokio::time::error::Elapsed>(),
            "flush timeout should retain the elapsed error"
        );
    }

    const TEST_RECORD_DECLARATION: RecordDeclaration = RecordDeclaration {
        name: "kernel_shard_log_test_record",
        codec: core::any::TypeId::of::<TestRecord>(),
        owning_module: "durable_kernel::shard_log::tests",
        emitted_version: 1,
        supported_versions: &[1],
        algorithm_versions: &[],
        durability: crate::registry::DurabilityClass::ImmutableJournal,
        migration: MigrationPolicy::NeverRetireWhileUntrimmed,
    };

    #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
    struct TestRecord {
        body: String,
        #[serde(skip)]
        fail_encode: bool,
    }

    impl DurableRecord for TestRecord {
        const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

        fn declaration() -> RecordDeclaration {
            TEST_RECORD_DECLARATION
        }

        fn encode(&self) -> Result<Vec<u8>, Report<CompatError>> {
            if self.fail_encode {
                return Err(Report::new(CompatError::Encode {
                    name: Self::declaration().name,
                })
                .attach("injected encode failure"));
            }
            serde_json::to_vec(self).change_context(CompatError::Encode {
                name: Self::declaration().name,
            })
        }

        fn decode(bytes: &[u8]) -> Result<Self, Report<CompatError>> {
            serde_json::from_slice(bytes).change_context(CompatError::Decode {
                name: Self::declaration().name,
            })
        }
    }

    impl VersionedRecord for TestRecord {
        type Current = Self;

        fn normalize(self) -> Result<Self, Report<CompatError>> {
            Ok(self)
        }
    }

    impl UntrimmedJournalRecord for TestRecord {}

    fn record(body: &str) -> TestRecord {
        TestRecord {
            body: body.to_owned(),
            fail_encode: false,
        }
    }

    struct TestPrefixCapability {
        root: TempDir,
        object_store_root: std::path::PathBuf,
        registry: Arc<RecordRegistry>,
    }

    impl TestPrefixCapability {
        fn new() -> Self {
            let registry = Arc::new(RecordRegistry::default());
            registry
                .register(TEST_RECORD_DECLARATION)
                .expect("test declaration should register");
            let root = tempfile::tempdir().expect("test object-store root should be created");
            Self {
                object_store_root: root.path().to_path_buf(),
                root,
                registry,
            }
        }

        fn log_path(shard: Shard) -> String {
            format!("tenants/alice/control/v1/shards/{}/log", shard_path(shard))
        }

        fn location(&self, shard: Shard) -> ShardLogLocation {
            ShardLogLocation::disposable_local(
                shard,
                &Self::log_path(shard),
                &self.object_store_root,
                Arc::clone(&self.registry),
            )
        }

        fn root(&self) -> &std::path::Path {
            self.root.path()
        }
    }

    #[tokio::test]
    async fn open_invalid_storage() {
        let capability = TestPrefixCapability::new();
        let shard = Shard::from_u8(7);
        let blocked = capability.root().join("blocked");
        std::fs::write(&blocked, b"not a directory").expect("storage root should be blocked");
        let location = ShardLogLocation::disposable_local(
            shard,
            &TestPrefixCapability::log_path(shard),
            &blocked,
            Arc::clone(&capability.registry),
        );

        let writer_error = OpenedShard::open(location.clone())
            .await
            .err()
            .expect("a file at the storage root should prevent opening a writer");
        assert!(matches!(
            writer_error.downcast_ref::<ShardLogOpenError>(),
            Some(ShardLogOpenError::Writer { shard: failed_shard }) if *failed_shard == shard
        ));
        assert!(
            writer_error.contains::<opendata_log::Error>(),
            "writer open should retain the storage error through the command context"
        );

        let reader_error = read_journal::<TestRecord>(&location)
            .await
            .expect_err("a file at the storage root should prevent reading the journal");
        assert!(matches!(
            reader_error.downcast_ref::<ShardLogOpenError>(),
            Some(ShardLogOpenError::Reader { shard: failed_shard }) if *failed_shard == shard
        ));
        assert!(
            reader_error.contains::<opendata_log::Error>(),
            "journal read should retain the storage error"
        );
    }

    #[tokio::test]
    async fn shards_append_independently_and_each_append_is_one_physical_record() {
        let capability = TestPrefixCapability::new();
        let shard_zero = Shard::try_from(0).expect("test shard should be in range");
        let shard_one = Shard::try_from(1).expect("test shard should be in range");
        let zero_location = capability.location(shard_zero);
        let one_location = capability.location(shard_one);
        let zero = ShardLogWriter::open(&zero_location)
            .await
            .expect("writer should open");
        let one = ShardLogWriter::open(&one_location)
            .await
            .expect("writer should open");

        let zero_sequence = zero
            .append(&record("zero"))
            .await
            .expect("record should append");
        let one_sequence = one
            .append(&record("one"))
            .await
            .expect("record should append");
        zero.close().await.expect("writer should close");
        one.close().await.expect("writer should close");

        let zero_reader = ShardLogRecovery::open(&zero_location)
            .await
            .expect("recovery reader should open");
        let one_reader = ShardLogRecovery::open(&one_location)
            .await
            .expect("recovery reader should open");
        let zero_records = zero_reader
            .scan::<TestRecord>()
            .await
            .expect("records should scan");
        let one_records = one_reader
            .scan::<TestRecord>()
            .await
            .expect("records should scan");
        assert_eq!(zero_records, vec![(zero_sequence, record("zero"))]);
        assert_eq!(one_records, vec![(one_sequence, record("one"))]);
        zero_reader.close().await;
        one_reader.close().await;

        assert!(
            capability
                .root()
                .join(TestPrefixCapability::log_path(shard_zero))
                .exists()
        );
        assert!(
            capability
                .root()
                .join(TestPrefixCapability::log_path(shard_one))
                .exists()
        );
    }

    #[tokio::test]
    async fn pre_invocation_encoding_failure_is_definitely_not_committed() {
        let capability = TestPrefixCapability::new();
        let location =
            capability.location(Shard::try_from(9).expect("test shard should be in range"));
        let writer = ShardLogWriter::open(&location)
            .await
            .expect("writer should open");
        let mut invalid = record("valid-body");
        invalid.fail_encode = true;
        let error = writer
            .append(&invalid)
            .await
            .expect_err("invalid record should fail encoding");
        assert_eq!(
            error.current_context().kind,
            AppendFailureKind::DefinitelyNotCommitted
        );
        assert_eq!(
            error.downcast_ref::<CompatError>(),
            Some(&CompatError::Encode {
                name: TestRecord::declaration().name
            })
        );
        writer.close().await.expect("writer should close");
    }

    #[tokio::test]
    async fn unregistered_record_is_refused_before_any_append_side_effect() {
        #[derive(Debug, Clone, Serialize, Deserialize)]
        struct UnregisteredRecord;

        const UNREGISTERED_DECLARATION: RecordDeclaration = RecordDeclaration {
            name: "kernel_shard_log_unregistered_record",
            ..TEST_RECORD_DECLARATION
        };

        impl DurableRecord for UnregisteredRecord {
            const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

            fn declaration() -> RecordDeclaration {
                UNREGISTERED_DECLARATION
            }

            fn encode(&self) -> Result<Vec<u8>, Report<CompatError>> {
                Ok(Vec::new())
            }

            fn decode(_bytes: &[u8]) -> Result<Self, Report<CompatError>> {
                Ok(Self)
            }
        }

        impl VersionedRecord for UnregisteredRecord {
            type Current = Self;

            fn normalize(self) -> Result<Self, Report<CompatError>> {
                Ok(self)
            }
        }

        impl UntrimmedJournalRecord for UnregisteredRecord {}

        let other_registry = RecordRegistry::default();
        other_registry
            .register(UnregisteredRecord::declaration())
            .expect("the record should register in an unrelated registry");
        let capability = TestPrefixCapability::new();
        let location =
            capability.location(Shard::try_from(10).expect("test shard should be in range"));
        let writer = ShardLogWriter::open(&location)
            .await
            .expect("writer should open");
        let error = writer
            .append(&UnregisteredRecord)
            .await
            .expect_err("unregistered record should be rejected");
        assert_eq!(
            error.current_context().kind,
            AppendFailureKind::DefinitelyNotCommitted
        );
        assert!(matches!(
            error.downcast_ref::<crate::registry::DeclarationError>(),
            Some(crate::registry::DeclarationError::Unregistered { .. })
        ));
        writer.close().await.expect("writer should close");
        assert!(
            read_journal::<TestRecord>(&location)
                .await
                .expect("journal should be readable after rejection")
                .is_empty(),
            "rejected append should leave the journal empty"
        );
    }

    #[tokio::test]
    async fn durability_wait_retries_after_timeout() {
        let capability = TestPrefixCapability::new();
        let location =
            capability.location(Shard::try_from(41).expect("test shard should be in range"));
        let writer = ShardLogWriter::open(&location)
            .await
            .expect("writer should open");
        let first = writer
            .append(&record("stall-probe"))
            .await
            .expect("record should append");

        // The durable end is exclusive, so the next append advances it by two from `first`.
        let required = first + 2;
        let (waited, appended) = tokio::join!(
            wait_until_durable_with(writer.raw_log(), required, Duration::from_millis(20), 50,),
            async {
                tokio::time::sleep(Duration::from_millis(150)).await;
                writer.append(&record("stall-probe-second")).await
            }
        );
        appended.expect("delayed record should append");
        waited.expect("a timed-out wait should retry until the append is durable");

        let started = std::time::Instant::now();
        let error = wait_until_durable_with(
            writer.raw_log(),
            required + 1_000,
            Duration::from_millis(10),
            3,
        )
        .await;
        assert!(
            error.is_err(),
            "waiting for a sequence that is never stored should fail"
        );
        assert!(
            started.elapsed() >= Duration::from_millis(30),
            "all retry attempts should run before reporting unknown commit status"
        );
        writer.close().await.expect("writer should close");
    }

    #[test]
    fn only_the_pinned_slate_fence_message_is_classified_as_fenced() {
        assert_eq!(
            post_invocation_message(
                "flush",
                "storage error: Closed error: detected newer DB client"
            )
            .current_context()
            .kind,
            AppendFailureKind::Fenced
        );
        assert_eq!(
            post_invocation_message("flush", "unrelated fencing proxy timeout")
                .current_context()
                .kind,
            AppendFailureKind::CommitUnknown
        );
    }

    #[tokio::test]
    async fn newer_writer_fences_old_writer_with_typed_failure_kind() {
        let capability = TestPrefixCapability::new();
        let location =
            capability.location(Shard::try_from(39).expect("test shard should be in range"));
        let first = ShardLogWriter::open(&location)
            .await
            .expect("writer should open");
        first
            .append(&record("first"))
            .await
            .expect("record should append");
        let second = ShardLogWriter::open(&location)
            .await
            .expect("writer should open");
        second
            .append(&record("second"))
            .await
            .expect("record should append");

        let error = first
            .append(&record("stale"))
            .await
            .expect_err("stale writer should be fenced");
        assert_eq!(error.current_context().kind, AppendFailureKind::Fenced);

        let _: Result<_, _> = first.close().await;
        second.close().await.expect("writer should close");
        let reader = ShardLogRecovery::open(&location)
            .await
            .expect("recovery reader should open");
        let records = reader
            .scan::<TestRecord>()
            .await
            .expect("records should scan");
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].1, record("first"));
        assert_eq!(records[1].1, record("second"));
        reader.close().await;
    }
}
