use core::mem;

use hashql_core::{
    collections::fast_hash_map_with_capacity_in,
    heap::{self, BumpAllocator},
    module::Universe,
    span::SpanId,
};

use super::{Expander, r#let::expr_to_ident, r#type::lower_expr_to_type};
use crate::{
    lower::expander::error,
    node::{
        expr::{
            CallExpr, ClosureExpr, Expr, ExprKind,
            call::Argument,
            closure::{ClosureParam, ClosureSignature},
        },
        generic::{GenericParam, Generics},
        id::NodeId,
    },
};

fn lower_generics_tuple<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    tuple: &mut crate::node::expr::TupleExpr<'heap>,
) -> Generics<'heap> {
    if let Some(annotation) = tuple.r#type.as_ref() {
        expander
            .diagnostics
            .push(error::fn_generics_type_annotation(annotation.span));
    }

    let mut params = Vec::with_capacity_in(tuple.elements.len(), expander.heap);

    for element in &mut tuple.elements {
        let Some(ident) = expr_to_ident(&element.value) else {
            expander
                .diagnostics
                .push(error::invalid_fn_generic_param(element.value.span));

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

fn lower_generics_struct<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    r#struct: &mut crate::node::expr::StructExpr<'heap>,
) -> Generics<'heap>
where
    S: BumpAllocator,
{
    if let Some(annotation) = r#struct.r#type.as_ref() {
        expander
            .diagnostics
            .push(error::fn_generics_type_annotation(annotation.span));
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
                            !matches!(bound.kind, crate::node::r#type::TypeKind::Infer)
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

fn lower_generics<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    generics: &mut Argument<'heap>,
) -> Generics<'heap>
where
    S: BumpAllocator,
{
    let mut generics = match &mut generics.value.kind {
        ExprKind::Tuple(tuple) => lower_generics_tuple(expander, tuple),
        ExprKind::Struct(r#struct) => lower_generics_struct(expander, r#struct),
        ExprKind::Call(_)
        | ExprKind::Dict(_)
        | ExprKind::List(_)
        | ExprKind::Literal(_)
        | ExprKind::Path(_)
        | ExprKind::Let(_)
        | ExprKind::Type(_)
        | ExprKind::NewType(_)
        | ExprKind::Input(_)
        | ExprKind::Closure(_)
        | ExprKind::If(_)
        | ExprKind::Field(_)
        | ExprKind::Index(_)
        | ExprKind::As(_)
        | ExprKind::Underscore
        | ExprKind::Dummy => {
            expander
                .diagnostics
                .push(error::invalid_fn_generics(generics.value.span));

            Generics {
                id: NodeId::PLACEHOLDER,
                span: generics.value.span,
                params: heap::Vec::new_in(expander.heap),
            }
        }
    };

    {
        let diagnostics = &mut expander.diagnostics;
        expander.scratch.scoped_mut(|scratch| {
            let mut seen = fast_hash_map_with_capacity_in(generics.params.len(), scratch);

            generics.params.retain(|param| {
                if let Err(error) = seen.try_insert(param.name.value, param.span) {
                    diagnostics.push(error::duplicate_fn_generic(
                        param.span,
                        param.name.value,
                        *error.entry.get(),
                    ));
                    return false;
                }

                true
            });
        });
    }

    generics
}

fn lower_params<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    params: &mut Argument<'heap>,
) -> heap::Vec<'heap, ClosureParam<'heap>>
where
    S: BumpAllocator,
{
    let ExprKind::Struct(r#struct) = &mut params.value.kind else {
        expander
            .diagnostics
            .push(error::invalid_fn_params(params.value.span));

        return heap::Vec::new_in(expander.heap);
    };

    if let Some(annotation) = r#struct.r#type.as_ref() {
        expander
            .diagnostics
            .push(error::fn_params_type_annotation(annotation.span));
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

    {
        let diagnostics = &mut expander.diagnostics;
        expander.scratch.scoped_mut(|scratch| {
            let mut seen = fast_hash_map_with_capacity_in(params.len(), scratch);

            params.retain(|param| {
                if let Err(error) = seen.try_insert(param.name.value, param.span) {
                    diagnostics.push(error::duplicate_fn_parameter(
                        param.span,
                        param.name.value,
                        *error.entry.get(),
                    ));
                    return false;
                }

                true
            });
        });
    }

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
            let params = lower_params(expander, params);

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

/// Lowers a `fn` call into a [`ClosureExpr`].
///
/// Form: `(fn generics params return-type body)` where:
/// - `generics` is a tuple `(T, U)` or struct `(T: bound, U: _)` of type parameters
/// - `params` is a struct `(x: int, y: string)` of named parameters
/// - `return-type` is a type expression
/// - `body` is the function body
///
/// Generic names are bound in the type universe. Parameter names are
/// bound in the value universe. Both are in scope for the return type
/// and body.
///
/// [`ClosureExpr`]: crate::node::expr::ClosureExpr
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
        expander
            .diagnostics
            .push(error::labeled_arguments_in_fn(labeled_arguments));
    }

    if let [generics, params, r#return, body] = &mut **arguments {
        lower_fn_impl(*span, expander, generics, params, r#return, body)
    } else {
        expander
            .diagnostics
            .push(error::invalid_fn_argument_count(*span, arguments));

        Expr::dummy()
    }
}
