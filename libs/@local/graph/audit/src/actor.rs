//! Who performed the action an audit event records.

use type_system::principal::actor::{MachineId, UserId};

/// Who performed the action an audit event records.
///
/// A service that reports an action is not its actor: the actor of a sign-in the identity
/// provider reports is the user who signed in.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AuditActor {
    User(UserId),
    Machine(MachineId),
}
