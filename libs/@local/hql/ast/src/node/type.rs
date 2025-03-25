use hql_span::SpanId;
use hql_symbol::Ident;

use super::path::Path;
use crate::heap::P;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct StructField<'heap> {
    pub span: SpanId,

    pub name: Ident,
    pub r#type: Type<'heap>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct StructType<'heap> {
    pub span: SpanId,

    pub fields: P<'heap, [StructField<'heap>]>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TupleType<'heap> {
    pub span: SpanId,

    pub fields: P<'heap, [Type<'heap>]>,
}

// The AST refines additionally includes things like unions and intersections
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum TypeKind<'heap> {
    // The unknown type (`?`)
    Unknown,
    // The never type (`!`)
    Never,
    // The infer type (`_`)
    Infer,
    // A path
    Path(Path<'heap>),
    /// A tuple type
    Tuple(TupleType<'heap>),
    /// A struct type
    Struct(StructType<'heap>),
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Type<'heap> {
    pub span: SpanId,

    pub kind: TypeKind<'heap>,
}
