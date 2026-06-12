use core::mem;

use hashql_core::{heap::BumpAllocator, span::SpanId};

use super::Expander;
use crate::{
    lower::expander::error,
    node::{
        expr::{CallExpr, Expr, ExprKind, IndexExpr, call::Argument},
        id::NodeId,
    },
};

fn lower_index_impl<'heap, S>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap, S>,

    value: &mut Argument<'heap>,
    index: &mut Argument<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let mut value = mem::replace(&mut value.value, Expr::dummy());
    let mut index = mem::replace(&mut index.value, Expr::dummy());

    expander.visit(&mut value);
    expander.visit(&mut index);

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Index(IndexExpr {
            id: NodeId::PLACEHOLDER,
            span,
            value: Box::new_in(value, expander.heap),
            index: Box::new_in(index, expander.heap),
        }),
    }
}

/// Lowers an `[]` call into an [`IndexExpr`].
///
/// Form: `([] collection index)`. Both arguments are resolved in the
/// current universe.
///
/// [`IndexExpr`]: crate::node::expr::IndexExpr
pub(super) fn lower_index<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    CallExpr {
        id: _,
        span,
        function: _,
        arguments,
        labeled_arguments,
    }: &mut CallExpr<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    if !labeled_arguments.is_empty() {
        expander
            .diagnostics
            .push(error::labeled_arguments_in_index(labeled_arguments));
    }

    if let [value, index] = &mut **arguments {
        lower_index_impl(*span, expander, value, index)
    } else {
        expander
            .diagnostics
            .push(error::invalid_index_argument_count(*span, arguments));

        Expr::dummy()
    }
}
