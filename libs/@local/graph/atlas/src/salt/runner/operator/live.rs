//! Runs one production generation over a pinned store snapshot.

use hash_graph_embeddings::OpenAiEmbeddingClient;
use tokio_postgres::Client;

use super::{Options, RunError, Summary, resolve, summary};
use crate::{
    dataset::{TemporalAxes, postgres::PostgresDataset},
    device::PinnedDevice,
    file::generation::GenerationRoot,
    progress::Progress,
    salt::{embedding::external::ExternalEmbeddingProvider, runner::run},
};

/// Runs one production generation over the store's snapshot at `axes`.
///
/// The run publishes the generation under the generation root at `root`; the caller names the
/// snapshot explicitly, so equal inputs describe the same run. Cards embed through `embedder`, the
/// provider the shell constructed with its credentials.
///
/// # Errors
///
/// Returns a [`RunError`] naming the step that failed: opening the snapshot transaction, admitting
/// the supplied verdicts, quality-thresholds, annotation-corpus, or classifier documents, or the
/// run itself.
pub(crate) async fn live<P: Progress + Sync>(
    client: &mut Client,
    root: GenerationRoot,
    device: PinnedDevice,
    axes: TemporalAxes,
    options: Options<P>,
    embedder: &ExternalEmbeddingProvider<OpenAiEmbeddingClient, P::Detached>,
) -> Result<Summary, RunError> {
    let dataset = PostgresDataset::new(client, axes)
        .await
        .map_err(RunError::Snapshot)?;

    let resolved = resolve(&options, device)?;

    let outcome = run(
        &dataset,
        embedder,
        &resolved.classifier,
        resolved.verdicts.as_ref(),
        &root,
        &resolved.runner,
        &options.progress,
    )
    .await
    .map_err(RunError::Run)?;

    Ok(summary(&outcome))
}
