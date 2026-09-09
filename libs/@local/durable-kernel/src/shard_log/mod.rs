//! One canonical `OpenData` log per stable routing shard.
//!
//! The append-capable handle stays private to this module. Appends go
//! through the command loop, and read-only access goes through the scan
//! functions and the recovery reader.
use core::{fmt, ops::Bound, time::Duration};

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
    registry::{DurableRecord, UntrimmedJournalRecord, require_interned},
};

mod command_loop;

#[cfg(any(test, feature = "test-util"))]
pub use command_loop::start_recovered;
pub use command_loop::{
    ControlResolution, OpenedShard, RecoveredShard, ShardCommandConfig, ShardCommandError,
    ShardCommandErrorKind, ShardCommandHandle, ShardCommandOutcome, StartedShard, StartupRecovery,
    StateChangeFeed,
};
#[cfg(any(test, feature = "test-util"))]
pub use command_loop::{TestHarness, TestHold};

const EVENTS_KEY: &[u8] = b"events";
const PROJECTION_SNAPSHOTS_KEY: &[u8] = b"projection-snapshots";
const APPEND_TIMEOUT: Duration = Duration::from_secs(30);
const DURABILITY_TIMEOUT: Duration = Duration::from_secs(60);
/// Watermark-wait attempts before an append is declared ambiguous. Ambiguity
/// is shard-fatal under a lease, so one stalled subscription gets bounded
/// retries first.
const DURABILITY_WAIT_ATTEMPTS: u32 = 3;
const PINNED_FENCE_MESSAGE: &str = "detected newer db client";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppendDisposition {
    DefinitelyNotCommitted,
    CommitUnknown,
    Fenced,
}

#[derive(Debug)]
pub struct ShardAppendError {
    pub disposition: AppendDisposition,
    pub source: Report<DurableError>,
}

#[expect(
    clippy::use_debug,
    reason = "the append error includes the report attachment chain and disposition"
)]
impl fmt::Display for ShardAppendError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "shard append failed with {:?}: {:?}",
            self.disposition, self.source
        )
    }
}

impl core::error::Error for ShardAppendError {}

#[derive(Debug, Clone)]
pub struct ShardLogLocation {
    shard: crate::routing::Shard,
    source: LogSource,
    read_timeout: Duration,
    durability_timeout: Duration,
}

/// Describes where a shard log lives. It can use a real storage configuration
/// or a simulated journal owned by the deterministic simulation harness.
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
    /// each durable-watermark wait attempt.
    #[must_use]
    pub const fn new(
        shard: crate::routing::Shard,
        storage: StorageConfig,
        read_timeout: Duration,
        durability_timeout: Duration,
    ) -> Self {
        Self {
            shard,
            source: LogSource::Storage(storage),
            read_timeout,
            durability_timeout,
        }
    }

    /// A shard log served by the deterministic-simulation journal. Reads,
    /// appends, and recovery run against the simulated dispositions.
    #[cfg(any(test, feature = "test-util"))]
    #[must_use]
    pub const fn simulated(
        shard: crate::routing::Shard,
        journal: crate::sim::SimLogHandle,
    ) -> Self {
        Self {
            shard,
            source: LogSource::Sim(journal),
            read_timeout: DURABILITY_TIMEOUT,
            durability_timeout: DURABILITY_TIMEOUT,
        }
    }

    /// Location for a kernel-hosted shard log with explicit storage inputs and
    /// no environment coupling.
    ///
    /// # Errors
    ///
    /// Returns an error when storage configuration or local directory creation fails.
    pub fn for_kernel(
        shard: crate::routing::Shard,
        log_path: &str,
        options: &LogStorageOptions,
    ) -> Result<Self, Report<DurableError>> {
        Ok(Self {
            shard,
            read_timeout: DURABILITY_TIMEOUT,
            durability_timeout: DURABILITY_TIMEOUT,
            source: LogSource::Storage(storage_for_path(options, log_path)?),
        })
    }

    #[cfg(any(test, feature = "test-util"))]
    #[must_use]
    pub fn disposable_local(
        shard: crate::routing::Shard,
        log_path: &str,
        object_store_root: &std::path::Path,
    ) -> Self {
        use opendata_common::storage::config::{
            LocalObjectStoreConfig, ObjectStoreConfig, SlateDbStorageConfig,
        };

        Self {
            shard,
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

/// Explicit storage inputs for a shard log, so a library embedding never
/// reads process environment.
#[derive(Debug, Clone)]
pub struct LogStorageOptions {
    pub blob_url: String,
    pub aws_region: Option<String>,
    pub shard_capacity: u64,
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
) -> Result<StorageConfig, Report<DurableError>> {
    let url = options.blob_url.clone();
    let (object_store, prefix) = if let Some(path) = url.strip_prefix("file://") {
        std::fs::create_dir_all(path)
            .change_context(DurableError)
            .attach(format!("create local OpenData root {path:?}"))?;
        (
            ObjectStoreConfig::Local(LocalObjectStoreConfig {
                path: path.to_owned(),
            }),
            String::new(),
        )
    } else if let Some(value) = url.strip_prefix("s3://") {
        let (bucket, prefix) = value.split_once('/').unwrap_or((value, ""));
        if bucket.is_empty() {
            return Err(Report::new(DurableError).attach("blob URL has an empty S3 bucket"));
        }
        let Some(region) = options.aws_region.clone() else {
            return Err(Report::new(DurableError)
                .attach("S3 shard-log storage requires an explicit AWS region"));
        };
        (
            ObjectStoreConfig::Aws(AwsObjectStoreConfig {
                region,
                bucket: bucket.to_owned(),
            }),
            prefix.trim_matches('/').to_owned(),
        )
    } else {
        return Err(
            Report::new(DurableError).attach(format!("unsupported shard-log blob URL {url:?}"))
        );
    };
    let path = if prefix.is_empty() {
        control_path.to_owned()
    } else {
        format!("{prefix}/{control_path}")
    };
    let shard_capacity = options.shard_capacity.max(1);
    let block_cache_capacity = options
        .block_cache_bytes
        .checked_div(shard_capacity)
        .unwrap_or(0)
        .max(64 * 1024);
    let meta_cache_capacity = options
        .meta_cache_bytes
        .checked_div(shard_capacity)
        .unwrap_or(0)
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

/// Scans one shard's complete journal through a read-only `LogDb` handle.
///
/// Offline inspection must never open a writer, advance a `SlateDB` epoch, acquire a lease, or
/// mutate the shard it reads.
///
/// # Errors
///
/// Returns an error when opening, scanning, decoding, or validating the journal fails.
pub async fn read_journal<T: UntrimmedJournalRecord>(
    location: &ShardLogLocation,
) -> Result<Vec<(u64, T)>, Report<DurableError>> {
    #[cfg(any(test, feature = "test-util"))]
    if let LogSource::Sim(journal) = &location.source {
        return decode_sim_entries(journal.durable_entries(crate::sim::SimKey::Events));
    }
    let reader = tokio::time::timeout(
        location.read_timeout,
        LogDbReader::open(ReaderConfig {
            storage: location.source.storage()?.clone(),
            ..ReaderConfig::default()
        }),
    )
    .await
    .change_context(DurableError)
    .attach("open read-only shard journal timed out")?
    .change_context(DurableError)
    .attach("open read-only shard journal")?;
    let result = scan_records(&reader, (Bound::Unbounded, Bound::Unbounded), None).await;
    reader.close().await;
    result
}

impl ShardLogLocation {
    #[must_use]
    pub const fn shard(&self) -> crate::routing::Shard {
        self.shard
    }
}

/// The only type that owns a shard's append-capable log.
struct ShardLogWriter {
    backend: WriterBackend,
    durability_timeout: Duration,
}

enum WriterBackend {
    Real(LogDb),
    #[cfg(any(test, feature = "test-util"))]
    Sim(crate::sim::SimWriter),
}

/// Decodes ground-truth entries from the simulated journal with the same
/// typed-codec discipline as a real scan.
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
    /// # Errors
    ///
    /// Returns an error when the shard storage cannot be opened before its timeout.
    async fn open(location: &ShardLogLocation) -> Result<Self, Report<DurableError>> {
        let durability_timeout = location.durability_timeout;
        #[cfg(any(test, feature = "test-util"))]
        if let LogSource::Sim(journal) = &location.source {
            return Ok(Self {
                backend: WriterBackend::Sim(journal.open_writer()),
                durability_timeout,
            });
        }
        let log = tokio::time::timeout(
            durability_timeout,
            LogDb::open(Config {
                storage: location.source.storage()?.clone(),
                read_visibility: ReadVisibility::Remote,
                // Remote sequential scans are request-bound with SlateDB's
                // 4 KiB default. Control records are append-only and replayed
                // in order, so 64 KiB blocks substantially reduce S3 range
                // GETs without changing the durable encoding contract.
                sst_block_size: Some(slatedb::SstBlockSize::Block64Kib),
                ..Config::default()
            }),
        )
        .await
        .change_context(DurableError)
        .attach(format!(
            "open shard log timed out after {durability_timeout:?}"
        ))?
        .change_context(DurableError)
        .attach("open shard log")?;
        Ok(Self {
            backend: WriterBackend::Real(log),
            durability_timeout,
        })
    }

    /// # Errors
    ///
    /// Returns an error when record validation, append, or durable flush fails.
    async fn append<T: UntrimmedJournalRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<u64, ShardAppendError> {
        self.append_with_fault(value, AppendFault::None).await
    }

    /// # Errors
    ///
    /// Returns an error when snapshot validation, append, or durable flush fails.
    async fn append_projection_snapshot<T: DurableRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<u64, ShardAppendError> {
        self.append_registered(PROJECTION_SNAPSHOTS_KEY, value, AppendFault::None)
            .await
    }

    /// Remote durable watermark captured from the writer opened with
    /// `ReadVisibility::Remote`. Records below this exclusive end are the
    /// complete startup-recovery window.
    fn durable_end_exclusive(&self) -> u64 {
        match &self.backend {
            WriterBackend::Real(log) => log.durable_sequence(),
            #[cfg(any(test, feature = "test-util"))]
            WriterBackend::Sim(writer) => writer.durable_end_exclusive(),
        }
    }

    /// # Errors
    ///
    /// Returns an error when journal scanning, decoding, or sequence validation fails.
    async fn scan_suffix<T: UntrimmedJournalRecord>(
        &self,
        through_log_sequence: Option<u64>,
        durable_end_exclusive: u64,
    ) -> Result<Vec<(u64, T)>, Report<DurableError>> {
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
    ) -> Result<Vec<(u64, Result<T, crate::registry::CompatError>)>, Report<DurableError>> {
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
    ) -> Result<u64, ShardAppendError> {
        self.append_registered(EVENTS_KEY, value, fault).await
    }

    async fn append_registered<T: DurableRecord + Sync>(
        &self,
        key: &'static [u8],
        value: &T,
        fault: AppendFault,
    ) -> Result<u64, ShardAppendError> {
        require_interned::<T>().map_err(|error| {
            definitely_not_committed("validate durable-record registration", error)
        })?;
        let bytes = value
            .encode()
            .map_err(|error| definitely_not_committed("encode durable shard record", error))?;
        match &self.backend {
            WriterBackend::Real(log) => {
                let record = Record {
                    key: Bytes::from_static(key),
                    value: Bytes::from(bytes),
                };
                let _: AppendFault = fault;

                #[cfg(any(test, feature = "test-util"))]
                if fault == AppendFault::DefinitelyNotCommitted {
                    return Err(definitely_not_committed_message(
                        "append shard record",
                        "injected pre-invocation failure",
                    ));
                }

                // From this call onward, absence of an acknowledgement cannot prove
                // absence from durable history. Only the pinned SlateDB fence result
                // has a stronger classification.
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
                log.flush()
                    .await
                    .map_err(|error| post_invocation_source("flush shard record", error))?;
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
                match writer.append(sim_key, bytes) {
                    crate::sim::SimAppendResult::Acked(sequence) => Ok(sequence),
                    crate::sim::SimAppendResult::DefinitelyNotCommitted => {
                        Err(definitely_not_committed_message(
                            "append shard record",
                            "simulated pre-invocation failure",
                        ))
                    }
                    crate::sim::SimAppendResult::CommitUnknown => Err(post_invocation_message(
                        "append shard record",
                        "simulated ambiguous append",
                    )),
                    crate::sim::SimAppendResult::Fenced => Err(ShardAppendError {
                        disposition: AppendDisposition::Fenced,
                        source: Report::new(DurableError).attach("simulated newer writer epoch"),
                    }),
                }
            }
        }
    }

    /// The real backing log whose watermark the durability wait tests poll
    /// directly instead of going through a command handle.
    #[cfg(test)]
    fn raw_log(&self) -> &LogDb {
        match &self.backend {
            WriterBackend::Real(log) => log,
            WriterBackend::Sim(_writer) => panic!("a real log should be configured for this test"),
        }
    }

    /// # Errors
    ///
    /// Returns an error when the shard writer cannot be closed.
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

/// Read-only recovery handle.
///
/// It cannot advance the writer epoch or append. Tests use it to inspect durable history without
/// competing for the writer epoch. Production recovery reads through its fenced writer.
#[cfg(any(test, feature = "test-util"))]
pub struct ShardLogRecovery {
    reader: LogDbReader,
}

#[cfg(any(test, feature = "test-util"))]
impl ShardLogRecovery {
    /// # Errors
    ///
    /// Returns an error when the shard storage cannot be opened before its timeout.
    pub async fn open(location: &ShardLogLocation) -> Result<Self, Report<DurableError>> {
        let reader = tokio::time::timeout(
            DURABILITY_TIMEOUT,
            LogDbReader::open(ReaderConfig {
                storage: location.source.storage()?.clone(),
                ..ReaderConfig::default()
            }),
        )
        .await
        .change_context(DurableError)
        .attach(format!(
            "open shard recovery reader timed out after {DURABILITY_TIMEOUT:?}"
        ))?
        .change_context(DurableError)
        .attach("open shard recovery reader")?;
        Ok(Self { reader })
    }

    /// # Errors
    ///
    /// Returns an error when journal scanning, decoding, or sequence validation fails.
    pub async fn scan<T: UntrimmedJournalRecord>(
        &self,
    ) -> Result<Vec<(u64, T)>, Report<DurableError>> {
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
        let range = recovery_range(through_log_sequence, durable_end_exclusive)?;
        scan_records(&self.reader, range.bounds, Some(range.window)).await
    }

    /// # Errors
    ///
    /// Returns an error when the shard writer cannot be closed.
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

/// Scans and decodes one shard's journal suffix. Generic over the journal
/// record type, so every domain replays its own vocabulary through one
/// recovery path.
async fn scan_records<T, R>(
    reader: &R,
    range: (Bound<Sequence>, Bound<Sequence>),
    expected_window: Option<(u64, u64)>,
) -> Result<Vec<(u64, T)>, Report<DurableError>>
where
    T: UntrimmedJournalRecord,
    R: LogRead + Sync,
{
    // A typed scan declares its codec. Intern it so the one-name-one-codec
    // property holds for everything this process decodes, and a conflicting
    // redeclaration is refused here rather than misdecoding history.
    crate::registry::intern_declaration(*T::declaration())
        .change_context(DurableError)
        .attach("intern shard recovery record declaration")?;
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
        if let Some((start, end)) = expected_window {
            if entry.sequence < start || entry.sequence >= end {
                return Err(Report::new(DurableError).attach(format!(
                    "scan returned sequence {} outside recovery window [{start}, {end})",
                    entry.sequence
                )));
            }
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
) -> Result<Vec<(u64, Result<T, crate::registry::CompatError>)>, Report<DurableError>>
where
    T: DurableRecord,
    R: LogRead + Sync,
{
    crate::registry::intern_declaration(*T::declaration())
        .change_context(DurableError)
        .attach("intern projection-snapshot record declaration")?;
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

fn definitely_not_committed<E>(operation: &'static str, error: E) -> ShardAppendError
where
    E: core::error::Error + Send + Sync + 'static,
{
    ShardAppendError {
        disposition: AppendDisposition::DefinitelyNotCommitted,
        source: Report::new(error)
            .change_context(DurableError)
            .attach(operation),
    }
}

#[cfg(any(test, feature = "test-util"))]
pub(crate) fn definitely_not_committed_message(
    operation: &'static str,
    message: &'static str,
) -> ShardAppendError {
    ShardAppendError {
        disposition: AppendDisposition::DefinitelyNotCommitted,
        source: Report::new(DurableError).attach(operation).attach(message),
    }
}

fn post_invocation_source<E>(operation: &'static str, error: E) -> ShardAppendError
where
    E: core::error::Error + Send + Sync + 'static,
{
    let message = error.to_string();
    let disposition = post_invocation_disposition(&message);
    ShardAppendError {
        disposition,
        source: Report::new(error)
            .change_context(DurableError)
            .attach(operation),
    }
}

#[cfg(any(test, feature = "test-util"))]
pub(crate) fn post_invocation_message(
    operation: &'static str,
    message: &'static str,
) -> ShardAppendError {
    ShardAppendError {
        disposition: post_invocation_disposition(message),
        source: Report::new(DurableError).attach(operation).attach(message),
    }
}

fn post_invocation_report(
    operation: &'static str,
    report: Report<DurableError>,
) -> ShardAppendError {
    let message = format!("{report:?}");
    ShardAppendError {
        disposition: post_invocation_disposition(&message),
        source: report.attach(operation),
    }
}

fn post_invocation_disposition(message: &str) -> AppendDisposition {
    if message.to_ascii_lowercase().contains(PINNED_FENCE_MESSAGE) {
        AppendDisposition::Fenced
    } else {
        AppendDisposition::CommitUnknown
    }
}

/// An ambiguous append is shard-fatal under a lease, and the append is usually already durable when
/// this wait stalls.
///
/// The watermark subscription lagged while the write landed. Check and subscribe again a bounded
/// number of times before converting a transient stall into ambiguity. The timeout and attempt
/// bound are parameters so the retry semantics are testable without production-length waits.
/// Production always uses the pinned constants.
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
                    "durable watermark wait timed out; re-checking before declaring ambiguity"
                );
            }
        }
    }
    Err(Report::new(DurableError).attach(format!(
        "shard durable sequence did not reach {required} within {attempts} waits of \
         {attempt_timeout:?}"
    )))
}

/// Test-only raw append access to one shard log, bypassing the command loop.
///
/// Downstream test suites seed journals and stage competing writers with it. Production appends go
/// exclusively through the command loop.
#[cfg(any(test, feature = "test-util"))]
pub struct RawShardLog(ShardLogWriter);

#[cfg(any(test, feature = "test-util"))]
impl RawShardLog {
    /// # Errors
    ///
    /// Returns an error when the shard storage cannot be opened before its timeout.
    pub async fn open(location: &ShardLogLocation) -> Result<Self, Report<DurableError>> {
        ShardLogWriter::open(location).await.map(Self)
    }

    /// # Errors
    ///
    /// Returns an error when record validation, append, or durable flush fails.
    pub async fn append<T: UntrimmedJournalRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<u64, ShardAppendError> {
        crate::registry::intern_declaration(*T::declaration())
            .map_err(|error| definitely_not_committed("intern raw-append declaration", error))?;
        self.0.append(value).await
    }

    /// # Errors
    ///
    /// Returns an error when snapshot validation, append, or durable flush fails.
    pub async fn append_projection_snapshot<T: DurableRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<u64, ShardAppendError> {
        crate::registry::intern_declaration(*T::declaration())
            .map_err(|error| definitely_not_committed("intern raw-append declaration", error))?;
        self.0.append_projection_snapshot(value).await
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
#[expect(clippy::unwrap_used, reason = "tests unwrap fixture results")]
mod tests {
    use serde::{Deserialize, Serialize};
    use tempfile::TempDir;

    use super::*;
    use crate::{
        registry::{
            CompatError, MigrationPolicy, RecordDeclaration, VersionedRecord, intern_declaration,
        },
        routing::{Shard, shard_path},
    };

    static TEST_RECORD_DECLARATION: RecordDeclaration = RecordDeclaration {
        name: "kernel_shard_log_test_record",
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

        fn declaration() -> &'static RecordDeclaration {
            &TEST_RECORD_DECLARATION
        }

        fn encode(&self) -> Result<Vec<u8>, CompatError> {
            if self.fail_encode {
                return Err(CompatError::Malformed {
                    name: Self::declaration().name,
                    message: "injected encode failure".to_owned(),
                });
            }
            serde_json::to_vec(self).map_err(|error| CompatError::Malformed {
                name: Self::declaration().name,
                message: error.to_string(),
            })
        }

        fn decode(bytes: &[u8]) -> Result<Self, CompatError> {
            serde_json::from_slice(bytes).map_err(|error| CompatError::Malformed {
                name: Self::declaration().name,
                message: error.to_string(),
            })
        }
    }

    impl VersionedRecord for TestRecord {
        type Current = Self;

        fn normalize(self) -> Result<Self, CompatError> {
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
    }

    impl TestPrefixCapability {
        fn new() -> Self {
            intern_declaration(TEST_RECORD_DECLARATION).expect("test declaration should intern");
            let root = tempfile::tempdir().expect("test object-store root should be created");
            Self {
                object_store_root: root.path().to_path_buf(),
                root,
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
            )
        }

        fn root(&self) -> &std::path::Path {
            self.root.path()
        }
    }

    #[tokio::test]
    async fn shards_append_independently_and_each_append_is_one_physical_record() {
        let capability = TestPrefixCapability::new();
        let shard_zero = Shard::try_from(0).unwrap();
        let shard_one = Shard::try_from(1).unwrap();
        let zero_location = capability.location(shard_zero);
        let one_location = capability.location(shard_one);
        let zero = ShardLogWriter::open(&zero_location).await.unwrap();
        let one = ShardLogWriter::open(&one_location).await.unwrap();

        let zero_sequence = zero.append(&record("zero")).await.unwrap();
        let one_sequence = one.append(&record("one")).await.unwrap();
        zero.close().await.unwrap();
        one.close().await.unwrap();

        let zero_reader = ShardLogRecovery::open(&zero_location).await.unwrap();
        let one_reader = ShardLogRecovery::open(&one_location).await.unwrap();
        let zero_records = zero_reader.scan::<TestRecord>().await.unwrap();
        let one_records = one_reader.scan::<TestRecord>().await.unwrap();
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
        let location = capability.location(Shard::try_from(9).unwrap());
        let writer = ShardLogWriter::open(&location).await.unwrap();
        let mut invalid = record("valid-body");
        invalid.fail_encode = true;
        let error = writer.append(&invalid).await.unwrap_err();
        assert_eq!(error.disposition, AppendDisposition::DefinitelyNotCommitted);
        writer.close().await.unwrap();
    }

    #[tokio::test]
    async fn unregistered_record_is_refused_before_any_append_side_effect() {
        #[derive(Debug, Clone, Serialize, Deserialize)]
        struct UnregisteredRecord;

        static UNREGISTERED_DECLARATION: RecordDeclaration = RecordDeclaration {
            name: "kernel_shard_log_unregistered_record",
            ..TEST_RECORD_DECLARATION
        };

        impl DurableRecord for UnregisteredRecord {
            const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

            fn declaration() -> &'static RecordDeclaration {
                &UNREGISTERED_DECLARATION
            }

            fn encode(&self) -> Result<Vec<u8>, CompatError> {
                Ok(Vec::new())
            }

            fn decode(_bytes: &[u8]) -> Result<Self, CompatError> {
                Ok(Self)
            }
        }

        impl VersionedRecord for UnregisteredRecord {
            type Current = Self;

            fn normalize(self) -> Result<Self, CompatError> {
                Ok(self)
            }
        }

        impl UntrimmedJournalRecord for UnregisteredRecord {}

        let capability = TestPrefixCapability::new();
        let location = capability.location(Shard::try_from(10).unwrap());
        let writer = ShardLogWriter::open(&location).await.unwrap();
        let error = writer.append(&UnregisteredRecord).await.unwrap_err();
        assert_eq!(error.disposition, AppendDisposition::DefinitelyNotCommitted);
        writer.close().await.unwrap();
    }

    #[tokio::test]
    async fn every_injected_post_invocation_failure_is_commit_unknown() {
        let capability = TestPrefixCapability::new();
        for (shard, fault) in [
            (20, AppendFault::AfterInvocation),
            (21, AppendFault::AfterAppend),
            (22, AppendFault::AfterFlush),
        ] {
            let location = capability.location(Shard::try_from(shard).unwrap());
            let writer = ShardLogWriter::open(&location).await.unwrap();
            let error = writer
                .append_with_fault(&record("fault-probe"), fault)
                .await
                .unwrap_err();
            assert_eq!(error.disposition, AppendDisposition::CommitUnknown);
            let _: Result<_, _> = writer.close().await;
        }
    }

    #[tokio::test]
    async fn durability_wait_retries_a_stalled_attempt_instead_of_declaring_ambiguity() {
        let capability = TestPrefixCapability::new();
        let location = capability.location(Shard::try_from(41).unwrap());
        let writer = ShardLogWriter::open(&location).await.unwrap();
        let first = writer.append(&record("stall-probe")).await.unwrap();

        // The next append's durable end. Several 20ms attempts stall before
        // the delayed append lands. The wait must keep retrying and succeed
        // rather than convert the stall into ambiguity.
        let required = first + 2;
        let (waited, appended) = tokio::join!(
            wait_until_durable_with(writer.raw_log(), required, Duration::from_millis(20), 50,),
            async {
                tokio::time::sleep(Duration::from_millis(150)).await;
                writer.append(&record("stall-probe-second")).await
            }
        );
        appended.unwrap();
        waited.expect("a stalled attempt should retry until the watermark advances");

        // Exhaustion still fails closed, after exactly the bounded attempts.
        let started = std::time::Instant::now();
        let error = wait_until_durable_with(
            writer.raw_log(),
            required + 1_000,
            Duration::from_millis(10),
            3,
        )
        .await;
        assert!(error.is_err(), "an unreachable watermark must fail closed");
        assert!(
            started.elapsed() >= Duration::from_millis(30),
            "every bounded attempt runs before ambiguity is declared"
        );
        writer.close().await.unwrap();
    }

    #[test]
    fn only_the_pinned_slate_fence_message_is_classified_as_fenced() {
        assert_eq!(
            post_invocation_message(
                "flush",
                "storage error: Closed error: detected newer DB client"
            )
            .disposition,
            AppendDisposition::Fenced
        );
        assert_eq!(
            post_invocation_message("flush", "unrelated fencing proxy timeout").disposition,
            AppendDisposition::CommitUnknown
        );
    }

    #[tokio::test]
    async fn newer_writer_fences_old_writer_with_typed_disposition() {
        let capability = TestPrefixCapability::new();
        let location = capability.location(Shard::try_from(39).unwrap());
        let first = ShardLogWriter::open(&location).await.unwrap();
        first.append(&record("first")).await.unwrap();
        let second = ShardLogWriter::open(&location).await.unwrap();
        second.append(&record("second")).await.unwrap();

        let error = first.append(&record("stale")).await.unwrap_err();
        assert_eq!(error.disposition, AppendDisposition::Fenced);

        let _: Result<_, _> = first.close().await;
        second.close().await.unwrap();
        let reader = ShardLogRecovery::open(&location).await.unwrap();
        let records = reader.scan::<TestRecord>().await.unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].1, record("first"));
        assert_eq!(records[1].1, record("second"));
        reader.close().await;
    }
}
