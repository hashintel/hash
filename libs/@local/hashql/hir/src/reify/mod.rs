mod control;
mod data;
pub mod error;
mod expr;
mod path;
mod scope;
#[cfg(test)]
mod tests;
mod value;

use core::alloc::Allocator;

use hashql_ast::{lower::ExtractedTypes, node::expr::Expr};
use hashql_core::span::SpanId;
use hashql_diagnostics::{Status, StatusExt as _};

use self::error::{
    ReificationDiagnosticIssues, ReificationStatus, ReificationTarget, internal_error,
};
use crate::{
    context::HirContext,
    node::{Node, NodeData, Value},
};

fn finish_reify<'heap>(
    context: &mut HirContext<'_, 'heap>,
    diagnostics: ReificationDiagnosticIssues,
    node: Option<Node<'heap>>,
    root_span: SpanId,
    target: ReificationTarget,
) -> ReificationStatus<Node<'heap>> {
    // Pre-fill `HirMap` so downstream passes can index every allocated `HirId`.
    context.map.populate(context.counter.hir.bound());

    let status = diagnostics.into_status(());
    match (node, status) {
        (Some(node), Ok(success)) => Ok(success.map(|()| node)),
        (None, Ok(success)) => {
            let message = match target {
                ReificationTarget::Expr => {
                    "reification produced no node without reporting a critical diagnostic"
                }
                ReificationTarget::Value => {
                    "value reification produced no node without reporting a critical diagnostic"
                }
            };
            let Err(error) = internal_error(root_span, message).specialize() else {
                unreachable!("internal error should be an ICE");
            };

            let mut status = Status::failure(error);
            status.append_diagnostics(&mut success.advisories.generalize());
            status
        }
        // Critical diagnostics take priority over any partial node.
        (Some(_) | None, Err(failure)) => Err(failure),
    }
}

impl<'heap> NodeData<'heap> {
    /// Reifies a lowered AST expression into an interned HIR [`Node`].
    ///
    /// Uses `types` from AST lowering for local type definitions, type assertions, and closure
    /// signatures. Temporary reification state is allocated in `alloc`.
    ///
    /// # Errors
    ///
    /// Fails with a [`ReificationDiagnosticCategory`](self::error::ReificationDiagnosticCategory)
    /// diagnostic if `expr` contains an underscore in expression position, an unlowered AST node,
    /// an error placeholder, or a violated compiler invariant.
    pub fn from_ast_in<'env, A>(
        expr: Expr<'heap>,
        context: &mut HirContext<'env, 'heap>,
        types: &ExtractedTypes<'heap>,
        alloc: A,
    ) -> ReificationStatus<Node<'heap>>
    where
        A: Allocator + Clone,
    {
        expr::ExprReifier::new(context, types, alloc).reify(expr)
    }
}

impl<'heap> Value<'heap> {
    /// Reifies a value-only AST node into an interned HIR [`Value`].
    ///
    /// Interns the literal and compound data nodes of `value` into `context`, using `alloc` for
    /// temporary reification scratch buffers.
    ///
    /// # Errors
    ///
    /// Fails with a [`ReificationDiagnosticCategory`](self::error::ReificationDiagnosticCategory)
    /// diagnostic if `value` contains a non-value expression or an error placeholder.
    pub fn from_ast_in<'env, A>(
        value: hashql_ast::node::value::Value<'heap>,
        context: &mut HirContext<'env, 'heap>,
        alloc: A,
    ) -> ReificationStatus<Self>
    where
        A: Allocator + Clone,
    {
        value::ValueReifier::new(context, alloc)
            .reify(value.into_expr())
            .map_value(Self::new_unchecked)
    }
}
