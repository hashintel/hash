use cedar_policy_core::ast;
use uuid::Uuid;

use super::{
    machine::{Machine, MachineId},
    user::{User, UserId},
};
use crate::policies::cedar::CedarEntityId as _;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub enum ActorId {
    User(UserId),
    Machine(MachineId),
}

impl ActorId {
    #[must_use]
    pub const fn as_uuid(&self) -> &Uuid {
        match self {
            Self::User(id) => id.as_uuid(),
            Self::Machine(id) => id.as_uuid(),
        }
    }

    pub(crate) fn to_euid(self) -> ast::EntityUID {
        match self {
            Self::User(id) => id.to_euid(),
            Self::Machine(id) => id.to_euid(),
        }
    }
}

#[derive(Debug)]
pub enum Actor {
    User(User),
    Machine(Machine),
}
