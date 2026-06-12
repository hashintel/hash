use core::mem;

use hashql_core::{heap::BumpAllocator, module::Universe, span::SpanId, symbol::Ident};

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
    let Some(name) = argument_to_ident(name) else {
        expander
            .diagnostics
            .push(error::invalid_input_binding_name(name));
        return Expr::dummy();
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
