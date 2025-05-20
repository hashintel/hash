use hashql_core::{intern::Interned, span::SpanId};

use super::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct CallArgument<'heap> {
    pub span: SpanId,

    // see: https://linear.app/hash/issue/H-4587/hashql-add-argument-label-support-a-la-swift
    // pub label: Ident<'heap>,
    pub value: Node<'heap>,
}

/// A function call expression in the HashQL HIR.
///
/// Represents an invocation of a function with arguments. The function to be called
/// can be any expression that evaluates to a callable value, including variable
/// references, field accesses, or other complex expressions.
///
/// Note that labeled (named) arguments from the source code have already been resolved
/// to positional arguments at this stage - the `arguments` field contains only
/// positional arguments in their final order.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Call<'heap> {
    pub span: SpanId,

    pub function: Node<'heap>,
    pub arguments: Interned<'heap, [CallArgument<'heap>]>,
}
