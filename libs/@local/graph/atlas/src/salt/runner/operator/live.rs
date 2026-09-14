use core::panic::UnwindSafe;

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
/// The dataset holds one repeatable-read transaction across fitting and admission at the requested
/// temporal axes. Cards embed through `embedder`, and the generation publishes under `root`.
/// Repeating the axes alone does not freeze a later transaction to the same database snapshot.
///
/// # Errors
///
/// Returns [`RunError`] when snapshot creation, supplied-document resolution or the generation run
/// fails. The snapshot opens before document resolution.
pub(crate) async fn live<P>(
    client: &mut Client,
    root: GenerationRoot,
    device: PinnedDevice,
    axes: TemporalAxes,
    options: Options<P>,
    embedder: &ExternalEmbeddingProvider<OpenAiEmbeddingClient, P::Detached>,
) -> Result<Summary, RunError>
where
    P: Progress<Detached: UnwindSafe> + Sync,
{
    let dataset = PostgresDataset::new(client, axes).await?;

    let resolved = resolve(&options, device)?;

    let outcome = run(
        &dataset,
        embedder,
        &resolved.classifier,
        resolved.verdicts.as_ref(),
        &root,
        resolved.runner,
        &options.progress,
    )
    .await?;

    Ok(summary(&outcome))
}
