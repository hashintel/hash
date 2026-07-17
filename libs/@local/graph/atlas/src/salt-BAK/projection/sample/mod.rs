//! Embedding samples and their PostgreSQL-side relational view.
//!
//! [`Sample::load`] produces the pipeline's two inputs: a native-endian,
//! mmap-backed matrix of sampled embeddings and a temporary `atlas_sample`
//! table that maps every sampled row index to its stable entity identity.
//! Both are cached on disk, so a rerun with a warm cache restores the exact
//! same sample without re-drawing it.
//!
//! The sample holds a repeatable-read transaction open so that relation
//! extraction (see [`Sample::relations`]) observes the same snapshot the
//! sample was drawn from. Call [`Sample::finish`] as soon as relational work
//! is done: the long-running numerical stages (HNSW, PCA, UMAP, training)
//! must not keep a database snapshot alive.

mod cache;
mod relations;

use core::{error::Error, fmt, future};
use std::io;

use camino::Utf8Path;
use hash_graph_embeddings::{D512, Dimension};
use tokio::fs;
use tokio_postgres::{Client, IsolationLevel, Transaction};

pub use self::relations::{QueryEdges, Relations};
use self::{
    cache::{embeddings_path, load_mapping, mappings_path, write_sample},
    relations::prepare_relations,
};
use crate::float::FloatBytes;

/// Name of the temporary sampled-identity table.
const SAMPLE_TABLE: &str = "atlas_sample";
/// Name of the temporary deduplicated undirected relation table.
const RELATION_TABLE: &str = "atlas_relation";
/// Name of the temporary post-deduplication degree table.
const RELATION_DEGREE_TABLE: &str = "atlas_relation_degree";
/// Name of the temporary hub-identity table.
const HUB_TABLE: &str = "atlas_relation_hub";
/// Buffer size for streaming sampled data to and from disk.
const OUTPUT_BUFFER_SIZE: usize = 1024 * 1024;

/// A failure while sampling embeddings or preparing their relational view.
#[derive(Debug)]
pub enum SampleError {
    /// The cached embedding and mapping files disagree on the row count.
    CacheRowCount { embeddings: usize, mappings: u64 },
    /// The database returned a sample index outside `u32`.
    InvalidIndex(i64),
    /// Reading or writing sampled data failed.
    Io(io::Error),
    /// The blocking cache-persistence task failed.
    Join(tokio::task::JoinError),
    /// Publishing a cache file over its destination failed.
    Persist(tempfile::PersistError),
    /// A database operation failed.
    Postgres(tokio_postgres::Error),
}

impl fmt::Display for SampleError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CacheRowCount {
                embeddings,
                mappings,
            } => write!(
                fmt,
                "sample cache is inconsistent: {embeddings} embedding rows but {mappings} mapping \
                 rows"
            ),
            Self::InvalidIndex(index) => {
                write!(fmt, "database returned invalid sample index {index}")
            }
            Self::Io(_) => fmt.write_str("failed to access sampled data"),
            Self::Join(_) => fmt.write_str("sample cache persistence task failed"),
            Self::Persist(_) => fmt.write_str("failed to persist sampled data"),
            Self::Postgres(_) => fmt.write_str("failed to query sampled data"),
        }
    }
}

impl Error for SampleError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::CacheRowCount { .. } | Self::InvalidIndex(_) => None,
            Self::Io(error) => Some(error),
            Self::Join(error) => Some(error),
            Self::Persist(error) => Some(error),
            Self::Postgres(error) => Some(error),
        }
    }
}

impl From<io::Error> for SampleError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<tokio::task::JoinError> for SampleError {
    fn from(error: tokio::task::JoinError) -> Self {
        Self::Join(error)
    }
}

impl From<tempfile::PersistError> for SampleError {
    fn from(error: tempfile::PersistError) -> Self {
        Self::Persist(error)
    }
}

impl From<tokio_postgres::Error> for SampleError {
    fn from(error: tokio_postgres::Error) -> Self {
        Self::Postgres(error)
    }
}

/// Configuration for [`Sample::load`].
#[derive(Debug, Copy, Clone, Default)]
pub struct SampleOptions {
    /// Number of leading embedding values kept per entity (the MRL
    /// truncation). Rows are re-normalized to unit length after truncation.
    pub dim: Dimension = D512,
    /// Target number of sampled entities. The Bernoulli sample is
    /// probabilistic, so the realized count varies around this value.
    pub size: usize = 1_500_000,
}

/// A prepared sample whose relational view is backed by a temporary PostgreSQL table.
///
/// The repeatable-read transaction remains open so callers can build relational inputs through
/// [`Self::relations`]. Call [`Self::finish`] before long-running fitting or training to release
/// the database snapshot and connection while retaining the mmap-backed embeddings.
pub struct Sample<'client> {
    embeddings: FloatBytes,
    transaction: Transaction<'client>,
    from_cache: bool,
}

impl<'client> Sample<'client> {
    /// Loads sampled embeddings and materializes their identity mapping.
    ///
    /// With a warm cache (both `sample.f32` and `sample.pgcopy` exist under
    /// `out`), the identity mapping is restored into the temporary table via
    /// binary `COPY` and no new sample is drawn. Otherwise a fresh Bernoulli
    /// sample seeded by `seed` is drawn, exported, and published to the cache
    /// through temporary-file hotswaps.
    ///
    /// Only entities with a live (non-draft) whole-entity embedding are
    /// sampled. Each sampled row receives a contiguous index starting at
    /// zero; row `i` of the returned embeddings corresponds to sample index
    /// `i` in the mapping table.
    ///
    /// # Errors
    ///
    /// Returns an error when the cache files cannot be read or written, when
    /// a database operation fails, or when the cached embedding and mapping
    /// row counts disagree (for example after a partial cache write).
    pub async fn load(
        client: &'client mut Client,
        out: impl AsRef<Utf8Path>,
        seed: u64,
        options: SampleOptions,
    ) -> Result<Self, SampleError> {
        let out = out.as_ref();
        let embeddings_path = embeddings_path(out);
        let mappings_path = mappings_path(out);

        let (embeddings_exists, mappings_exists) = future::join!(
            fs::try_exists(&embeddings_path),
            fs::try_exists(&mappings_path),
        )
        .await;
        let cache_exists = embeddings_exists? && mappings_exists?;

        let transaction = client
            .build_transaction()
            .isolation_level(IsolationLevel::RepeatableRead)
            .start()
            .await?;

        let mapping_rows = if cache_exists {
            tracing::info!(cache = %out, "restoring sampled identities from the cache");
            let mut file = fs::File::open(&mappings_path).await?;
            load_mapping(&transaction, &mut file).await?
        } else {
            tracing::info!(cache = %out, seed, "drawing a fresh sample");
            write_sample(&transaction, out, seed, options).await?
        };

        let embeddings_file = fs::File::open(embeddings_path).await?.into_std().await;
        let embeddings = FloatBytes::from_file(embeddings_file, options.dim.value().into())?;

        if usize::try_from(mapping_rows).ok() != Some(embeddings.len()) {
            return Err(SampleError::CacheRowCount {
                embeddings: embeddings.len(),
                mappings: mapping_rows,
            });
        }

        Ok(Self {
            embeddings,
            transaction,
            from_cache: cache_exists,
        })
    }

    /// The sampled embeddings, one row per sample index.
    pub const fn embeddings(&self) -> &FloatBytes {
        &self.embeddings
    }

    /// Whether this sample was restored from the on-disk cache.
    ///
    /// A cached sample restores the exact identity mapping of the previous
    /// run, so its row ordering is guaranteed to match any layout fitted
    /// from the same cache.
    pub const fn from_cache(&self) -> bool {
        self.from_cache
    }

    /// Preprocesses sampled relations in PostgreSQL and returns their stable hubs and adjacency.
    pub async fn relations(
        &self,
        hub_quantile: f64,
        hub_min_ratio: f64,
    ) -> Result<Relations<'_>, SampleError> {
        prepare_relations(&self.transaction, hub_quantile, hub_min_ratio).await
    }

    /// Commits the short-lived database snapshot and returns the embeddings used for training.
    pub async fn finish(self) -> Result<FloatBytes, SampleError> {
        let Self {
            embeddings,
            transaction,
            from_cache: _,
        } = self;

        transaction.commit().await?;
        Ok(embeddings)
    }
}
