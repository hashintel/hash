//! The dump command that writes an offline dataset from the live store.
//!
//! One invocation drains the store's snapshot into a directory an
//! [`OfflineDataset`](crate::dataset::offline::OfflineDataset) accepts, embeddings included, so a
//! fit can run on a machine that reaches neither Postgres nor the embedding provider. The command
//! embeds through the same fingerprinted provider contract the fit records, and the manifest
//! seals the directory last, so an interrupted dump leaves a directory the reader refuses.

use core::{error::Error, fmt, num::NonZero, time::Duration};
use std::time::Instant;

use camino::Utf8PathBuf;
use clap::{Args, ValueHint};
use tokio_postgres::Client;

use super::embedder::{self, EmbedderArgs, EmbedderError};
use crate::{
    dataset::{
        TemporalAxes,
        offline::{
            dump::{Dump, DumpError as OfflineDumpError, DumpOptions, embed, read},
            format::{CanonicalCoverage, StreamKind},
        },
        postgres::{PostgresDataset, PostgresDatasetError},
    },
    progress::NoProgress,
    salt::{
        embedding::external::ExternalEmbeddingError,
        fit::{SuppliedAnnotations, annotations::SupplyError as AnnotationSupplyError},
        policy::annotation::assembly::AssemblyConfig,
    },
};

/// Coverage and supply settings of one dump.
#[derive(Debug, Args)]
pub struct DumpArgs {
    /// The output directory of the dump, created when absent.
    #[arg(long, value_hint = ValueHint::DirPath)]
    output: Utf8PathBuf,

    /// The fit seed the canonical sample derives from.
    ///
    /// Under probe coverage an offline fit replays the sample from its own seed, so the fit's
    /// seed must equal this one.
    #[arg(long, env = "HASH_GRAPH_ATLAS_SEED", default_value_t = 0)]
    seed: u64,

    /// Sampled anchor rows of the admission probe.
    #[arg(long, default_value = "1024")]
    anchors: NonZero<usize>,

    /// Sampled comparison rows of the admission probe.
    #[arg(long, default_value = "4096")]
    comparisons: NonZero<usize>,

    /// Dump every node's canonical embedding instead of the probe sample.
    ///
    /// Trades dump size for freedom in the offline fit's probe parameters.
    #[arg(long)]
    all_canonicals: bool,

    /// Path of the annotation-corpus document the offline fit will run with.
    ///
    /// The dump assembles the corpus and merges its card embeddings into the dump, so the offline
    /// fit resolves every text it renders. A fit supplied with a corpus the dump never assembled
    /// would request embeddings the dump does not hold.
    #[arg(long, env = "HASH_GRAPH_ATLAS_ANNOTATIONS", value_hint = ValueHint::FilePath)]
    annotations: Option<Utf8PathBuf>,

    /// The embedding provider's credential.
    #[command(flatten)]
    credential: EmbedderArgs,
}

/// One dump invocation's failure, by step.
///
/// The embedder and dump variants splice into the chain transparently (their display text and
/// sources are the wrapped fault's, unchanged). The other variants name their own step.
#[expect(
    private_interfaces,
    reason = "the dump variant's payload is reachable outside the crate as a `dyn Error` source \
              alone, and naming its concrete type stays an in-crate capability"
)]
#[derive(Debug)]
pub enum DumpError {
    /// Admitting the supplied annotation-corpus document failed.
    Annotations(AnnotationSupplyError),
    /// Producing the embedding provider failed.
    Embedder(EmbedderError),
    /// The store could not open a snapshot transaction.
    Snapshot(PostgresDatasetError),
    /// Writing the dump directory failed.
    Dump(OfflineDumpError<PostgresDatasetError, ExternalEmbeddingError>),
}

impl fmt::Display for DumpError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Annotations(_) => {
                fmt.write_str("the supplied annotation-corpus document was refused")
            }
            Self::Embedder(error) => fmt::Display::fmt(error, fmt),
            Self::Snapshot(_) => fmt.write_str("the store could not open a snapshot transaction"),
            Self::Dump(error) => fmt::Display::fmt(error, fmt),
        }
    }
}

impl Error for DumpError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Annotations(error) => Some(error),
            Self::Embedder(error) => error.source(),
            Self::Snapshot(error) => Some(error),
            Self::Dump(error) => error.source(),
        }
    }
}

/// One dump's verdict.
///
/// The command's product, which its host renders rather than printing in place. The rendering
/// reads each stream's record count and file length from the finished dump, together with the
/// canonical coverage, the output directory, and the wall time.
#[derive(Debug)]
pub struct DumpVerdict {
    /// Where the dump landed.
    directory: Utf8PathBuf,
    /// The sealed manifest beside the written record counts.
    dump: Dump,
    /// How long the dump took.
    elapsed: Duration,
}

impl fmt::Display for DumpVerdict {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(fmt)?;
        for kind in StreamKind::ALL {
            let stream = self.dump.manifest.streams.get(kind);
            writeln!(
                fmt,
                "{:<26} {} records, {} bytes",
                kind.file_name(),
                self.dump.records.get(kind),
                stream.bytes,
            )?;
        }
        match self.dump.manifest.coverage {
            CanonicalCoverage::Probe {
                seed,
                anchors,
                comparisons,
            } => writeln!(
                fmt,
                "{:<26} probe (seed {seed}, anchors {anchors}, comparisons {comparisons})",
                "coverage",
            )?,
            CanonicalCoverage::All => writeln!(fmt, "{:<26} all nodes", "coverage")?,
        }
        writeln!(fmt, "{:<26} {}", "directory", self.directory)?;
        write!(fmt, "{:<26} {:.1}s", "wall", self.elapsed.as_secs_f64())
    }
}

/// One dump invocation, resolved from its parsed flags.
#[derive(Debug)]
pub struct DumpCommand {
    args: DumpArgs,
}

impl DumpCommand {
    /// Resolves the parsed flags into one dump invocation.
    #[must_use]
    pub const fn new(args: DumpArgs) -> Self {
        Self { args }
    }

    /// Writes one dump of the live store and returns its verdict.
    ///
    /// The hosting binary supplies the dialed store connection. This call pins the snapshot, so
    /// the dump reads the store as of the moment the command starts, and the manifest records the
    /// snapshot's temporal axes for the offline fit to replay. The snapshot closes once the
    /// store's streams are drained, so no transaction stays open while the embedding pass
    /// round-trips to the provider.
    ///
    /// # Errors
    ///
    /// Returns a [`DumpError`] naming the step that failed, in the order the steps run:
    ///
    /// - [`DumpError::Annotations`] when the supplied document fails admission.
    /// - [`DumpError::Embedder`] when producing the embedding provider fails.
    /// - [`DumpError::Snapshot`] when the store cannot open the snapshot transaction.
    /// - [`DumpError::Dump`] when writing the dump directory fails.
    pub async fn run(self, client: &mut Client) -> Result<DumpVerdict, DumpError> {
        // Embedders reach this entry without passing through the shell's main.
        crate::math::kernel::verify_cpu_baseline();

        tracing::info!(
            output = %self.args.output,
            seed = self.args.seed,
            anchors = self.args.anchors.get(),
            comparisons = self.args.comparisons.get(),
            all_canonicals = self.args.all_canonicals,
            annotations = ?self.args.annotations,
            "starting the dump"
        );

        // The corpus admits before the provider spends a request, and the provider preflights
        // before the dump reads the store: each step fails ahead of everything costlier.
        let supplied = self
            .args
            .annotations
            .as_deref()
            .map(SuppliedAnnotations::open)
            .transpose()
            .map_err(DumpError::Annotations)?;

        let embedder = embedder::openai(self.args.credential.into_key(), NoProgress)
            .await
            .map_err(DumpError::Embedder)?;

        let started = Instant::now();
        let options = DumpOptions {
            seed: self.args.seed,
            anchors: self.args.anchors,
            comparisons: self.args.comparisons,
            all_canonicals: self.args.all_canonicals,
            annotations: supplied.as_ref().map(SuppliedAnnotations::document),
            // The fit's own configuration takes this same crate default, so the dump embeds
            // exactly the texts the offline fit's assembly will render. A fit run with a
            // different assembly requests texts the dump never embedded, and the offline
            // embedder refuses them by hash rather than serving stale vectors.
            assembly: AssemblyConfig { .. },
        };

        let dataset = PostgresDataset::new(client, TemporalAxes::now())
            .await
            .map_err(DumpError::Snapshot)?;
        let reading = read(&dataset, &self.args.output, &options)
            .await
            .map_err(DumpError::Dump)?;
        // The reading borrows nothing from the dataset, so the snapshot transaction ends here
        // rather than spanning the provider round-trips below.
        drop(dataset);

        let finished = embed(&embedder, reading, &self.args.output, &options, &NoProgress)
            .await
            .map_err(DumpError::Dump)?;

        Ok(DumpVerdict {
            directory: self.args.output,
            dump: finished,
            elapsed: started.elapsed(),
        })
    }
}
