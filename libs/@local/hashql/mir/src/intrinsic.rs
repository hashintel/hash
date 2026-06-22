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

pub(crate) fn entity_property_access_body<'heap>(
    env: &Environment<'heap>,
    id: DefId,
    span: SpanId,
) -> Body<'heap> {
    // Intrinsic body for property access, we **cannot** mock this specific intrinsic, because it's
    // semantics are - while expressible - compile-time only. We cannot index into a struct at
    // run-time from a runtime-defined value, without sacrifing correctness guarantees the MIR
    // relies on. Meaning that indeed we must mock this specific intrinsic on all backends that
    // support it.
    let builder = TypeBuilder::spanned(span, env);

    let mut local_decls = IdVec::with_capacity_in(2, env.heap);
    local_decls.push(LocalDecl {
        span,
        r#type: entity(&builder, builder.unknown(), None),
        name: Some(sym::entity),
    });
    local_decls.push(LocalDecl {
        span,
        r#type: json::types::json_path(&builder, None),
        name: Some(sym::pointer),
    });

    let mut blocks = BasicBlockVec::with_capacity_in(1, env.heap);
    blocks.push(BasicBlock {
        params: Interned::empty(),
        statements: Vec::new_in(env.heap),
        terminator: Terminator {
            span,
            kind: TerminatorKind::Unreachable,
        },
    });
    let basic_blocks = BasicBlocks::new(blocks);

    Body {
        id,
        span,
        return_type: TypeBuilder::spanned(span, env).unknown(),
        source: Source::Intrinsic(Intrinsic {
            id: IntrinsicId::EntityPropertyAccess,
            optimize: false,
        }),
        local_decls,
        basic_blocks,
        args: 2,
    }
}
