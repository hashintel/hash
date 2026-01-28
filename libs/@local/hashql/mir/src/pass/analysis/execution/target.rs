use hashql_core::id;

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
    fn id(&self) -> TargetId;

    fn name(&self) -> &str {
        const { simplify_type_name(core::any::type_name::<Self>()) }
    }
}

pub struct Postgres;

impl ExecutionTarget for Postgres {
    fn id(&self) -> TargetId {
        TargetId::POSTGRES
    }
}

pub struct Interpreter;

impl ExecutionTarget for Interpreter {
    fn id(&self) -> TargetId {
        TargetId::INTERPRETER
    }
}

pub struct Embedding;

impl ExecutionTarget for Embedding {
    fn id(&self) -> TargetId {
        TargetId::EMBEDDING
    }
}
