use super::{constant::Constant, place::Place};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Operand<'heap> {
    Place(Place<'heap>),
    Constant(Constant<'heap>),
}
