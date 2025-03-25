use hql_core::{span::SpanId, symbol::Ident};

use super::{id::NodeId, path::Path};
use crate::heap::P;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct StructField<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub r#type: Type<'heap>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct StructType<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub fields: P<'heap, [StructField<'heap>]>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TupleField<'heap> {
    // TODO: we might be able to remove these
    pub id: NodeId,
    pub span: SpanId,

    pub r#type: Type<'heap>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TupleType<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub fields: P<'heap, [TupleField<'heap>]>,
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
    pub id: NodeId,
    pub span: SpanId,

    pub kind: TypeKind<'heap>,
}
