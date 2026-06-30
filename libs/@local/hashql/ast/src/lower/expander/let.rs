use core::mem;

use hashql_core::{
    heap::BumpAllocator,
    module::item::Item,
    span::SpanId,
    symbol::{Ident, sym},
};

use super::{BindingKind, CurrentItem, Expander, r#type::lower_expr_to_type};
use crate::{
    lower::expander::error,
    node::{
        expr::{CallExpr, Expr, ExprKind, LetExpr, call::Argument},
        id::NodeId,
    },
};

pub(super) fn expr_to_ident<'heap>(expr: &Expr<'heap>) -> Option<Ident<'heap>> {
    if let ExprKind::Path(path) = &expr.kind
        && let Some(&ident) = path.as_ident()
    {
        Some(ident)
    } else {
        None
    }
}

pub(super) fn argument_to_ident<'heap>(argument: &Argument<'heap>) -> Option<Ident<'heap>> {
    expr_to_ident(&argument.value)
}

fn lower_let_impl<'heap, S>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap, S>,

    name: &Argument<'heap>,
    value: &mut Argument<'heap>,
    r#type: Option<&mut Argument<'heap>>,
    body: &mut Argument<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let name = if let Some(name) = argument_to_ident(name) {
        name
    } else {
        expander
            .diagnostics
            .push(error::invalid_let_binding_name(name));

        Ident::synthetic(sym::dummy)
    };

    let item = expander.visit(&mut value.value);

    let kind = item.filter(|item| !item.has_arguments).map_or(
        BindingKind::Local(hashql_core::module::Universe::Value),
        |item| BindingKind::Remote(item.item),
    );

    expander.bind(name.value, kind, |expander| {
        expander.visit(&mut body.value);
    });

    if let Some(CurrentItem {
        item:
            current_module @ Item {
                kind: hashql_core::module::item::ItemKind::Intrinsic(_),
                ..
            },
        // We cannot replace an alias with arguments, because we'd lose the arguments
        has_arguments: false,
    }) = item
        && current_module.module == expander.special_form_module
    {
        if let Some(r#type) = r#type {
            expander.diagnostics.push(error::intrinsic_type_annotation(
                r#type.value.span,
                value.value.span,
                name.value,
            ));
        }

        // We do not replace every binding outright, only intrinsic ones for one specific reason:
        // intrinsic types cannot be annotated, otherwise the binding survives, as the typechk on
        // the binding could fail (or the typechk is used to narrow the type).
        return mem::replace(&mut body.value, Expr::dummy());
    }

    let r#type = if let Some(r#type) = r#type {
        let mut value = mem::replace(&mut r#type.value, Expr::dummy());

        expander.with_universe(hashql_core::module::Universe::Type, |expander| {
            expander.visit(&mut value);
        });

        Some(lower_expr_to_type(expander, value))
    } else {
        None
    };

    if name.value == sym::dummy {
        return Expr::dummy();
    }

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Let(LetExpr {
            id: NodeId::PLACEHOLDER,
            span,
            name,
            value: Box::new_in(mem::replace(&mut value.value, Expr::dummy()), expander.heap),
            r#type: r#type.map(|r#type| Box::new_in(r#type, expander.heap)),
            body: Box::new_in(mem::replace(&mut body.value, Expr::dummy()), expander.heap),
        }),
    }
}

/// Lowers a `let` call into a [`LetExpr`].
///
/// Accepts two forms:
/// - `(let name value body)` with no type annotation
/// - `(let name type value body)` with an explicit type
///
/// The `name` is bound in scope for `body` only.
///
/// [`LetExpr`]: crate::node::expr::LetExpr
pub(super) fn lower_let<'heap, S>(
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
        // We continue, to try to recover, if that means that the user has a labeled argument
        // instead of a positional one we error twice, but that is deemed acceptable.
        expander
            .diagnostics
            .push(error::labeled_arguments_in_let(labeled_arguments));
    }

    match &mut **arguments {
        [name, value, body] => lower_let_impl(*span, expander, name, value, None, body),
        [name, r#type, value, body] => {
            lower_let_impl(*span, expander, name, value, Some(r#type), body)
        }
        _ => {
            expander
                .diagnostics
                .push(error::invalid_let_argument_count(*span, arguments));

            Expr::dummy()
        }
    }
}
