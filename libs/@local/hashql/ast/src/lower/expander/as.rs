use hashql_core::span::SpanId;

use super::Expander;
use crate::node::expr::{CallExpr, Expr, call::Argument};

fn lower_if_impl<'heap>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap>,

    body: &mut Argument<'heap>,
    r#type: &mut Argument<'heap>,
) -> Expr<'heap> {
    todo!()
}

pub(super) fn lower_as<'heap>(
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
        todo!("ERROR: labelled arguments are not supported")
        // we continue after diagnostic issue
    }

    match &mut **arguments {
        [body, r#type] => lower_as_impl(*span, expander, body, r#type),
        _ => {
            todo!("ERROR: issue diagnostic");

            Expr::dummy()
        }
    }
}
