use core::mem;

use hashql_core::{heap::BumpAllocator, span::SpanId, symbol::sym};

use super::Expander;
use crate::node::{
    expr::{
        CallExpr, Expr, ExprKind,
        call::Argument,
        r#use::{self, UseKind},
    },
    id::NodeId,
};

fn lower_imports<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    imports: &mut Argument<'heap>,
) -> Option<UseKind<'heap>>
where
    S: BumpAllocator,
{
    match &mut imports.value.kind {
        ExprKind::Path(path)
            if let Some(&ident) = path.as_ident()
                && ident.value.as_constant() == Some(sym::symbol::asterisk::CONST) =>
        {
            Some(UseKind::Glob(r#use::Glob {
                id: NodeId::PLACEHOLDER,
                span: ident.span,
            }))
        }
        ExprKind::Tuple(tuple) => {}
        ExprKind::Struct(r#struct) => {}
        _ => {
            todo!("kael you know what to do");
            None
        }
    }
}

fn lower_use_impl<'heap, S>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap, S>,

    path: &mut Argument<'heap>,
    imports: &mut Argument<'heap>,
    body: &mut Argument<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    let path = mem::replace(&mut path.value, Expr::dummy());
    let ExprKind::Path(path) = path.kind else {
        todo!("kael you know what to do!");
        return Expr::dummy();
    };

    if path.has_generic_arguments() {
        todo!("kael you know what to do!");
        // we continue here, because it's not "fatal"
    }

    todo!()
}

pub(super) fn lower_use<'heap, S>(
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
        todo!("kael you know what to do :3")
    }

    if let [path, imports, body, body] = &mut **arguments {
        lower_use_impl(*span, expander, path, imports, body)
    } else {
        todo!("kael you know what to do :3");

        Expr::dummy()
    }
}
