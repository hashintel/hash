pub mod dict;
pub mod list;
pub mod literal;
pub mod r#struct;
pub mod tuple;

use hashql_core::span::SpanId;

pub use self::{dict::Dict, list::List, literal::Literal, r#struct::Struct, tuple::Tuple};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataKind<'heap> {
    Struct(Struct<'heap>),
    Dict(Dict<'heap>),
    Tuple(Tuple<'heap>),
    List(List<'heap>),
    Literal(Literal<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Data<'heap> {
    pub span: SpanId,

    pub kind: DataKind<'heap>,
}
