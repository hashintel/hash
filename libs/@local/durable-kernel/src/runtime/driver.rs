use alloc::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

use error_stack::{Report, ResultExt as _};
use tokio_util::{sync::CancellationToken, task::AbortOnDropHandle};

use super::{DriverSettings, KernelError, SnapshotPolicy};
use crate::{
    domain::{self, EventRecordV1, Executor, Hosted, PartitionKey, SimpleDomain, effect_id},
    ids::EffectId,
    shard_log::{
        ShardCommandError, ShardCommandErrorKind, ShardCommandHandle, ShardCommandOutcome,
        ShardOwner, StateChangeFeed,
    },
};

fn settle_driver_error(
    error: Report<ShardCommandError>,
    shutdown: &CancellationToken,
) -> Result<(), Report<KernelError>> {
    if shutdown.is_cancelled() {
        Ok(())
    } else {
        Err(error.change_context(KernelError::Command))
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
enum EffectError {
    #[display("effect execution failed")]
    Execution,
    #[display("effect execution panicked")]
    Panicked,
}

async fn execute_effect<S, X>(
    executor: Arc<X>,
    effect: X::Effect,
    id: &EffectId,
) -> Result<Result<Vec<S::Event>, domain::Retry<EffectError>>, Report<KernelError>>
where
    S: SimpleDomain,
    X: Executor<S>,
{
    match AbortOnDropHandle::new(tokio::spawn(async move { executor.execute(&effect).await })).await
    {
        Ok(Ok(events)) => Ok(Ok(events)),
        Ok(Err(retry)) => Ok(Err(domain::Retry {
            reason: retry.reason.change_context(EffectError::Execution),
            after: retry.after,
        })),
        Err(error) if error.is_panic() => {
            tracing::warn!(%error, effect_id = %id, "effect panicked; retrying later");
            Ok(Err(domain::Retry {
                reason: Report::new(error).change_context(EffectError::Panicked),
                after: None,
            }))
        }
        Err(error) => {
            Err(Report::new(error)
                .change_context(KernelError::EffectTaskCancelled { effect_id: *id }))
        }
    }
}

fn retain_planned_effects<E>(
    effects: &[(EffectId, E)],
    executed: &mut BTreeSet<EffectId>,
    retries: &mut BTreeMap<EffectId, tokio::time::Instant>,
) {
    let planned_ids: BTreeSet<_> = effects.iter().map(|(id, _)| *id).collect();
    executed.retain(|id| planned_ids.contains(id));
    retries.retain(|id, _| planned_ids.contains(id));
}

fn collect_plan<S, X>(executor: &X, projection: &S::Projection) -> Vec<X::Effect>
where
    S: SimpleDomain,
    X: Executor<S>,
{
    executor.plan(projection).into_iter().collect()
}

async fn maybe_snapshot<S: SimpleDomain>(
    handle: &ShardCommandHandle<Hosted<S>>,
    policy: SnapshotPolicy,
) {
    let SnapshotPolicy::Every(interval) = policy else {
        return;
    };
    match handle.capture_snapshot(interval.get()).await {
        Ok(Some(payload)) => {
            let record = payload.into_record(chrono::Utc::now());
            if let Err(error) = handle.commit_snapshot(record).await {
                tracing::warn!(error = ?error, "snapshot save failed; recovery will replay more events");
            }
        }
        Ok(None) => {}
        Err(error) => {
            tracing::debug!(error = ?error, "could not capture snapshot");
        }
    }
}

#[expect(
    clippy::integer_division_remainder_used,
    reason = "tokio select uses modulo to choose its polling order"
)]
async fn drive_shard<S, X>(
    handle: ShardCommandHandle<Hosted<S>>,
    mut state_changes: StateChangeFeed<PartitionKey>,
    executor: Arc<X>,
    settings: DriverSettings,
    shutdown: CancellationToken,
) -> Result<(), Report<KernelError>>
where
    S: SimpleDomain,
    X: Executor<S>,
{
    let mut executed: BTreeSet<EffectId> = BTreeSet::new();
    let mut retries = BTreeMap::<EffectId, tokio::time::Instant>::new();

    loop {
        if shutdown.is_cancelled() {
            return Ok(());
        }

        let planner = Arc::clone(&executor);
        let effects = match handle
            .read(move |projection| collect_plan(planner.as_ref(), projection.domain()))
            .await
        {
            Ok(effects) => effects,
            Err(error) => return settle_driver_error(error, &shutdown),
        };

        let effects = effects
            .into_iter()
            .map(|effect| effect_id(&effect).map(|id| (id, effect)))
            .collect::<Result<Vec<_>, _>>()
            .change_context(KernelError::EncodeEffectId)?;
        retain_planned_effects(&effects, &mut executed, &mut retries);

        let mut progressed = false;
        for (id, effect) in effects {
            if shutdown.is_cancelled() {
                return Ok(());
            }

            if executed.contains(&id)
                || retries
                    .get(&id)
                    .is_some_and(|deadline| *deadline > tokio::time::Instant::now())
            {
                continue;
            }

            match execute_effect::<S, X>(Arc::clone(&executor), effect, &id).await? {
                Ok(events) => {
                    for event in events {
                        let record = EventRecordV1::new(event)
                            .change_context(KernelError::BuildCompletionEvent { effect_id: id })?;
                        let event_id = record.event_id();

                        match handle.propose(record).await {
                            Ok(
                                ShardCommandOutcome::Applied { .. }
                                | ShardCommandOutcome::AlreadyDurable { .. },
                            ) => {}
                            Ok(ShardCommandOutcome::Rejected { rejection }) => {
                                return Err(Report::<KernelError>::from(rejection).change_context(
                                    KernelError::CompletionEventRejected {
                                        effect_id: id,
                                        event_id,
                                    },
                                ));
                            }
                            Err(error) => {
                                return settle_driver_error(error, &shutdown).change_context(
                                    KernelError::SubmitCompletionEvent {
                                        effect_id: id,
                                        event_id,
                                    },
                                );
                            }
                        }
                    }

                    retries.remove(&id);
                    executed.insert(id);
                    progressed = true;
                }
                Err(retry) => {
                    tracing::debug!(reason = ?retry.reason, effect_id = %id, "effect execution failed; retrying later");
                    let delay = retry.after.unwrap_or(settings.poll_interval);
                    let Some(deadline) = tokio::time::Instant::now().checked_add(delay) else {
                        return Err(retry.reason.change_context(
                            KernelError::RetryDelayOutOfRange {
                                effect_id: id,
                                delay,
                            },
                        ));
                    };

                    retries.insert(id, deadline);
                }
            }
        }

        maybe_snapshot(&handle, settings.snapshot_policy).await;

        let now = tokio::time::Instant::now();
        retries.retain(|_, deadline| *deadline > now);

        if !progressed {
            let delay = retries
                .values()
                .map(|deadline| deadline.saturating_duration_since(now))
                .min()
                .unwrap_or(settings.poll_interval)
                .min(settings.poll_interval);

            tokio::select! {
                () = shutdown.cancelled() => return Ok(()),
                _changed = state_changes.receiver.recv() => {}
                () = tokio::time::sleep(delay) => {}
            }
        }
    }
}

pub(super) async fn run_shard<S, X>(
    owner: ShardOwner<Hosted<S>>,
    handle: ShardCommandHandle<Hosted<S>>,
    state_changes: StateChangeFeed<PartitionKey>,
    executor: Arc<X>,
    settings: DriverSettings,
    shutdown: CancellationToken,
) -> Result<(), Report<KernelError>>
where
    S: SimpleDomain,
    X: Executor<S>,
{
    let driver = AbortOnDropHandle::new(tokio::spawn(drive_shard::<S, X>(
        handle.clone(),
        state_changes,
        executor,
        settings,
        shutdown,
    )));
    let result = driver
        .await
        .change_context(KernelError::JoinEffectDriver)
        .flatten()
        .change_context(KernelError::ShardDriver {
            shard: handle.shard(),
        });
    if let Err(error) = result {
        drop(owner);
        tracing::error!(?error, "effect driver failed; shard stopped");
        return Err(error);
    }
    if let Err(error) = owner.shutdown().await
        && error.current_context().kind() != ShardCommandErrorKind::Closed
    {
        return Err(error.change_context(KernelError::Command).change_context(
            KernelError::ShardDriver {
                shard: handle.shard(),
            },
        ));
    }
    Ok(())
}
