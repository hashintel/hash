use hashql_core::{
    id::{Id, IdVec},
    intern::Interned,
    module::std_lib::{core::json, graph::types::knowledge::entity::types::entity},
    span::SpanId,
    symbol::sym,
    r#type::{TypeBuilder, environment::Environment},
};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockVec},
        basic_blocks::BasicBlocks,
        local::LocalDecl,
        terminator::{Terminator, TerminatorKind},
    },
    def::DefId,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Id)]
#[repr(u8)]
pub enum IntrinsicId {
    EntityPropertyAccess,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Intrinsic {
    pub id: IntrinsicId,
    // Hint to any optimization passes that this intrinsic should not be optimized in any way.
    pub optimize: bool,
}
