use hashql_core::{
    intern::Interned,
    span::SpanId,
    symbol::Ident,
    r#type::{TypeId, kind::generic::GenericArgumentReference},
};

use super::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureParam<'heap> {
    pub span: SpanId,

    // see: https://linear.app/hash/issue/H-4587/hashql-add-argument-label-support-a-la-swift
    // pub label: Option<Ident<'heap>>,
    pub name: Ident<'heap>,
}

/// The signature of a closure in the HashQL HIR.
///
/// Defines the interface of a closure function, including its parameters and return type.
/// The signature provides all type information necessary for type checking and validation
/// of the closure.
///
/// Note that parameter names are stored separately from the type information in the `params`
/// field, as the type system only tracks parameter types, not their names.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureSignature<'heap> {
    pub span: SpanId,

    // Always a `ClosureType`
    pub r#type: TypeId,

    // The generics bound to this type, always in the order they have been specified
    // TODO: I am unsure if they are even required. They are required for when binding to a generic
    // path that goes back to a function. This doesn't happen in the ImportResolver, but in the HIR
    // during type checking.
    pub generics: Interned<'heap, [GenericArgumentReference<'heap>]>,
    // The names of the different parameters, always the same length as the `ClosureType` params
    pub params: Interned<'heap, [ClosureParam<'heap>]>,
}

/// A closure expression in the HashQL HIR.
///
/// Represents an anonymous function with a signature and a body expression.
/// Closures in HashQL can capture variables from their surrounding scope.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Closure<'heap> {
    pub span: SpanId,

    pub signature: ClosureSignature<'heap>,
    pub body: Node<'heap>,
}
