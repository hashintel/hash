use hashql_core::{intern::Interned, symbol::Ident};

use crate::node::Node;

/// A field in a struct expression in the HashQL HIR.
///
/// Represents a single named field and its associated value in a struct.
/// Fields in structs are accessed by name rather than position or index.
/// Unlike dictionary keys, struct field names are static identifiers known at
/// compile time rather than dynamically computed expressions.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructField<'heap> {
    pub name: Ident<'heap>,
    pub value: Node<'heap>,
}

/// A struct expression in the HashQL HIR.
///
/// Represents a collection of named fields with their associated values.
/// Structs in HashQL are heterogeneous collections that provide named access to their members.
///
/// Key differences between structs and dictionaries in HashQL:
/// - Struct fields are static identifiers known at compile time; dictionary keys are runtime
///   expressions.
/// - Struct fields can have different types; dictionary values must all have the same type.
/// - Structs have a fixed set of fields; dictionaries allow adding and removing entries
///   dynamically.
/// - Struct field access is resolved at compile time; dictionary access requires runtime
///   resolution.
/// - Struct field names are constrained to valid identifiers; dictionary keys can be any computable
///   value.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Struct<'heap> {
    pub fields: Interned<'heap, [StructField<'heap>]>,
}
