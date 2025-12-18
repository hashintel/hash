//! Ergonomic builder for constructing MIR in tests.
//!
//! This module provides a fluent API for building MIR bodies without the boilerplate
//! of manually constructing all the intermediate structures.
//!
//! # Example
//!
//! ```ignore
//! use hashql_mir::tests::builder::{scaffold, op};
//!
//! scaffold!(heap, interner, builder);
//!
//! let x = builder.local("x", TypeId::MAX);
//! let y = builder.local("y", TypeId::MAX);
//!
//! let entry = builder.reserve_block([]);
//!
//! let const_5 = builder.const_int(5);
//! let const_3 = builder.const_int(3);
//! let place_x = builder.place_local(x);
//! let place_y = builder.place_local(y);
//!
//! builder
//!     .build_block(entry)
//!     .assign_place(x, |rv| rv.load(const_5))
//!     .assign_place(y, |rv| rv.binary(place_x, op![+], const_3))
//!     .ret(place_y);
//!
//! let body = builder.finish(0, TypeId::MAX);
//! ```

use core::ops::Deref;

use hashql_core::{
    heap::{self, Heap},
    id::{Id as _, IdVec},
    span::SpanId,
    r#type::{TypeId, builder::IntoSymbol},
    value::{Float, Primitive},
};
use hashql_hir::node::operation::{BinOp, InputOp, UnOp};

use crate::{
    body::{
        Body, Source,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockVec},
        basic_blocks::BasicBlocks,
        constant::Constant,
        local::{Local, LocalDecl, LocalVec},
        operand::Operand,
        place::{FieldIndex, Place, Projection, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Apply, Binary, Input, RValue, Unary},
        statement::{Assign, Statement, StatementKind},
        terminator::{Goto, Return, SwitchInt, SwitchTargets, Target, Terminator, TerminatorKind},
    },
    def::DefId,
    intern::Interner,
};

/// Scaffold macro for setting up MIR test infrastructure.
///
/// Creates the heap, interner, and body builder needed for constructing MIR in tests.
///
/// # Example
///
/// ```ignore
/// scaffold!(heap, interner, builder);
///
/// let x = builder.local("x", TypeId::MAX);
/// let entry = builder.reserve_block([]);
/// let place_x = builder.place_local(x);
/// builder.build_block(entry).ret(place_x);
/// let body = builder.finish(0, TypeId::MAX);
/// ```
#[macro_export]
macro_rules! scaffold {
    ($heap:ident, $interner:ident, $builder:ident) => {
        let $heap = hashql_core::heap::Heap::new();
        let $interner = $crate::intern::Interner::new(&$heap);
        let mut $builder = $crate::builder::BodyBuilder::new(&$interner);
    };
}

/// Macro for creating binary and unary operators.
///
/// # Binary Operators
///
/// ```ignore
/// rv.binary(lhs, op![+], rhs)   // Add
/// rv.binary(lhs, op![-], rhs)   // Sub
/// rv.binary(lhs, op![*], rhs)   // Mul
/// rv.binary(lhs, op![/], rhs)   // Div
/// rv.binary(lhs, op![==], rhs)  // Eq
/// rv.binary(lhs, op![!=], rhs)  // Ne
/// rv.binary(lhs, op![<], rhs)   // Lt
/// rv.binary(lhs, op![<=], rhs)  // Le
/// rv.binary(lhs, op![>], rhs)   // Gt
/// rv.binary(lhs, op![>=], rhs)  // Ge
/// rv.binary(lhs, op![&&], rhs)  // And
/// rv.binary(lhs, op![||], rhs)  // Or
/// ```
///
/// # Unary Operators
///
/// ```ignore
/// rv.unary(op![!], operand)    // Not
/// rv.unary(op![neg], operand)  // Neg (can't use `-` alone)
/// ```
#[macro_export]
macro_rules! op {
    // Binary operators
    [+] => { hashql_hir::node::operation::BinOp::Add };
    [-] => { hashql_hir::node::operation::BinOp::Sub };
    [*] => { hashql_hir::node::operation::BinOp::Mul };
    [/] => { hashql_hir::node::operation::BinOp::Div };
    [==] => { hashql_hir::node::operation::BinOp::Eq };
    [!=] => { hashql_hir::node::operation::BinOp::Ne };
    [<] => { hashql_hir::node::operation::BinOp::Lt };
    [<=] => { hashql_hir::node::operation::BinOp::Le };
    [>] => { hashql_hir::node::operation::BinOp::Gt };
    [>=] => { hashql_hir::node::operation::BinOp::Ge };
    [&&] => { hashql_hir::node::operation::BinOp::And };
    [||] => { hashql_hir::node::operation::BinOp::Or };

    // Unary operators
    [!] => { hashql_hir::node::operation::UnOp::Not };
    [neg] => { hashql_hir::node::operation::UnOp::Neg };
}

const PLACEHOLDER_TERMINATOR: Terminator<'static> = Terminator {
    span: SpanId::SYNTHETIC,
    kind: TerminatorKind::Unreachable,
};

#[derive(Debug, Copy, Clone)]
pub struct BaseBuilder<'env, 'heap> {
    interner: &'env Interner<'heap>,
}

#[expect(clippy::unused_self, reason = "ergonomics")]
impl<'env, 'heap> BaseBuilder<'env, 'heap> {
    /// Creates an integer constant operand.
    #[must_use]
    pub fn const_int(self, value: i64) -> Operand<'heap> {
        Operand::Constant(Constant::Int(value.into()))
    }

    /// Creates a float constant operand.
    #[must_use]
    pub fn const_float(self, value: f64) -> Operand<'heap> {
        Operand::Constant(Constant::Primitive(Primitive::Float(Float::new_unchecked(
            self.interner.heap.intern_symbol(&value.to_string()),
        ))))
    }

    /// Creates a boolean constant operand.
    #[must_use]
    pub fn const_bool(self, value: bool) -> Operand<'heap> {
        Operand::Constant(Constant::Int(value.into()))
    }

    /// Creates a unit constant operand.
    #[must_use]
    pub const fn const_unit(self) -> Operand<'heap> {
        Operand::Constant(Constant::Unit)
    }

    /// Creates a null constant operand.
    #[must_use]
    pub const fn const_null(self) -> Operand<'heap> {
        Operand::Constant(Constant::Primitive(Primitive::Null))
    }

    /// Creates a function pointer constant operand.
    #[must_use]
    pub const fn const_fn(self, def_id: DefId) -> Operand<'heap> {
        Operand::Constant(Constant::FnPtr(def_id))
    }

    /// Creates a place using the place builder for projections.
    #[must_use]
    pub fn place(
        self,
        func: impl FnOnce(PlaceBuilder<'env, 'heap, NoLocal>) -> PlaceBuilder<'env, 'heap, HasLocal>,
    ) -> Place<'heap> {
        func(PlaceBuilder::new(self)).build()
    }

    /// Creates a target for control flow (block + arguments).
    ///
    /// # Example
    ///
    /// ```ignore
    /// let target = builder.target(block, []);  // No args
    /// let target = builder.target(block, [builder.const_int(5)]);  // With args
    /// ```
    #[must_use]
    pub fn target(self, block: BasicBlockId, args: impl AsRef<[Operand<'heap>]>) -> Target<'heap> {
        Target {
            block,
            args: self.interner.operands.intern_slice(args.as_ref()),
        }
    }
}

/// Builder for constructing MIR bodies.
///
/// Use this to declaratively build MIR for testing purposes. The workflow is:
/// 1. Create locals with `local()` or `temp()`
/// 2. Reserve blocks with `reserve_block(params)`
/// 3. Build each block with `build_block()`, adding statements and a terminator
/// 4. Finalize with `finish()`
pub struct BodyBuilder<'env, 'heap> {
    base: BaseBuilder<'env, 'heap>,
    interner: &'env Interner<'heap>,
    local_decls: LocalVec<LocalDecl<'heap>, &'heap Heap>,
    blocks: BasicBlockVec<BasicBlock<'heap>, &'heap Heap>,
    finished: Vec<bool>,
}

impl<'env, 'heap> BodyBuilder<'env, 'heap> {
    /// Creates a new body builder.
    #[must_use]
    pub const fn new(interner: &'env Interner<'heap>) -> Self {
        Self {
            base: BaseBuilder { interner },
            interner,
            local_decls: LocalVec::new_in(interner.heap),
            blocks: BasicBlockVec::new_in(interner.heap),
            finished: Vec::new(),
        }
    }

    /// Declares a new local variable with the given name and type.
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
    /// The block is initialized with a placeholder terminator. Use `build_block()`
    /// to fill in the actual contents.
    ///
    /// # Example
    ///
    /// ```ignore
    /// let entry = builder.reserve_block([]);  // No params
    /// let join = builder.reserve_block([result]);  // With params
    /// ```
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
    pub const fn build_block(&mut self, block: BasicBlockId) -> BasicBlockBuilder<'_, 'env, 'heap> {
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

/// Builder for constructing a single basic block.
pub struct BasicBlockBuilder<'ctx, 'env, 'heap> {
    base: BaseBuilder<'env, 'heap>,
    body: &'ctx mut BodyBuilder<'env, 'heap>,

    block: BasicBlockId,
    statements: heap::Vec<'heap, Statement<'heap>>,
}

impl<'env, 'heap> BasicBlockBuilder<'_, 'env, 'heap> {
    /// Adds an assignment statement with inline place and rvalue building.
    #[must_use]
    pub fn assign(
        mut self,
        place: impl FnOnce(PlaceBuilder<'env, 'heap, NoLocal>) -> PlaceBuilder<'env, 'heap, HasLocal>,
        rvalue: impl FnOnce(RValueBuilder<'env, 'heap>) -> RValue<'heap>,
    ) -> Self {
        let place = place(PlaceBuilder::new(self.base)).build();
        let rvalue = rvalue(RValueBuilder::new(self.base));

        self.statements.push(Statement {
            span: SpanId::SYNTHETIC,
            kind: StatementKind::Assign(Assign {
                lhs: place,
                rhs: rvalue,
            }),
        });
        self
    }

    /// Adds an assignment to a place (convenience method).
    #[must_use]
    pub fn assign_place(
        mut self,
        place: Place<'heap>,
        rvalue: impl FnOnce(RValueBuilder<'env, 'heap>) -> RValue<'heap>,
    ) -> Self {
        let rvalue = rvalue(RValueBuilder::new(self.base));

        self.statements.push(Statement {
            span: SpanId::SYNTHETIC,
            kind: StatementKind::Assign(Assign {
                lhs: place,
                rhs: rvalue,
            }),
        });

        self
    }

    /// Marks a local variable as live.
    #[must_use]
    pub fn storage_live(mut self, local: Local) -> Self {
        self.statements.push(Statement {
            span: SpanId::SYNTHETIC,
            kind: StatementKind::StorageLive(local),
        });
        self
    }

    /// Marks a local variable as dead.
    #[must_use]
    pub fn storage_dead(mut self, local: Local) -> Self {
        self.statements.push(Statement {
            span: SpanId::SYNTHETIC,
            kind: StatementKind::StorageDead(local),
        });
        self
    }

    /// Adds a no-op statement.
    #[must_use]
    pub fn nop(mut self) -> Self {
        self.statements.push(Statement {
            span: SpanId::SYNTHETIC,
            kind: StatementKind::Nop,
        });
        self
    }

    /// Terminates the block with an unconditional goto.
    ///
    /// # Example
    ///
    /// ```ignore
    /// builder.build_block(bb).goto(next, []);  // No args
    /// builder.build_block(bb).goto(next, [builder.const_int(5)]);  // With args
    /// ```
    pub fn goto(self, target: BasicBlockId, args: impl AsRef<[Operand<'heap>]>) {
        let target = Target {
            block: target,
            args: self.body.interner.operands.intern_slice(args.as_ref()),
        };

        self.finish_with_terminator(TerminatorKind::Goto(Goto { target }));
    }

    /// Terminates the block with a return.
    pub fn ret(self, value: impl Into<Operand<'heap>>) {
        self.finish_with_terminator(TerminatorKind::Return(Return {
            value: value.into(),
        }));
    }

    /// Terminates the block with a switch on an integer value.
    pub fn switch(
        self,
        discriminant: impl Into<Operand<'heap>>,
        build_switch: impl FnOnce(SwitchBuilder<'env, 'heap>) -> SwitchBuilder<'env, 'heap>,
    ) {
        let switch = build_switch(SwitchBuilder::new(self.base));
        let targets = SwitchTargets::new(self.body.interner.heap, switch.cases, switch.otherwise);

        self.finish_with_terminator(TerminatorKind::SwitchInt(SwitchInt {
            discriminant: discriminant.into(),
            targets,
        }));
    }

    /// Terminates the block with a boolean if-else branch.
    pub fn if_else(
        self,
        cond: impl Into<Operand<'heap>>,
        then_block: BasicBlockId,
        then_args: impl AsRef<[Operand<'heap>]>,
        else_block: BasicBlockId,
        else_args: impl AsRef<[Operand<'heap>]>,
    ) {
        self.switch(cond, |builder| {
            builder
                .case(1, then_block, then_args)
                .case(0, else_block, else_args)
        });
    }

    /// Terminates the block as unreachable.
    pub fn unreachable(self) {
        self.finish_with_terminator(TerminatorKind::Unreachable);
    }

    pub fn finish_with_terminator(self, terminator: TerminatorKind<'heap>) {
        let terminator = Terminator {
            span: SpanId::SYNTHETIC,
            kind: terminator,
        };
        self.body.finished[self.block.as_usize()] = true;

        let block = &mut self.body.blocks[self.block];
        block.statements = self.statements;
        block.terminator = terminator;
    }
}

impl<'env, 'heap> Deref for BasicBlockBuilder<'_, 'env, 'heap> {
    type Target = BaseBuilder<'env, 'heap>;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

/// Typestate marker: no local has been set yet.
pub struct NoLocal;

/// Typestate marker: a local has been set.
pub struct HasLocal(Local);

/// Builder for constructing places with projections.
///
/// Uses typestate to ensure a local is set before building:
/// - `PlaceBuilder<'env, 'heap, NoLocal>`: Initial state, must call `.local()` first
/// - `PlaceBuilder<'env, 'heap, HasLocal>`: Local set, can add projections and build
pub struct PlaceBuilder<'env, 'heap, State = NoLocal> {
    base: BaseBuilder<'env, 'heap>,

    state: State,
    projections: Vec<Projection<'heap>>,
}

impl<'env, 'heap> PlaceBuilder<'env, 'heap, NoLocal> {
    const fn new(base: BaseBuilder<'env, 'heap>) -> Self {
        Self {
            base,

            state: NoLocal,
            projections: Vec::new(),
        }
    }

    /// Sets the base local for this place.
    #[must_use]
    pub fn local(self, local: Local) -> PlaceBuilder<'env, 'heap, HasLocal> {
        PlaceBuilder {
            base: self.base,

            state: HasLocal(local),
            projections: self.projections,
        }
    }

    #[must_use]
    pub fn from(self, place: Place<'heap>) -> PlaceBuilder<'env, 'heap, HasLocal> {
        PlaceBuilder {
            base: self.base,
            state: HasLocal(place.local),
            projections: place.projections.to_vec(),
        }
    }
}

impl<'heap> PlaceBuilder<'_, 'heap, HasLocal> {
    /// Adds a field projection by index.
    #[must_use]
    pub fn field(mut self, index: usize, ty: TypeId) -> Self {
        self.projections.push(Projection {
            r#type: ty,
            kind: ProjectionKind::Field(FieldIndex::new(index)),
        });

        self
    }

    /// Adds a field projection by name.
    #[must_use]
    pub fn field_by_name(mut self, name: impl IntoSymbol<'heap>, ty: TypeId) -> Self {
        self.projections.push(Projection {
            r#type: ty,
            kind: ProjectionKind::FieldByName(name.intern_into_symbol(self.interner.heap)),
        });

        self
    }

    /// Adds an index projection.
    #[must_use]
    pub fn index(mut self, index_local: Local, ty: TypeId) -> Self {
        self.projections.push(Projection {
            r#type: ty,
            kind: ProjectionKind::Index(index_local),
        });

        self
    }

    /// Builds the final place.
    #[must_use]
    pub fn build(self) -> Place<'heap> {
        Place {
            local: self.state.0,
            projections: self.interner.projections.intern_slice(&self.projections),
        }
    }
}

impl<'env, 'heap, S> Deref for PlaceBuilder<'env, 'heap, S> {
    type Target = BaseBuilder<'env, 'heap>;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

/// Builder for constructing r-values.
pub struct RValueBuilder<'env, 'heap> {
    base: BaseBuilder<'env, 'heap>,
}

#[expect(clippy::unused_self, reason = "builder methods 'mimic' ownership")]
impl<'env, 'heap> RValueBuilder<'env, 'heap> {
    const fn new(base: BaseBuilder<'env, 'heap>) -> Self {
        Self { base }
    }

    /// Creates a load r-value from an operand.
    #[must_use]
    pub fn load(self, operand: impl Into<Operand<'heap>>) -> RValue<'heap> {
        RValue::Load(operand.into())
    }

    /// Creates a binary operation r-value.
    #[must_use]
    pub fn binary(
        self,
        lhs: impl Into<Operand<'heap>>,
        op: BinOp,
        rhs: impl Into<Operand<'heap>>,
    ) -> RValue<'heap> {
        RValue::Binary(Binary {
            left: lhs.into(),
            op,
            right: rhs.into(),
        })
    }

    /// Creates a unary operation r-value.
    ///
    /// Use the [`op!`] macro for the operator: `rv.unary(op![!], operand)`.
    #[must_use]
    pub fn unary(self, op: UnOp, operand: impl Into<Operand<'heap>>) -> RValue<'heap> {
        RValue::Unary(Unary {
            op,
            operand: operand.into(),
        })
    }

    /// Creates a tuple aggregate r-value.
    #[must_use]
    pub fn tuple(
        self,
        operands: impl IntoIterator<Item = impl Into<Operand<'heap>>>,
    ) -> RValue<'heap> {
        let mut ops = heap::Vec::new_in(self.interner.heap);
        ops.extend(operands.into_iter().map(Into::into));

        RValue::Aggregate(Aggregate {
            kind: AggregateKind::Tuple,
            operands: IdVec::from_raw(ops),
        })
    }

    /// Creates a list aggregate r-value.
    #[must_use]
    pub fn list(
        self,
        operands: impl IntoIterator<Item = impl Into<Operand<'heap>>>,
    ) -> RValue<'heap> {
        let mut ops = heap::Vec::new_in(self.interner.heap);
        ops.extend(operands.into_iter().map(Into::into));

        RValue::Aggregate(Aggregate {
            kind: AggregateKind::List,
            operands: IdVec::from_raw(ops),
        })
    }

    /// Creates a struct aggregate r-value.
    #[must_use]
    pub fn r#struct(
        self,
        fields: impl IntoIterator<Item = (impl IntoSymbol<'heap>, impl Into<Operand<'heap>>)>,
    ) -> RValue<'heap> {
        let mut field_names = Vec::new();
        let mut ops = heap::Vec::new_in(self.interner.heap);

        for (name, operand) in fields {
            field_names.push(name.intern_into_symbol(self.interner.heap));
            ops.push(operand.into());
        }

        RValue::Aggregate(Aggregate {
            kind: AggregateKind::Struct {
                fields: self.interner.symbols.intern_slice(&field_names),
            },
            operands: IdVec::from_raw(ops),
        })
    }

    /// Creates a dict aggregate r-value (alternating keys and values).
    #[must_use]
    pub fn dict(
        self,
        pairs: impl IntoIterator<Item = (impl Into<Operand<'heap>>, impl Into<Operand<'heap>>)>,
    ) -> RValue<'heap> {
        let mut ops = heap::Vec::new_in(self.interner.heap);

        for (key, value) in pairs {
            ops.push(key.into());
            ops.push(value.into());
        }

        RValue::Aggregate(Aggregate {
            kind: AggregateKind::Dict,
            operands: IdVec::from_raw(ops),
        })
    }

    /// Creates a function application r-value.
    #[must_use]
    pub fn apply(
        self,
        func: impl Into<Operand<'heap>>,
        args: impl IntoIterator<Item = impl Into<Operand<'heap>>>,
    ) -> RValue<'heap> {
        let mut arguments = heap::Vec::new_in(self.interner.heap);
        arguments.extend(args.into_iter().map(Into::into));

        RValue::Apply(Apply {
            function: func.into(),
            arguments: IdVec::from_raw(arguments),
        })
    }

    /// Creates an input r-value.
    #[must_use]
    pub fn input(self, op: InputOp, name: impl IntoSymbol<'heap>) -> RValue<'heap> {
        RValue::Input(Input {
            op,
            name: name.intern_into_symbol(self.interner.heap),
        })
    }
}

impl<'env, 'heap> Deref for RValueBuilder<'env, 'heap> {
    type Target = BaseBuilder<'env, 'heap>;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

/// Builder for constructing switch targets.
pub struct SwitchBuilder<'env, 'heap> {
    base: BaseBuilder<'env, 'heap>,
    cases: Vec<(u128, Target<'heap>)>,
    otherwise: Option<Target<'heap>>,
}

impl<'env, 'heap> SwitchBuilder<'env, 'heap> {
    const fn new(base: BaseBuilder<'env, 'heap>) -> Self {
        Self {
            base,
            cases: Vec::new(),
            otherwise: None,
        }
    }

    /// Adds a case to the switch.
    ///
    /// # Example
    ///
    /// ```ignore
    /// .switch(disc, |s| s.case(0, block_a, []).case(1, block_b, [arg]))
    /// ```
    #[must_use]
    pub fn case(
        mut self,
        value: u128,
        block: BasicBlockId,
        args: impl AsRef<[Operand<'heap>]>,
    ) -> Self {
        self.cases.push((value, self.base.target(block, args)));
        self
    }

    /// Sets the otherwise (default) case.
    ///
    /// # Example
    ///
    /// ```ignore
    /// .switch(disc, |s| s.case(0, block_a, []).otherwise(default, []))
    /// ```
    #[must_use]
    pub fn otherwise(mut self, block: BasicBlockId, args: impl AsRef<[Operand<'heap>]>) -> Self {
        self.otherwise = Some(self.base.target(block, args));
        self
    }
}

impl<'env, 'heap> Deref for SwitchBuilder<'env, 'heap> {
    type Target = BaseBuilder<'env, 'heap>;

    fn deref(&self) -> &Self::Target {
        &self.base
    }
}

pub use op;
pub use scaffold;
