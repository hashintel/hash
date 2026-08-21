//! Runs one production generation over a dump directory.

use camino::Utf8Path;

use super::{Options, RunError, Summary, resolve, summary};
use crate::{
    dataset::offline::OfflineDataset, device::PinnedDevice, file::generation::GenerationRoot,
    progress::Progress, salt::runner::run,
};

/// Runs one production generation over the dump directory at `dump`.
///
/// The dump carries the snapshot, its temporal axes, and every embedding the run requests, so the
/// run reaches neither the store nor the embedding provider. The generation publishes under the
/// generation root at `root` exactly as a live run's does, and equal dumps under equal options
/// describe the same run.
///
/// The supplied documents resolve before the dump opens, because admitting them costs file reads
/// while opening the dump hashes every stream, so each step fails ahead of everything costlier.
///
/// # Errors
///
/// Returns a [`RunError`] naming the step that failed, in the order the steps run: admitting the
/// supplied verdicts, quality-thresholds, annotation-corpus, or classifier documents, opening the
/// dump directory, indexing its embedding stream, or the run itself.
pub(crate) async fn offline<P: Progress + Sync>(
    dump: &Utf8Path,
    root: GenerationRoot,
    device: PinnedDevice,
    options: Options<P>,
) -> Result<Summary, RunError> {
    let resolved = resolve(&options, device)?;

    let dataset = OfflineDataset::open(dump).map_err(RunError::Dump)?;
    let embedder = dataset.embedder().map_err(RunError::DumpEmbedder)?;

    let outcome = run(
        &dataset,
        &embedder,
        &resolved.classifier,
        resolved.verdicts.as_ref(),
        &root,
        &resolved.runner,
        &options.progress,
    )
    .await
    .map_err(RunError::OfflineRun)?;

    Ok(summary(&outcome))
}
