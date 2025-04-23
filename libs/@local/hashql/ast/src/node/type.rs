use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::{id::NodeId, path::Path};

/// A field definition in a struct type.
///
/// Represents a named field with a specific type within a struct type definition.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct StructField<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub r#type: Type<'heap>,
}

/// A struct type definition.
///
/// Represents a composite type with named fields of potentially different types.
/// Struct types in HashQL are similar to records or objects in other languages,
/// providing a way to group related data with named access.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// {"#type": {"name": "String", "age": "Int", "active": "Boolean"}}
/// {"#type": {"x": "Float", "y": "Float", "z": "Float"}}
/// ```
///
/// ## Documentation Format
///
/// ```text
/// (name: String, age: Int, active: Boolean)
/// (x: Float, y: Float, z: Float)
/// ```
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct StructType<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub fields: heap::Vec<'heap, StructField<'heap>>,
}

/// A field in a tuple type.
///
/// Represents an unnamed field with a specific type within a tuple type definition.
/// Unlike struct fields, tuple fields are accessed by position rather than by name.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TupleField<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub r#type: Type<'heap>,
}

/// A tuple type definition.
///
/// Represents a composite type with ordered, unnamed fields of potentially
/// different types. Tuple types in HashQL are similar to tuples in other languages,
/// providing a way to group related data with positional access.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// {"#type": ["Int", "String"]}
/// {"#type": ["Float", "Float", "Float"]}
/// {"#type": ["User", "List<Permission>"]}
/// ```
///
/// ## Documentation Format
///
/// ```text
/// (Int, String)
/// (Float, Float, Float)
/// (User, List<Permission>)
/// ```
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TupleType<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub fields: heap::Vec<'heap, TupleField<'heap>>,
}

/// A union type definition.
///
/// Represents a type that can be any one of several possible types.
/// Union types allow expressing that a value could be one of several
/// distinct types, similar to sum types in other languages.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// {"#type": "Int | Float"}
/// {"#type": {"#union": ["Float", "Float", "Float"]}} // explicit
/// {"#type": {"#union": ["User", "List<Permission>"]}}
/// ```
///
/// ## Documentation Format
///
/// ```text
/// String | Int | Boolean
/// Error | Result<T>
/// ```
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct UnionType<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub types: heap::Vec<'heap, Type<'heap>>,
}

/// An intersection type definition.
///
/// Represents a type that must satisfy all of several component types.
/// Intersection types are useful for combining multiple interfaces or
/// for expressing complex type constraints.
///
/// # Examples
///
/// ```text
/// Named & Serializable
/// Printable & Comparable & Hashable
/// ```
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct IntersectionType<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub types: heap::Vec<'heap, Type<'heap>>,
}

/// The different kinds of types in the HashQL type system.
///
/// This enum represents all possible type constructs in the HashQL language,
/// from simple path references to complex composite types.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum TypeKind<'heap> {
    /// The unknown type (`kernel::types::?`).
    ///
    /// Represents a type that is genuinely unknown or cannot be determined.
    /// This is different from an inferred type, as it indicates the absence
    /// of type information.
    Unknown,

    /// The never type (`kernel::types::!`).
    ///
    /// Represents the type of expressions that never produce a value,
    /// such as expressions that always throw an error or infinite loops.
    Never,

    /// The infer type (`_`).
    ///
    /// Represents a type that should be inferred by the type checker.
    /// This is a placeholder used when the programmer wants the compiler
    /// to determine the type automatically.
    Infer,

    /// A type referenced by path.
    ///
    /// Represents a named type, possibly qualified with a module path.
    /// This includes built-in types, user-defined types, and generic type
    /// instantiations.
    Path(Path<'heap>),

    /// A tuple type.
    ///
    /// Represents an ordered sequence of types, accessed by position.
    Tuple(TupleType<'heap>),

    /// A struct type.
    ///
    /// Represents a collection of named fields with their types.
    Struct(StructType<'heap>),

    /// A union type.
    ///
    /// Represents a type that can be any one of several possible types.
    Union(UnionType<'heap>),

    /// An intersection type.
    ///
    /// Represents a type that must satisfy all of several component types.
    Intersection(IntersectionType<'heap>),
}

/// A type in the HashQL Abstract Syntax Tree.
///
/// Represents any type expression in the language, from simple type references
/// to complex composite types. Types are used in variable declarations, function
/// signatures, generic constraints, and other contexts where type information is needed.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Type<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub kind: TypeKind<'heap>,
}
