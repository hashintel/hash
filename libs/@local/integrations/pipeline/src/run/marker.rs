//! Immutable completion markers select exactly one fully published output.
use error_stack::Report;
use serde::{Serialize, de::DeserializeOwned};

use super::{Code, error};
use crate::{ArtifactKey, Format, RunContext, StageError, storage::Bound};

pub(crate) async fn finished<T: DeserializeOwned>(
    context: &RunContext,
    key: &ArtifactKey,
) -> Result<Option<T>, Report<StageError>> {
    let Some(artifact) = context.storage.bound(key).await.map_err(error::artifact)? else {
        return Ok(None);
    };
    let path = context.fetch(&artifact).await?;
    let bytes = tokio::fs::read(path).await.map_err(error::scratch)?;
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(error::stored_json)
}

#[expect(
    clippy::future_not_send,
    reason = "the agreed generic contract accepts all serializable outputs; concrete checkpoint \
              outputs are Sync"
)]
pub(crate) async fn finish<T: Serialize + DeserializeOwned>(
    context: &RunContext,
    key: &ArtifactKey,
    output: &T,
) -> Result<T, Report<StageError>> {
    let bytes = serde_json::to_vec(output).map_err(error::stored_json)?;
    let path = context.scratch_file(Format::Json);
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(error::scratch)?;
    let artifact = context.publish(&path, Format::Json).await?;
    match context
        .storage
        .bind(key, &artifact)
        .await
        .map_err(error::artifact)?
    {
        Bound::Created => serde_json::from_slice(&bytes).map_err(error::stored_json),
        Bound::Exists => finished(context, key)
            .await?
            .ok_or_else(|| Code::StorageUnavailable.report()),
    }
}
