use core::mem;

use hashql_core::{module::Universe, span::SpanId};

use super::Expander;
use crate::{
    lower::expander::r#type::lower_expr_to_type,
    node::{
        expr::{AsExpr, CallExpr, Expr, ExprKind, call::Argument},
        id::NodeId,
    },
};

fn lower_as_impl<'heap>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap>,

    body: &mut Argument<'heap>,
    r#type: &mut Argument<'heap>,
) -> Expr<'heap> {
    let mut body = mem::replace(&mut body.value, Expr::dummy());
    let mut r#type = mem::replace(&mut r#type.value, Expr::dummy());

    expander.visit(&mut body);
    expander.with_universe(Universe::Type, |expander| expander.visit(&mut r#type));
    let r#type = lower_expr_to_type(expander, r#type);

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::As(AsExpr {
            id: NodeId::PLACEHOLDER,
            span,
            value: Box::new_in(body, expander.heap),
            r#type: Box::new_in(r#type, expander.heap),
        }),
    }
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
