use core::ops::Deref;

use hashql_core::{heap, id::Id as _, span::SpanId};

use super::{
    base::BaseBuilder,
    body::BodyBuilder,
    place::{HasLocal, NoLocal, PlaceBuilder},
    rvalue::RValueBuilder,
    switch::SwitchBuilder,
};
use crate::body::{
    basic_block::BasicBlockId,
    local::Local,
    operand::Operand,
    place::Place,
    rvalue::RValue,
    statement::{Assign, Statement, StatementKind},
    terminator::{Goto, Return, SwitchInt, SwitchTargets, Target, Terminator, TerminatorKind},
};

/// Builder for constructing a single basic block.
///
/// Obtained via [`BodyBuilder::build_block`]. Provides a fluent API for adding
/// statements and setting the terminator. Each block must end with exactly one
/// terminator (e.g., [`goto`](Self::goto), [`ret`](Self::ret), [`switch`](Self::switch)).
pub struct BasicBlockBuilder<'ctx, 'env, 'heap> {
    pub(super) base: BaseBuilder<'env, 'heap>,
    pub(super) body: &'ctx mut BodyBuilder<'env, 'heap>,

    pub(super) block: BasicBlockId,
    pub(super) statements: heap::Vec<'heap, Statement<'heap>>,
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
    /// The `args` are passed to the target block's parameters (if any).
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

#[doc(hidden)]
#[macro_export]
macro_rules! bb {
    ($b:expr; { $($rest:tt)* }) => {
        $crate::builder::_private::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr;) => {};
    (@impl $b:expr; let $name:expr; $($rest:tt)*) => {
        $b = $b.storage_live($name);
        $crate::builder::_private::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; drop $name:expr; $($rest:tt)*) => {
        $b = $b.storage_dead($name);
        $crate::builder::_private::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; $name:ident = $($rest:tt)*) => {
        $crate::builder::_private::rvalue!($crate::builder::_private::bb; ($b; $name); $($rest)*)
    };
    (@rvalue $rv:expr; ($b:expr; $name:ident); $($rest:tt)*) => {
        $b = $b.assign_place($name, $rv);
        $crate::builder::_private::bb!(@impl $b; $($rest)*)
    };

    (@impl $b:expr; return $value:tt; $($rest:tt)*) => {
        let returns = $crate::builder::_private::operand!(*$b; $value);
        $b.ret(returns);
        $crate::builder::_private::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; goto $target:ident($($arg:tt),*); $($rest:tt)*) => {
        let args = [$($crate::builder::_private::operand!(*$b; $arg)),*];
        $b.goto($target, args);

        $crate::builder::_private::bb!(@impl $b; $($rest)*)
    };
    (@impl $b:expr; if $cond:tt then $then:ident($($thenarg:tt),*) else $else:ident($($elsearg:tt),*); $($rest:tt)*) => {
        let cond = $crate::builder::_private::operand!(*$b; $cond);
        let thenargs = [$($crate::builder::_private::operand!(*$b; $thenarg)),*];
        let elseargs = [$($crate::builder::_private::operand!(*$b; $elsearg)),*];
        $b.if_else(cond, $then, thenargs, $else, elseargs);

        $crate::builder::_private::bb!(@impl $b; $($rest)*)
    };
}

pub use bb;
