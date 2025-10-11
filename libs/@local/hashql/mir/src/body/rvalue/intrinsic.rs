use crate::body::{local::Local, operand::Operand, place::Place};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum IntrinsicOp<'heap> {
    Push(Operand<'heap>),
    Insert(Operand<'heap>, Operand<'heap>),

    Pop,
    Remove(Operand<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Destination {
    Target,
    Local(Local),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Intrinsic<'heap> {
    pub operation: IntrinsicOp<'heap>,
    pub destination: Destination,
    pub target: Place<'heap>,
}
