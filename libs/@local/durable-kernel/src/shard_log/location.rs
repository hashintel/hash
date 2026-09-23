use alloc::sync::Arc;
use core::{num::NonZeroU64, ops::Bound, time::Duration};
use std::path::PathBuf;

use error_stack::{Report, ResultExt as _};
use opendata_common::{
    StorageConfig,
    storage::config::{
        AwsObjectStoreConfig, BlockCacheConfig, FoyerMemoryCacheConfig, LocalObjectStoreConfig,
        ObjectStoreConfig, SlateDbStorageConfig,
    },
};

use super::{
    DURABILITY_TIMEOUT, JournalReader as _, JournalStorage, ShardLogLocation, ShardLogOpenError,
    StorageConfigError, scan_records,
};
use crate::{
    DurableError,
    registry::{RecordRegistry, UntrimmedJournalRecord},
};

/// Holds the storage location and cache budgets that the owned shards share.
#[derive(Debug, Clone)]
pub struct LogStorageOptions {
    pub blob_url: String,
    pub aws_region: Option<String>,
    /// The number of shards that share the cache budgets.
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

impl<S: JournalStorage> ShardLogLocation<S> {
    /// Creates a shard location with an explicit storage configuration.
    ///
    /// `read_timeout` bounds read-only opens. `durability_timeout` bounds writer opens, closes, and
    /// each wait for an append to become durable.
    #[must_use]
    pub const fn new(
        shard: crate::routing::Shard,
        storage: S,
        read_timeout: Duration,
        durability_timeout: Duration,
        registry: Arc<RecordRegistry>,
    ) -> Self {
        Self {
            shard,
            storage,
            read_timeout,
            durability_timeout,
            registry,
        }
    }
}

impl ShardLogLocation {
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
            storage: storage_for_path(options, log_path)?,
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
            storage: StorageConfig::SlateDb(SlateDbStorageConfig {
                path: log_path.to_owned(),
                object_store: ObjectStoreConfig::Local(LocalObjectStoreConfig {
                    path: object_store_root.display().to_string(),
                }),
                settings_path: None,
                block_cache: None,
                meta_cache: None,
            }),
        }
    }
}

impl<S: JournalStorage> ShardLogLocation<S> {
    #[must_use]
    pub const fn shard(&self) -> crate::routing::Shard {
        self.shard
    }

    pub(super) async fn open_reader(&self) -> Result<S::Reader, Report<ShardLogOpenError>> {
        tokio::time::timeout(self.read_timeout, self.storage.open_reader())
            .await
            .change_context(ShardLogOpenError::ReaderTimeout {
                shard: self.shard,
                timeout: self.read_timeout,
            })?
            .change_context(ShardLogOpenError::Reader { shard: self.shard })
    }
}

/// Reads a shard’s complete journal without acquiring a writer or changing its epoch.
///
/// # Errors
///
/// Returns an error if opening, scanning, decoding, sequence validation, or closing fails.
pub async fn read_journal<T: UntrimmedJournalRecord>(
    location: &ShardLogLocation<impl JournalStorage>,
) -> Result<Vec<(u64, T)>, Report<DurableError>> {
    location
        .registry
        .register(T::declaration())
        .change_context(DurableError::RegisterRecord {
            name: T::declaration().name,
        })?;
    let reader = location
        .open_reader()
        .await
        .change_context(DurableError::OpenReader)?;
    let result = scan_records(&reader, (Bound::Unbounded, Bound::Unbounded), None).await;
    match (result, reader.close().await) {
        (result, Ok(())) => result,
        (Ok(_), Err(error)) => Err(error),
        (Err(error), Err(close_error)) => {
            let mut failures = error.expand();
            failures.push(close_error);
            Err(failures.change_context(DurableError::ReadJournal))
        }
    }
}
