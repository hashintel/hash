use hashql_core::intern::Interned;

use crate::node::Node;

/// A key-value entry in a dictionary expression in the HashQL HIR.
///
/// Represents a single key-value pair in a dictionary where both the key and value
/// are expressions. Unlike structs, dictionary keys are dynamically computed expressions
/// rather than static identifiers, allowing for runtime-determined property access.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DictField<'heap> {
    pub key: Node<'heap>,
    pub value: Node<'heap>,
}

/// A dictionary expression in the HashQL HIR.
///
/// Represents a collection of key-value pairs where keys are dynamically
/// computed expressions. Unlike structs, dictionaries have homogeneous values
/// (all values must be of the same type) and support dynamic key lookup.
///
/// Key differences between dictionaries and structs in HashQL:
/// - Dictionary keys are expressions evaluated at runtime; struct fields are identifiers known at
///   compile time.
/// - Dictionary values must all be of the same type; struct fields can have different types.
/// - Dictionaries allow adding and removing entries dynamically; structs have a fixed set of
///   fields.
/// - Dictionary keys can be computed or derived from variables; struct fields are statically named.
/// - Dictionary access requires runtime resolution; struct field access is resolved at compile
///   time.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Dict<'heap> {
    pub fields: Interned<'heap, [DictField<'heap>]>,
}
