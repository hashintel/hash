use core::mem;

use hashql_core::{
    heap::{self, BumpAllocator, Heap},
    module::Universe,
    span::SpanId,
    symbol::{Symbol, sym::path::r#type},
};

use super::{Expander, r#let::expr_to_ident, r#type::lower_expr_to_type};
use crate::node::{
    expr::{
        CallExpr, ClosureExpr, Expr, ExprKind,
        call::Argument,
        closure::{ClosureParam, ClosureSignature},
    },
    generic::{GenericParam, Generics},
    id::NodeId,
};

fn lower_generics<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    generics: &mut Argument<'heap>,
) -> Generics<'heap>
where
    S: BumpAllocator,
{
    match &mut generics.value.kind {
        ExprKind::Tuple(tuple) => {
            if let Some(annotation) = tuple.r#type.as_ref() {
                todo!("ERROR: issue diagnostic");
            }

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
            if let Some(annotation) = r#struct.r#type.as_ref() {
                todo!("ERROR: issue diagnostic");
            }

            let mut params = Vec::with_capacity_in(r#struct.entries.len(), expander.heap);

            expander.with_universe(Universe::Type, |expander| {
                expander.bind_many_with(
                    &mut r#struct.entries,
                    |entries, binder| {
                        for entry in &**entries {
                            binder.bind(entry.key.value, Universe::Type);
                        }
                    },
                    |expander, entries| {
                        for mut entry in entries.drain(..) {
                            expander.visit(&mut entry.value);
                            let bound = lower_expr_to_type(expander, entry.value);

                            params.push(GenericParam {
                                id: NodeId::PLACEHOLDER,
                                span: entry.span,
                                name: entry.key,
                                bound: Some(bound).filter(|bound| {
                                    matches!(bound.kind, crate::node::r#type::TypeKind::Infer)
                                }),
                            });
                        }
                    },
                )
            });

            Generics {
                id: NodeId::PLACEHOLDER,
                span: r#struct.span,
                params,
            }
        }
        _ => todo!("error out and return empty"),
    }
}

fn lower_params<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    generics: &Generics<'heap>,
    params: &mut Argument<'heap>,
) -> heap::Vec<'heap, ClosureParam<'heap>>
where
    S: BumpAllocator,
{
    let ExprKind::Struct(r#struct) = &mut params.value.kind else {
        todo!("ERROR: issue diagnostic");
        return heap::Vec::new_in(expander.heap);
    };

    if let Some(annotation) = r#struct.r#type.as_ref() {
        todo!("ERROR: issue diagnostic");
    }

    let mut params = Vec::with_capacity_in(r#struct.entries.len(), expander.heap);

    expander.with_universe(Universe::Type, |expander| {
        for mut entry in r#struct.entries.drain(..) {
            expander.visit(&mut entry.value);
            let bound = lower_expr_to_type(expander, entry.value);

            params.push(ClosureParam {
                id: NodeId::PLACEHOLDER,
                span: entry.span,
                name: entry.key,
                bound,
            });
        }
    });

    params
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
    let generics = lower_generics(expander, generics);

    let (params, returns, body) = expander.bind_many(
        generics
            .params
            .iter()
            .map(|param| (param.name.value, Universe::Type)),
        |expander| {
            let params = lower_params(expander, &generics, params);

            let (returns, body) = expander.bind_many(
                params
                    .iter()
                    .map(|param| (param.name.value, Universe::Value)),
                |expander| {
                    expander.with_universe(Universe::Type, |expander| {
                        expander.visit(&mut r#return.value);
                    });

                    let returns = mem::replace(&mut r#return.value, Expr::dummy());
                    let returns = lower_expr_to_type(expander, returns);

                    expander
                        .with_universe(Universe::Value, |expander| expander.visit(&mut body.value));

                    let body = mem::replace(&mut body.value, Expr::dummy());

                    (returns, body)
                },
            );

            (params, returns, body)
        },
    );

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Closure(ClosureExpr {
            id: NodeId::PLACEHOLDER,
            span,
            signature: Box::new_in(
                ClosureSignature {
                    id: NodeId::PLACEHOLDER,
                    // TODO(BE-76): We can narrow this significantly if we have the possibility of
                    // span tree creation inside the AST
                    span,
                    generics,
                    inputs: params,
                    output: returns,
                },
                expander.heap,
            ),
            body: Box::new_in(body, expander.heap),
        }),
    }
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
