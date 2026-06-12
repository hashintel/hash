use core::mem;

use hashql_core::span::SpanId;

use super::Expander;
use crate::{
    lower::expander::error,
    node::{
        expr::{CallExpr, Expr, ExprKind, IndexExpr, call::Argument},
        id::NodeId,
    },
};

fn lower_index_impl<'heap>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap>,

    value: &mut Argument<'heap>,
    index: &mut Argument<'heap>,
) -> Expr<'heap> {
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

pub(super) fn lower_index<'heap>(
    expander: &mut Expander<'_, 'heap>,
    CallExpr {
        id: _,
        span,
        function: _,
        arguments,
        labeled_arguments,
    }: &mut CallExpr<'heap>,
) -> Expr<'heap> {
    if !labeled_arguments.is_empty() {
        expander
            .diagnostics
            .push(error::labeled_arguments_in_index(labeled_arguments));
    }

    match &mut **arguments {
        [value, index] => lower_index_impl(*span, expander, value, index),
        _ => {
            expander
                .diagnostics
                .push(error::invalid_index_argument_count(*span, arguments));

            Expr::dummy()
        }
    }
}
