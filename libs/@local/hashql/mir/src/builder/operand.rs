use super::base::BaseBuilder;
use crate::{
    body::{operand::Operand, place::Place},
    def::DefId,
};

pub trait BuildOperand<'heap, T> {
    fn build_operand(&self, value: T) -> Operand<'heap>;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Null;

#[derive(Debug, Copy, Clone)]
pub struct OperandBuilder<'env, 'heap> {
    pub(super) base: BaseBuilder<'env, 'heap>,
}

impl<'heap> BuildOperand<'heap, f64> for OperandBuilder<'_, 'heap> {
    fn build_operand(&self, value: f64) -> Operand<'heap> {
        self.base.const_float(value)
    }
}

impl<'heap> BuildOperand<'heap, i64> for OperandBuilder<'_, 'heap> {
    fn build_operand(&self, value: i64) -> Operand<'heap> {
        self.base.const_int(value)
    }
}

impl<'heap> BuildOperand<'heap, bool> for OperandBuilder<'_, 'heap> {
    fn build_operand(&self, value: bool) -> Operand<'heap> {
        self.base.const_bool(value)
    }
}

impl<'heap> BuildOperand<'heap, ()> for OperandBuilder<'_, 'heap> {
    fn build_operand(&self, (): ()) -> Operand<'heap> {
        self.base.const_unit()
    }
}

impl<'heap> BuildOperand<'heap, Null> for OperandBuilder<'_, 'heap> {
    fn build_operand(&self, _: Null) -> Operand<'heap> {
        self.base.const_unit()
    }
}

impl<'heap> BuildOperand<'heap, DefId> for OperandBuilder<'_, 'heap> {
    fn build_operand(&self, value: DefId) -> Operand<'heap> {
        self.base.const_fn(value)
    }
}

impl<'heap> BuildOperand<'heap, Place<'heap>> for OperandBuilder<'_, 'heap> {
    fn build_operand(&self, value: Place<'heap>) -> Operand<'heap> {
        Operand::Place(value)
    }
}

impl<'heap> BuildOperand<'heap, Operand<'heap>> for OperandBuilder<'_, 'heap> {
    fn build_operand(&self, value: Operand<'heap>) -> Operand<'heap> {
        value
    }
}
