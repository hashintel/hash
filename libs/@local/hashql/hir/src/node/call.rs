use hashql_core::{intern::Interned, span::SpanId};

use super::Node;

/// The calling convention for a function pointer in a call expression.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PointerKind {
    /// Fat function pointer with environment capture.
    ///
    /// Fat function pointers carry environment data and use a calling convention
    /// where their captured environment is passed as the first argument in the MIR.
    /// This usually corresponds to closures.
    Fat,

    /// Thin function pointer without environment capture.
    ///
    /// Thin function pointers do not carry environment data and pass their
    /// arguments directly without any implicit environment parameter. This usually
    /// corresponds to thunks.
    Thin,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct CallArgument<'heap> {
    pub span: SpanId,

    // see: https://linear.app/hash/issue/H-4587/hashql-add-argument-label-support-a-la-swift
    // pub label: Ident<'heap>,
    pub value: Node<'heap>,
}

/// A function call expression in the HashQL HIR.
///
/// Represents an invocation of a callable construct with a specific calling convention
/// determined by the `kind` field. The function being called can be any expression
/// that evaluates to a callable value, such as variable references, field accesses,
/// or other complex expressions.
///
/// The `kind` field determines the calling convention used in the MIR:
/// - `PointerKind::Fat`: Environment data is passed as an implicit first argument
/// - `PointerKind::Thin`: Arguments are passed directly without environment data
///
/// Note that labeled (named) arguments from the source code have already been resolved
/// to positional arguments at this stage. The `arguments` field contains only the
/// explicit arguments in their final order, not including any implicit environment
/// parameter for fat pointers.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Call<'heap> {
    pub kind: PointerKind,

    pub function: Node<'heap>,
    pub arguments: Interned<'heap, [CallArgument<'heap>]>,
}
