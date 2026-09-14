//! Runs one production generation over a dump directory.

use camino::Utf8Path;

use super::{Options, RunError, Summary, resolve, summary};
use crate::{
    dataset::offline::OfflineDataset, device::PinnedDevice, file::generation::GenerationRoot,
    progress::Progress, salt::runner::run,
};

/// Runs one production generation over the dump directory at `dump`.
///
/// The dump supplies the snapshot and its temporal axes. All embedding requests resolve locally,
/// and the generation publishes under `root`. The dump must cover the requested canonical sample
/// and every requested card text, including texts from a supplied annotation corpus. A missing
/// embedding fails the run instead of making a provider request.
///
/// Resolving supplied documents before opening the dump rejects invalid supplies without hashing
/// the dump's streams.
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
        resolved.runner,
        &options.progress,
    )
    .await
    .map_err(RunError::OfflineRun)?;

    Ok(summary(&outcome))
}
