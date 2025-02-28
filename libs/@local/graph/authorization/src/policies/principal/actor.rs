use core::fmt;

use cedar_policy_core::ast;

use super::{
    machine::{Machine, MachineId},
    user::{User, UserId},
};
use crate::policies::cedar::CedarEntityId as _;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
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

impl fmt::Display for ActorId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::User(id) => fmt::Display::fmt(id, f),
            Self::Machine(id) => fmt::Display::fmt(id, f),
        }
    }
}

#[derive(Debug)]
pub enum Actor {
    User(User),
    Machine(Machine),
}
