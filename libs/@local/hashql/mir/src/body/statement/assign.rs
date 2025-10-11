use crate::body::{place::Place, rvalue::RValue};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Assign<'heap> {
    pub lhs: Place<'heap>,
    pub rhs: RValue<'heap>,
}
