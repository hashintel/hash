use hashql_core::{
    heap::{BumpAllocator, Heap},
    span::SpanId,
};

use super::{Expander, r#let::expr_to_ident};
use crate::node::{
    expr::{CallExpr, Expr, ExprKind, call::Argument},
    generic::{GenericParam, Generics},
    id::NodeId,
};

fn lower_params<'heap>(span: SpanId, params: &mut Argument<'heap>) -> Expr<'heap> {
    todo!()
}

fn lower_generics<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    generics: &mut Argument<'heap>,
) -> Generics<'heap>
where
    S: BumpAllocator,
{
    match &mut generics.value.kind {
        ExprKind::Tuple(tuple) => {
            let mut params = Vec::with_capacity_in(tuple.elements.len(), expander.heap);

            for element in &mut tuple.elements {
                let Some(ident) = expr_to_ident(&element.value) else {
                    todo!("kael you know what to do");

                    continue;
                };

                params.push(GenericParam {
                    id: NodeId::PLACEHOLDER,
                    span: element.span,
                    name: ident,
                    bound: None,
                });
            }

            Generics {
                id: NodeId::PLACEHOLDER,
                span: tuple.span,
                params,
            }
        }
        ExprKind::Struct(r#struct) => {
            let mut params = Vec::with_capacity_in(r#struct.entries.len(), heap);

            for entry in &mut r#struct.entries {
                todo!("recursive types");
            }

            Generics {
                id: NodeId::PLACEHOLDER,
                span: r#struct.span,
                params,
            }
        }
        _ => todo!("error out and return empty"),
    }
}

fn lower_fn_impl<'heap, S>(
    span: SpanId,
    expander: &mut Expander<'_, 'heap, S>,

    generics: &mut Argument<'heap>,
    params: &mut Argument<'heap>,
    r#return: &mut Argument<'heap>,
    body: &mut Argument<'heap>,
) -> Expr<'heap>
where
    S: BumpAllocator,
{
    todo!()
}

pub(super) fn lower_fn<'heap, S>(
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
        todo!("kael you know what to do");
    }

    if let [generics, params, r#return, body] = &mut **arguments {
        lower_fn_impl(*span, expander, generics, params, r#return, body)
    } else {
        todo!("kael you know what to do");
        Expr::dummy()
    }
}
