use cedar_policy_core::ast;

use super::{machine::MachineId, user::UserId};
use crate::policies::cedar::CedarEntityId as _;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ActorId {
    User(UserId),
    Machine(MachineId),
}

impl ActorId {
    pub(crate) fn to_euid(self) -> ast::EntityUID {
        match self {
            Self::User(id) => id.to_euid(),
            Self::Machine(id) => id.to_euid(),
        }
    }
}
