use core::time::Duration;

use error_stack::Report;

use crate::{
    domain,
    ids::{EffectId, EventId},
    routing::Shard,
};

#[derive(Debug, PartialEq, Eq, derive_more::Display, derive_more::Error)]
/// Describes a configuration, storage, or runtime failure. The kernel returns it in an
/// [`error_stack::Report`].
pub enum KernelError {
    #[display("at least one owned shard is required")]
    NoOwnedShards,
    #[display("could not register domain records")]
    RegisterDomain,
    #[display("could not construct event record")]
    BuildEventRecord,
    #[display("event validation failed")]
    ValidateEvent,
    #[display("event {event_id} was rejected")]
    EventRejected { event_id: EventId },
    #[display("invalid storage configuration for shard {}", shard.get())]
    ConfigureStorage { shard: Shard },
    #[display("shard command failed")]
    Command,
    #[display("partition routes to shard {}, which this kernel does not own", shard.get())]
    NotOwned { shard: Shard },
    #[display("could not join shard driver task")]
    JoinShardDriver,
    #[display("could not join shard command loop task")]
    JoinCommandLoop,
    #[display("could not join effect driver task")]
    JoinEffectDriver,
    #[display("driver for shard {} failed", shard.get())]
    ShardDriver { shard: Shard },
    #[display("effect {effect_id} task was cancelled")]
    EffectTaskCancelled { effect_id: EffectId },
    #[display("could not encode effect ID")]
    EncodeEffectId,
    #[display("could not construct completion event for effect {effect_id}")]
    BuildCompletionEvent { effect_id: EffectId },
    #[display("could not submit completion event {event_id} for effect {effect_id}")]
    SubmitCompletionEvent {
        effect_id: EffectId,
        event_id: EventId,
    },
    #[display("completion event {event_id} for effect {effect_id} was rejected")]
    CompletionEventRejected {
        effect_id: EffectId,
        event_id: EventId,
    },
    #[display("retry delay {delay:?} for effect {effect_id} is out of range")]
    RetryDelayOutOfRange {
        effect_id: EffectId,
        delay: Duration,
    },
}

impl<R: core::error::Error + Send + Sync + 'static> From<domain::FoldError<R>>
    for Report<KernelError>
{
    fn from(error: domain::FoldError<R>) -> Self {
        match error {
            domain::FoldError::InvalidRecord(error) => {
                error.change_context(KernelError::ValidateEvent)
            }
            domain::FoldError::Rejected {
                event_id,
                rejection,
            } => rejection.change_context(KernelError::EventRejected { event_id }),
            error @ (domain::FoldError::ForeignShard { .. }
            | domain::FoldError::ConflictingReuse { .. }
            | domain::FoldError::NonIncreasingSequence { .. }) => {
                Report::new(error).change_context(KernelError::ValidateEvent)
            }
        }
    }
}
