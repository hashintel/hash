use core::ops::Deref;

use hashql_core::{
    heap::{self, FromIteratorIn as _},
    id::IdVec,
    r#type::builder::IntoSymbol,
};
use hashql_hir::node::operation::{InputOp, UnOp};

use super::base::BaseBuilder;
use crate::{
    body::{
        constant::Constant,
        operand::Operand,
        place::Place,
        rvalue::{Aggregate, AggregateKind, Apply, BinOp, Binary, Input, RValue, Unary},
    },
    def::DefId,
};

/// Builder for constructing r-values (right-hand side of assignments).
///
/// Provides methods for creating loads, binary/unary operations, aggregates, and function
/// applications. Used within [`BasicBlockBuilder::assign`] and [`BasicBlockBuilder::assign_place`].
pub struct RValueBuilder<'env, 'heap> {
    base: BaseBuilder<'env, 'heap>,
}

#[expect(clippy::unused_self, reason = "builder methods 'mimic' ownership")]
impl<'env, 'heap> RValueBuilder<'env, 'heap> {
    pub(super) const fn new(base: BaseBuilder<'env, 'heap>) -> Self {
        Self { base }
    }

    /// Creates a load r-value from an operand.
    #[must_use]
    pub fn load(self, operand: impl Into<Operand<'heap>>) -> RValue<'heap> {
        RValue::Load(operand.into())
    }

    /// Creates a binary operation r-value.
    ///
    /// Use the [`op!`] macro for the operator: `rv.binary(x, op![==], y)`.
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

    #[must_use]
    pub fn closure(self, fn_ptr: DefId, env: Place<'heap>) -> RValue<'heap> {
        RValue::Aggregate(Aggregate {
            kind: AggregateKind::Closure,
            operands: IdVec::from_iter_in(
                [
                    Operand::Constant(Constant::FnPtr(fn_ptr)),
                    Operand::Place(env),
                ],
                self.interner.heap,
            ),
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

    #[must_use]
    pub fn call(self, func: impl Into<Operand<'heap>>) -> RValue<'heap> {
        self.apply(func, [] as [Operand<'heap>; 0])
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
