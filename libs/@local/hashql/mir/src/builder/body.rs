use core::ops::Deref;

use hashql_core::{
    heap::{self, Heap},
    id::Id as _,
    span::SpanId,
    r#type::{TypeId, builder::IntoSymbol},
};

use super::{base::BaseBuilder, basic_block::BasicBlockBuilder};
use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockVec},
        basic_blocks::BasicBlocks,
        local::{Local, LocalDecl, LocalVec},
        place::Place,
        terminator::{Terminator, TerminatorKind},
    },
    def::DefId,
    intern::Interner,
};

const PLACEHOLDER_TERMINATOR: Terminator<'static> = Terminator {
    span: SpanId::SYNTHETIC,
    kind: TerminatorKind::Unreachable,
};

/// Builder for constructing MIR bodies.
///
/// Use this to declaratively build MIR for testing and benchmarking purposes.
///
/// # Workflow
///
/// 1. Create locals with [`local`](Self::local)
/// 2. Reserve blocks with [`reserve_block`](Self::reserve_block)
/// 3. Build each block with [`build_block`](Self::build_block), adding statements and a terminator
/// 4. Finalize with [`finish`](Self::finish)
///
/// Use the [`scaffold!`] macro to set up the required infrastructure.
pub struct BodyBuilder<'env, 'heap> {
    base: BaseBuilder<'env, 'heap>,
    local_decls: LocalVec<LocalDecl<'heap>, &'heap Heap>,
    pub(super) blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    pub(super) finished: Vec<bool>,
}

impl<'env, 'heap> BodyBuilder<'env, 'heap> {
    /// Creates a new body builder with the given interner.
    ///
    /// Prefer using the [`scaffold!`] macro which sets up both the heap and interner.
    #[must_use]
    pub const fn new(interner: &'env Interner<'heap>) -> Self {
        Self {
            base: BaseBuilder { interner },
            local_decls: LocalVec::new_in(interner.heap),
            blocks: BasicBlockVec::new_in(interner.heap),
            finished: Vec::new(),
        }
    }

    /// Declares a new local variable with the given name and type.
    ///
    /// Returns a [`Place`] that can be used in statements and as operands.
    pub fn local(&mut self, name: impl IntoSymbol<'heap>, ty: TypeId) -> Place<'heap> {
        let decl = LocalDecl {
            span: SpanId::SYNTHETIC,
            r#type: ty,
            name: Some(name.intern_into_symbol(self.interner.heap)),
        };
        let local = self.local_decls.push(decl);

        Place::local(local, self.interner)
    }

    /// Reserves a new basic block and returns its ID.
    ///
    /// The block is initialized with a placeholder terminator. Use
    /// [`build_block`](Self::build_block) to fill in the actual contents. Blocks can optionally
    /// have parameters (similar to function parameters) that receive values from predecessor
    /// blocks.
    pub fn reserve_block(&mut self, params: impl AsRef<[Local]>) -> BasicBlockId {
        let params = self.interner.locals.intern_slice(params.as_ref());

        self.finished.push(false);
        self.blocks.push(BasicBlock {
            params,
            statements: heap::Vec::new_in(self.interner.heap),
            terminator: PLACEHOLDER_TERMINATOR.clone(),
        })
    }

    /// Starts building a previously reserved block.
    ///
    /// # Panics
    ///
    /// Panics if the block ID is invalid.
    #[must_use]
    pub fn build_block(&mut self, block: BasicBlockId) -> BasicBlockBuilder<'_, 'env, 'heap> {
        let statements = heap::Vec::new_in(self.interner.heap);

        BasicBlockBuilder {
            base: self.base,
            body: self,
            block,
            statements,
        }
    }

    /// Finalizes the body.
    ///
    /// # Panics
    ///
    /// Panics if any block still has a placeholder terminator (wasn't built).
    #[must_use]
    pub fn finish(self, args: usize, return_ty: TypeId) -> Body<'heap> {
        // Validate all blocks have been built
        assert!(
            self.finished.iter().all(|&finished| finished),
            "unfinished blocks"
        );

        Body {
            id: DefId::MAX,
            span: SpanId::SYNTHETIC,
            return_type: return_ty,
            source: Source::Intrinsic(DefId::MAX),
            local_decls: self.local_decls,
            basic_blocks: BasicBlocks::new(self.blocks),
            args,
        }
    }
}

impl<'env, 'heap> Deref for BodyBuilder<'env, 'heap> {
    type Target = BaseBuilder<'env, 'heap>;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

#[macro_export]
macro_rules! body {
    (
        $interner:ident, $env:ident;
        $type:ident @ $id:literal / $arity:literal -> $body_type:tt {
            decl $($param:ident: $param_type:tt),*;

            $($block:ident($($block_param:ident),*) $block_body:tt),+
        }
    ) => {{
        let mut builder = $crate::builder::BodyBuilder::new(&$interner);
        let types =  hashql_core::r#type::TypeBuilder::synthetic(&$env);

        $(
            let $param = builder.local(stringify!($param), $crate::builder::body!(@type types; $param_type));
        )*

        $(
            let $block = builder.reserve_block([$($block_param.local),*]);
        )*

        $(
            #[expect(clippy::allow_attributes)]
            #[allow(unused_mut)]
            let mut bb_builder = builder.build_block($block);

            $crate::builder::_private::bb!(bb_builder; $block_body);
        )*

        let mut body = builder.finish($arity, $crate::builder::body!(@type types; $body_type));
        body.source = $crate::builder::body!(@source $type);
        body.id = $crate::def::DefId::new($id);

        body
    }};

    (@type $types:ident; Int) => {
        $types.integer()
    };
    (@type $types:ident; ($($sub:tt),*)) => {
        $types.tuple([$($crate::builder::body!(@type $types; $sub)),*])
    };
    (@type $types:ident; Bool) => {
        $types.boolean()
    };
    (@type $types:ident; $other:expr) => {
        $other($types)
    };

    (@source thunk) => {
        $crate::body::Source::Thunk(hashql_hir::node::HirId::PLACEHOLDER, None)
    };
    (@source fn) => {
        $crate::body::Source::Closure(hashql_hir::node::HirId::PLACEHOLDER, None)
    };
}

pub use body;
