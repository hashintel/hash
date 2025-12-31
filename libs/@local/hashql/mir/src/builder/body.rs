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
/// See the [`body!`] macro for a more ergonomic way to construct MIR bodies.
pub struct BodyBuilder<'env, 'heap> {
    base: BaseBuilder<'env, 'heap>,
    local_decls: LocalVec<LocalDecl<'heap>, &'heap Heap>,
    pub(super) blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    pub(super) finished: Vec<bool>,
}

impl<'env, 'heap> BodyBuilder<'env, 'heap> {
    /// Creates a new body builder with the given interner.
    ///
    /// See the [`body!`] macro for a more ergonomic way to construct MIR bodies.
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

        Place::local(local)
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
    /// Panics if any block still has a placeholder terminator (wasn't built) or there are more
    /// arguments declared than local declarations.
    #[must_use]
    pub fn finish(self, args: usize, return_ty: TypeId) -> Body<'heap> {
        // Validate all blocks have been built
        assert!(
            self.finished.iter().all(|&finished| finished),
            "unfinished blocks"
        );
        assert!(args <= self.local_decls.len());

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

/// Declarative macro for constructing complete MIR bodies.
///
/// This macro provides a concise, IR-like syntax for building MIR bodies in tests.
/// It is the preferred way to construct complex MIR with multiple basic blocks.
///
/// # Syntax
///
/// ```text
/// body!(interner, env; <source> @ <id> / <arity> -> <return_type> {
///     decl <local>: <type>, ...;
///
///     <block>(<params>...) {
///         <statements>...
///     },
///     ...
/// })
/// ```
///
/// ## Header
///
/// - `<source>`: Either `fn` (closure) or `thunk`
/// - `<id>`: Numeric literal for `DefId`
/// - `<arity>`: Number of function arguments
/// - `<return_type>`: Return type (`Int`, `Bool`, tuple `(Int, Bool)`, or custom `|t| t.foo()`)
///
/// ## Types
///
/// - `Int` - Integer type
/// - `Bool` - Boolean type
/// - `(T1, T2, ...)` - Tuple types
/// - `(a: T1, b: T2)` - Struct types
/// - `[fn(T1, T2) -> R]` - Closure types (e.g., `[fn(Int) -> Int]` or `[fn() -> Int]`)
/// - `|types| types.custom()` - Custom type expression
///
/// ## Projections (optional, after decl)
///
/// ```text
/// @proj <name> = <base>.<field>: <type>, ...;
/// ```
///
/// Declares field projections for accessing struct/tuple fields as places.
/// Example: `@proj fn_ptr = closure.0: [fn(Int) -> Int], env = closure.1: Int;`.
///
/// ## Statements (inside blocks)
///
/// | Syntax | Description |
/// | ------ | ----------- |
/// | `let x;` | `StorageLive(x)` |
/// | `drop x;` | `StorageDead(x)` |
/// | `x = load <operand>;` | Load value into place |
/// | `x = apply <func>;` | Call function with no args |
/// | `x = apply <func>, <arg1>, <arg2>;` | Call function with args |
/// | `x = tuple <a>, <b>, ...;` | Create tuple aggregate |
/// | `x = struct a: <v1>, b: <v2>;` | Create struct aggregate |
/// | `x = closure <def> <env>;` | Create closure aggregate |
/// | `x = bin.<op> <lhs> <rhs>;` | Binary operation (e.g., `bin.== x y`) |
/// | `x = un.<op> <operand>;` | Unary operation (e.g., `un.! cond`) |
/// | `x = input.load! "name";` | Load required input |
/// | `x = input.load "name";` | Load optional input |
/// | `x = input.exists "name";` | Check if input exists |
///
/// ## Terminators
///
/// | Syntax | Description |
/// | ------ | ----------- |
/// | `return <operand>;` | Return from function |
/// | `goto <block>(<args>...);` | Unconditional jump |
/// | `if <cond> then <block>(<args>) else <block>(<args>);` | Conditional branch |
/// | `switch <discr> [<val> => <block>(<args>), ...];` | Switch (no otherwise) |
/// | `switch <discr> [<val> => <block>(<args>), _ => <block>(<args>)];` | Switch with otherwise |
/// | `unreachable;` | Mark block as unreachable |
///
/// ## Operands
///
/// - Identifiers: `x`, `cond` (places)
/// - Literals: `42` (i64), `3.14` (f64), `true`/`false` (bool)
/// - Unit: `()`
/// - Null: `null`
/// - Function pointers: simply reference the variable that defines it, for example `def_id`
///
/// # Example
///
/// ```
/// use hashql_core::{heap::Heap, r#type::environment::Environment};
/// use hashql_mir::{builder::body, intern::Interner};
///
/// let heap = Heap::new();
/// let interner = Interner::new(&heap);
/// let env = Environment::new(&heap);
///
/// let body = body!(interner, env; fn@0/1 -> Int {
///     decl x: Int, cond: Bool;
///
///     bb0() {
///         cond = load true;
///         if cond then bb1() else bb2();
///     },
///     bb1() {
///         goto bb3(1);
///     },
///     bb2() {
///         goto bb3(2);
///     },
///     bb3(x) {
///         return x;
///     }
/// });
/// ```
///
/// # Supported Operators
///
/// Binary (`bin.<op>`): `==`, `!=`, `<`, `<=`, `>`, `>=`, `&`, `|`, `+`, `-`, `*`, `/`.
///
/// Unary (`un.<op>`): `!`, `neg`.
#[macro_export]
macro_rules! body {
    (
        $interner:ident, $env:ident;
        $type:ident @ $id:tt / $arity:literal -> $body_type:tt {
            decl $($param:ident: $param_type:tt),*;
            $(@proj $($proj:ident = $proj_base:ident.$field:literal: $proj_type:tt),*;)?

            $($block:ident($($block_param:ident),*) $block_body:tt),+
        }
    ) => {{
        let mut builder = $crate::builder::BodyBuilder::new(&$interner);
        let types = hashql_core::r#type::TypeBuilder::synthetic(&$env);

        $(
            #[expect(clippy::allow_attributes)]
            #[allow(unused)]
            let $param = builder.local(stringify!($param), $crate::builder::body!(@type types; $param_type));
        )*

        $(
            $(
                let $proj = builder.place(|p| p.from($proj_base).field($field, $crate::builder::body!(@type types; $proj_type)));
            )*
        )?

        $(
            let $block = builder.reserve_block([$($block_param.local),*]);
        )*

        $(
            #[expect(clippy::allow_attributes)]
            #[allow(unused)]
            let mut bb_builder = builder.build_block($block);

            $crate::builder::_private::bb!(bb_builder; $block_body);
        )*

        let mut body = builder.finish($arity, $crate::builder::body!(@type types; $body_type));
        body.source = $crate::builder::body!(@source $type);
        body.id = $crate::builder::body!(@id $id);

        body
    }};

    (@id $id:literal) => {
        $crate::def::DefId::new($id)
    };
    (@id $id:ident) => {
        $id
    };

    (@type $types:ident; Int) => {
        $types.integer()
    };
    (@type $types:ident; ($($sub:tt),*)) => {
        $types.tuple([$($crate::builder::body!(@type $types; $sub)),*])
    };
    (@type $types:ident; ($($name:ident: $sub:tt),*)) => {
        $types.r#struct([$((stringify!($name), $crate::builder::body!(@type $types; $sub))),*])
    };
    (@type $types:ident; [fn($($args:tt),+) -> $ret:tt]) => {
        $types.closure([$($crate::builder::body!(@type $types; $args)),*], $crate::builder::body!(@type $types; $ret))
    };
    (@type $types:ident; [fn() -> $ret:tt]) => {
        $types.closure([] as [hashql_core::r#type::TypeId; 0], $crate::builder::body!(@type $types; $ret))
    };
    (@type $types:ident; Bool) => {
        $types.boolean()
    };
    (@type $types:ident; Null) => {
        $types.null()
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
