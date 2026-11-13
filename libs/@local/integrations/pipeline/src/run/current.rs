//! Conditional current-state transitions and sending authority.
use bytes::Bytes;
use error_stack::Report;
use serde::{Deserialize, Serialize};

use super::{Code, RunContext, RunId, StageError, error};
use crate::storage::MutableVersion;

/// The committed baseline and uncommitted senders, oldest first.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Current {
    pub committed: Option<RunId>,
    pub sending: Vec<RunId>,
}

async fn versioned(
    context: &RunContext,
) -> Result<(Current, Option<MutableVersion>), Report<StageError>> {
    match context
        .storage
        .read_versioned(&context.namespace.current())
        .await
        .map_err(error::artifact)?
    {
        Some(object) => Ok((
            serde_json::from_slice(&object.bytes).map_err(error::stored_json)?,
            Some(object.version),
        )),
        None => Ok((Current::default(), None)),
    }
}
pub(crate) async fn read(context: &RunContext) -> Result<Current, Report<StageError>> {
    versioned(context).await.map(|(current, _)| current)
}

fn check_base(
    current: &Current,
    run: RunId,
    base: Option<RunId>,
    resent: &[RunId],
) -> Result<(), Report<StageError>> {
    if current.committed != base {
        return Err(Code::BaseMoved.report());
    }
    if current
        .sending
        .iter()
        .any(|sender| *sender != run && !resent.contains(sender))
    {
        return Err(Code::Superseded.report());
    }
    Ok(())
}
fn check_authority(
    current: &Current,
    run: RunId,
    base: Option<RunId>,
    resent: &[RunId],
) -> Result<(), Report<StageError>> {
    check_base(current, run, base, resent)?;
    if current.sending.last() != Some(&run) {
        return Err(Code::Superseded.report());
    }
    Ok(())
}

pub(crate) async fn mark_sending(
    context: &RunContext,
    run: RunId,
    base: Option<RunId>,
    resent: &[RunId],
) -> Result<(), Report<StageError>> {
    for _ in 0..8 {
        let (mut current, version) = versioned(context).await?;
        check_base(&current, run, base, resent)?;
        if current.sending.contains(&run) {
            return check_authority(&current, run, base, resent);
        }
        current.sending.push(run);
        let bytes = Bytes::from(serde_json::to_vec(&current).map_err(error::stored_json)?);
        if context
            .storage
            .replace_if(&context.namespace.current(), version.as_ref(), bytes)
            .await
            .map_err(error::artifact)?
        {
            return Ok(());
        }
    }
    Err(Code::StorageUnavailable.report())
}

pub(crate) async fn check_sending(
    context: &RunContext,
    run: RunId,
    base: Option<RunId>,
    resent: &[RunId],
) -> Result<(), Report<StageError>> {
    check_authority(&read(context).await?, run, base, resent)
}

pub(crate) async fn commit(
    context: &RunContext,
    run: RunId,
    base: Option<RunId>,
    resent: &[RunId],
) -> Result<(), Report<StageError>> {
    for _ in 0..8 {
        let (mut current, version) = versioned(context).await?;
        if current.committed == Some(run) {
            return Ok(());
        }
        check_authority(&current, run, base, resent)?;
        current.committed = Some(run);
        current
            .sending
            .retain(|sender| *sender != run && !resent.contains(sender));
        let bytes = Bytes::from(serde_json::to_vec(&current).map_err(error::stored_json)?);
        if context
            .storage
            .replace_if(&context.namespace.current(), version.as_ref(), bytes)
            .await
            .map_err(error::artifact)?
        {
            return Ok(());
        }
    }
    Err(Code::StorageUnavailable.report())
}
