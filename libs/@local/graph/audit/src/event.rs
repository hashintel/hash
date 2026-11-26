//! The record of one action.

use alloc::boxed::Box;
use core::fmt::Debug;

use serde_core::Serialize;
use time::OffsetDateTime;
use type_system::principal::actor_group::WebId;
use uuid::{NoContext, Timestamp, Uuid};

use crate::{
    action::{ActionName, AuditAction},
    context::AuditContext,
    target::Target,
};

/// The identifier of an audit event: a version 7 UUID, which begins with the
/// [`time`](AuditEvent::time) of its event to the millisecond.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct AuditEventId(Uuid);

impl AuditEventId {
    /// Generates the identifier of an event recorded at `time`.
    ///
    /// # Panics
    ///
    /// Panics if `time` is before the Unix epoch.
    pub(crate) fn at(time: OffsetDateTime) -> Self {
        let seconds =
            u64::try_from(time.unix_timestamp()).expect("should not be before the Unix epoch");

        Self(Uuid::new_v7(Timestamp::from_unix(
            NoContext,
            seconds,
            time.nanosecond(),
        )))
    }
}

impl From<AuditEventId> for Uuid {
    fn from(event_id: AuditEventId) -> Self {
        event_id.0
    }
}

/// How the action an audit event records ended.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Outcome {
    Success,
}

/// The view of an [`AuditAction`] that an [`AuditEvent`] holds without naming its type.
trait RecordedAction: Debug + Send + Sync {
    fn name(&self) -> ActionName;

    fn target(&self) -> Option<Target>;

    fn details(&self) -> &dyn erased_serde::Serialize;
}

impl<A> RecordedAction for A
where
    A: AuditAction + Send + Sync,
{
    fn name(&self) -> ActionName {
        A::NAME
    }

    fn target(&self) -> Option<Target> {
        AuditAction::target(self)
    }

    fn details(&self) -> &dyn erased_serde::Serialize {
        self
    }
}

/// The record of one action: who performed it, on what, when and from where.
#[derive(Debug)]
pub struct AuditEvent {
    pub id: AuditEventId,
    pub time: OffsetDateTime,
    pub context: AuditContext,
    /// The web the action took place in. The web of a user has the ID of that user.
    pub web_id: Option<WebId>,
    pub outcome: Outcome,
    action: Box<dyn RecordedAction>,
}

impl AuditEvent {
    /// Records that the actor of `context` performed `action` in `web_id` just now.
    #[must_use]
    pub fn new<A>(context: AuditContext, web_id: Option<WebId>, action: A) -> Self
    where
        A: AuditAction + Send + Sync + 'static,
    {
        let time = OffsetDateTime::now_utc();

        Self {
            id: AuditEventId::at(time),
            time,
            context,
            web_id,
            outcome: Outcome::Success,
            action: Box::new(action),
        }
    }

    /// Returns the name of the recorded action.
    #[must_use]
    pub fn action_name(&self) -> ActionName {
        self.action.name()
    }

    /// Returns the object the recorded action was performed on.
    #[must_use]
    pub fn target(&self) -> Option<Target> {
        self.action.target()
    }

    /// Returns the details of the recorded action: the serialized fields of its type.
    #[must_use]
    pub fn details(&self) -> impl Serialize + '_ {
        self.action.details()
    }
}
