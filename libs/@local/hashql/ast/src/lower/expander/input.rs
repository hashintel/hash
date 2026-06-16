use core::mem;

use hashql_core::{
    heap::BumpAllocator,
    module::Universe,
    span::SpanId,
    symbol::{Ident, sym},
};

use super::Expander;
use crate::{
    lower::expander::{error, r#type::lower_expr_to_type},
    node::{
        expr::{CallExpr, Expr, ExprKind, InputExpr, call::Argument},
        id::NodeId,
    },
};

fn argument_to_ident<'heap>(argument: &Argument<'heap>) -> Option<Ident<'heap>> {
    if let ExprKind::Path(path) = &argument.value.kind
        && let Some(&ident) = path.as_ident()
    {
        Some(ident)
    } else {
        None
    }
}

fn lower_input_impl<'heap, S>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap, S>,

    name: &Argument<'heap>,
    r#type: &mut Argument<'heap>,
    default: Option<&mut Argument<'heap>>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let name = if let Some(name) = argument_to_ident(name) {
        name
    } else {
        expander
            .diagnostics
            .push(error::invalid_input_binding_name(name));

        Ident::synthetic(sym::dummy)
    };

    let mut type_expr = mem::replace(&mut r#type.value, Expr::dummy());
    expander.with_universe(Universe::Type, |expander| {
        expander.visit(&mut type_expr);
    });
    let r#type = lower_expr_to_type(expander, type_expr);

    let default = default.map(|default| {
        let mut value = mem::replace(&mut default.value, Expr::dummy());
        expander.visit(&mut value);
        Box::new_in(value, expander.heap)
    });

    if name.value == sym::dummy {
        return Expr::dummy();
    }

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Input(InputExpr {
            id: NodeId::PLACEHOLDER,
            span,
            name,
            r#type: Box::new_in(r#type, expander.heap),
            default,
        }),
    }
}

/// Lowers an `input` call into an [`InputExpr`].
///
/// Accepts two forms:
/// - `(input name type)` for a required input
/// - `(input name type default)` for an input with a default value
///
/// The type is resolved in the type universe. The default (if present)
/// is resolved in the value universe.
///
/// [`InputExpr`]: crate::node::expr::InputExpr
pub(super) fn lower_input<'heap, S>(
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
            .push(error::labeled_arguments_in_input(labeled_arguments));
    }

    match &mut **arguments {
        [name, r#type] => lower_input_impl(*span, expander, name, r#type, None),
        [name, r#type, default] => lower_input_impl(*span, expander, name, r#type, Some(default)),
        _ => {
            expander
                .diagnostics
                .push(error::invalid_input_argument_count(*span, arguments));

            Expr::dummy()
        }
    }
}
