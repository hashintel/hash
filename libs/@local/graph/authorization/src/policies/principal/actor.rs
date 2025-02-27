use cedar_policy_core::ast;

use super::{
    machine::{Machine, MachineId},
    user::{User, UserId},
};
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

#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Actor {
    User(User),
    Machine(Machine),
}

impl Actor {
    #[must_use]
    pub const fn id(&self) -> ActorId {
        match self {
            Self::User(user) => ActorId::User(user.id),
            Self::Machine(machine) => ActorId::Machine(machine.id),
        }
    }

    pub(crate) fn to_cedar_entity(&self) -> ast::Entity {
        match self {
            Self::User(user) => user.to_entity(),
            Self::Machine(machine) => machine.to_entity(),
        }
    }
}
