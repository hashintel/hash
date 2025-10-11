pub mod aggregate;
pub mod binary;
pub mod intrinsic;
pub mod unary;

pub use self::{
    aggregate::{Aggregate, AggregateKind},
    binary::Binary,
    intrinsic::Intrinsic,
    unary::Unary,
};
use crate::body::operand::Operand;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum RValue<'heap> {
    Load(Operand<'heap>),
    Binary(Binary<'heap>),
    Unary(Unary<'heap>),
    Aggregate(Aggregate<'heap>),
    Intrinsic(Intrinsic<'heap>),
}
