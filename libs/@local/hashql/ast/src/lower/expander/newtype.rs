use core::mem;

use hashql_core::{
    heap::{self, BumpAllocator},
    module::Universe,
    span::SpanId,
    symbol::{Ident, sym},
};

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
    let (name, constraints) = if let Some(result) = argument_to_generic_ident(expander, name) {
        result
    } else {
        expander
            .diagnostics
            .push(error::invalid_newtype_binding_name(name));

        (
            Ident::synthetic(sym::dummy),
            heap::Vec::new_in(expander.heap),
        )
    };

    let mut value = mem::replace(&mut value.value, Expr::dummy());
    let mut body = mem::replace(&mut body.value, Expr::dummy());

    let (_, expr) = expander.bind_many_with(
        constraints,
        |constraints, binder| {
            binder.bind(name.value, Universe::Type);
            binder.bind(name.value, Universe::Value);
            for constraint in constraints {
                binder.bind(constraint.name.value, Universe::Type);
            }
        },
        |expander, constraints| {
            expander.with_universe(Universe::Type, |expander| {
                expander.visit(&mut value);
            });

            expander.visit(&mut body);
            let value = lower_expr_to_type(expander, value);

            Expr {
                id: NodeId::PLACEHOLDER,
                span,
                kind: ExprKind::NewType(NewTypeExpr {
                    id: NodeId::PLACEHOLDER,
                    span,
                    name,
                    constraints: mem::replace(constraints, Vec::new_in(expander.heap)),
                    value: Box::new_in(value, expander.heap),
                    body: Box::new_in(body, expander.heap),
                }),
            }
        },
    );

    if name.value == sym::dummy {
        return Expr::dummy();
    }

    expr
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
