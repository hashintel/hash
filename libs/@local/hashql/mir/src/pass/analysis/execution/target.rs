use hashql_core::id;

use super::iter::{EmptyIntoIter, ExactSizeIntoIterator};
use crate::pass::simplify_type_name;

id::newtype!(
    pub struct TargetId(u32 is 0..=0xFFFF_FF00)
);

impl TargetId {
    pub const EMBEDDING: Self = Self(0x0000_0002);
    pub const INTERPRETER: Self = Self(0x0000_0001);
    pub const POSTGRES: Self = Self(0x0000_0000);
}

pub trait ExecutionTarget {
    const EMBEDDED: bool = !<Self::HostsIntoIter as ExactSizeIntoIterator>::GUARANTEED_EMPTY;
    type HostsIntoIter: ExactSizeIntoIterator<Item = TargetId>;

    fn id(&self) -> TargetId;

    fn name(&self) -> &str {
        const { simplify_type_name(core::any::type_name::<Self>()) }
    }

    fn hosts(&self) -> Self::HostsIntoIter;
}

pub struct Postgres;

impl ExecutionTarget for Postgres {
    type HostsIntoIter = EmptyIntoIter<TargetId>;

    fn id(&self) -> TargetId {
        TargetId::POSTGRES
    }

    fn hosts(&self) -> Self::HostsIntoIter {
        EmptyIntoIter::new()
    }
}

pub struct Interpreter;

impl ExecutionTarget for Interpreter {
    type HostsIntoIter = EmptyIntoIter<TargetId>;

    fn id(&self) -> TargetId {
        TargetId::INTERPRETER
    }

    fn hosts(&self) -> Self::HostsIntoIter {
        EmptyIntoIter::new()
    }
}

pub struct Embedding;

impl ExecutionTarget for Embedding {
    type HostsIntoIter = impl ExactSizeIterator<Item = TargetId>;

    fn id(&self) -> TargetId {
        TargetId::EMBEDDING
    }

    fn hosts(&self) -> Self::HostsIntoIter {
        [TargetId::POSTGRES].into_iter()
    }
}
