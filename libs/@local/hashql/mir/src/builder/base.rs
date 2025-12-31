use hashql_core::value::{Float, Primitive};

use super::{
    operand::OperandBuilder,
    place::{HasLocal, NoLocal, PlaceBuilder},
};
use crate::{
    body::{
        basic_block::BasicBlockId, constant::Constant, operand::Operand, place::Place,
        terminator::Target,
    },
    def::DefId,
    intern::Interner,
};

/// Shared base builder providing common operations for creating constants and places.
///
/// This builder is accessible from [`BodyBuilder`], [`BasicBlockBuilder`], [`PlaceBuilder`],
/// [`RValueBuilder`], and [`SwitchBuilder`] via [`Deref`].
///
/// [`BodyBuilder`]: super::BodyBuilder
/// [`BasicBlockBuilder`]: super::BasicBlockBuilder
/// [`PlaceBuilder`]: super::PlaceBuilder
/// [`RValueBuilder`]: super::RValueBuilder
/// [`SwitchBuilder`]: super::SwitchBuilder
/// [`Deref`]: core::ops::Deref
#[derive(Debug, Copy, Clone)]
pub struct BaseBuilder<'env, 'heap> {
    pub(super) interner: &'env Interner<'heap>,
}

#[expect(clippy::unused_self, reason = "ergonomics")]
impl<'env, 'heap> BaseBuilder<'env, 'heap> {
    #[must_use]
    pub const fn operands(self) -> OperandBuilder<'env, 'heap> {
        OperandBuilder { base: self }
    }

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
    /// Targets are used for control flow terminators like `goto` to specify
    /// both the destination block and any arguments to pass to block parameters.
    #[must_use]
    pub fn target(self, block: BasicBlockId, args: impl AsRef<[Operand<'heap>]>) -> Target<'heap> {
        Target {
            block,
            args: self.interner.operands.intern_slice(args.as_ref()),
        }
    }
}
