use core::mem;

use hashql_core::{heap::BumpAllocator, span::SpanId};

use super::Expander;
use crate::{
    lower::expander::{
        error,
        r#type::{argument_to_generic_ident, lower_expr_to_type},
    },
    node::{
        expr::{CallExpr, Expr, ExprKind, NewTypeExpr, call::Argument},
        id::NodeId,
    },
};

fn lower_newtype_impl<'heap, S>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap, S>,

    name: &mut Argument<'heap>,
    value: &mut Argument<'heap>,
    body: &mut Argument<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let Some((name, constraints)) = argument_to_generic_ident(expander, name) else {
        expander
            .diagnostics
            .push(error::invalid_newtype_binding_name(name));

        return Expr::dummy();
    };

    let mut value = mem::replace(&mut value.value, Expr::dummy());
    let mut body = mem::replace(&mut body.value, Expr::dummy());

    expander.with_universe(hashql_core::module::Universe::Type, |expander| {
        expander.visit(&mut value)
    });
    let value = lower_expr_to_type(expander, value);

    expander.bind_many(
        // Newtype expressions are scoped to both universes
        [
            (name.value, hashql_core::module::Universe::Type),
            (name.value, hashql_core::module::Universe::Value),
        ],
        |expander| expander.visit(&mut body),
    );

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::NewType(NewTypeExpr {
            id: NodeId::PLACEHOLDER,
            span,
            name,
            constraints,
            value: Box::new_in(value, expander.heap),
            body: Box::new_in(body, expander.heap),
        }),
    }
}

/// Lowers a `newtype` call into a [`NewTypeExpr`].
///
/// Form: `(newtype Name type-expr body)`. Like `type`, but introduces a
/// distinct nominal type rather than an alias. The name is bound in both
/// the type and value universes for `body` (the value binding acts as a
/// constructor).
///
/// [`NewTypeExpr`]: crate::node::expr::NewTypeExpr
pub(super) fn lower_newtype<'heap, S>(
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
            .push(error::labeled_arguments_in_newtype(labeled_arguments));
    }

    if let [name, value, body] = &mut **arguments {
        lower_newtype_impl(*span, expander, name, value, body)
    } else {
        expander
            .diagnostics
            .push(error::invalid_newtype_argument_count(*span, arguments));

        Expr::dummy()
    }
}
