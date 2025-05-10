use hashql_core::span::SpanId;

pub use self::{binary::BinaryOperation, r#type::TypeOperation, unary::UnaryOperation};

pub mod binary;
pub mod r#type;
pub mod unary;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum OperationKind<'heap> {
    Type(TypeOperation<'heap>),
    Binary(BinaryOperation<'heap>),
    Unary(UnaryOperation<'heap>),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Operation<'heap> {
    pub span: SpanId,

    pub kind: OperationKind<'heap>,
}
