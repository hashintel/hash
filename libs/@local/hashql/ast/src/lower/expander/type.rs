use core::mem;

use hashql_core::{
    collections::fast_hash_map_with_capacity_in,
    heap::{self, BumpAllocator},
    module::item::{IntrinsicItem, Item},
    span::SpanId,
    symbol::{Ident, sym},
};

use super::Expander;
use crate::{
    lower::expander::{error, r#let::argument_to_ident},
    node::{
        expr::{CallExpr, Expr, ExprKind, TypeExpr, call::Argument},
        generic::{self, GenericConstraint},
        id::NodeId,
        path::PathSegmentArgument,
        r#type::{IntersectionType, StructType, TupleType, Type, TypeKind, UnionType},
    },
};

fn lower_call_to_type<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    mut call: CallExpr<'heap>,
) -> Type<'heap>
where
    S: BumpAllocator,
{
    if !call.labeled_arguments.is_empty() {
        expander
            .diagnostics
            .push(error::labeled_arguments_in_type_call(
                &call.labeled_arguments,
            ));
        return Type::dummy();
    }

    let Some(Item {
        module: _,
        name: _,
        kind: hashql_core::module::item::ItemKind::Intrinsic(IntrinsicItem::Type(type_intrinsic)),
    }) = expander.with_universe(hashql_core::module::Universe::Type, |expander| {
        expander.visit(&mut call.function)
    })
    else {
        // Only emit a diagnostic if the function didn't become Dummy from an earlier
        // resolution error. Dummy means a resolution diagnostic was already emitted.
        if !matches!(call.function.kind, ExprKind::Dummy) {
            expander
                .diagnostics
                .push(error::invalid_type_constructor_call(
                    call.function.span,
                    call.span,
                ));
        }

        return Type::dummy();
    };

    let mut types = Vec::with_capacity_in(call.arguments.len(), expander.heap);
    for argument in call.arguments {
        types.push(lower_expr_to_type(expander, argument.value));
    }

    let kind = match type_intrinsic.name.as_constant() {
        Some(sym::path::Union::CONST) => TypeKind::Union(UnionType {
            id: NodeId::PLACEHOLDER,
            span: call.span,
            types,
        }),
        Some(sym::path::Intersection::CONST) => TypeKind::Intersection(IntersectionType {
            id: NodeId::PLACEHOLDER,
            span: call.span,
            types,
        }),
        _ => {
            expander.diagnostics.push(error::type_is_not_callable(
                type_intrinsic.name,
                call.function.span,
                call.span,
            ));
            return Type::dummy();
        }
    };

    Type {
        id: NodeId::PLACEHOLDER,
        span: call.span,
        kind,
    }
}

pub(super) fn lower_expr_to_type<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,
    expr: Expr<'heap>,
) -> Type<'heap>
where
    S: BumpAllocator,
{
    match expr.kind {
        ExprKind::Call(call) => lower_call_to_type(expander, call),
        ExprKind::Tuple(tuple) => {
            if let Some(annotation) = &tuple.r#type {
                // We continue, because it's not fatal, we just ignore it, compilation will
                // terminate before ever reaching the HIR.
                expander
                    .diagnostics
                    .push(error::type_annotation_in_type_position(
                        annotation.span,
                        expr.span,
                        error::AggregateKind::Tuple,
                    ));
            }

            let mut elements = Vec::with_capacity_in(tuple.elements.len(), expander.heap);

            for element in tuple.elements {
                elements.push(crate::node::r#type::TupleField {
                    id: NodeId::PLACEHOLDER,
                    span: element.span,
                    r#type: lower_expr_to_type(expander, element.value),
                });
            }

            Type {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                kind: TypeKind::Tuple(TupleType {
                    id: NodeId::PLACEHOLDER,
                    span: expr.span,
                    fields: elements,
                }),
            }
        }
        ExprKind::Struct(r#struct) => {
            if let Some(annotation) = &r#struct.r#type {
                // We continue, because it's not fatal, we just ignore it, compilation will
                // terminate before ever reaching the HIR.
                expander
                    .diagnostics
                    .push(error::type_annotation_in_type_position(
                        annotation.span,
                        expr.span,
                        error::AggregateKind::Struct,
                    ));
            }

            let mut fields = Vec::with_capacity_in(r#struct.entries.len(), expander.heap);

            for entry in r#struct.entries {
                fields.push(crate::node::r#type::StructField {
                    id: NodeId::PLACEHOLDER,
                    span: entry.span,
                    name: entry.key,
                    r#type: lower_expr_to_type(expander, entry.value),
                });
            }

            Type {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                kind: TypeKind::Struct(StructType {
                    id: NodeId::PLACEHOLDER,
                    span: expr.span,
                    fields,
                }),
            }
        }
        ExprKind::Path(path) => Type {
            id: NodeId::PLACEHOLDER,
            span: expr.span,
            kind: TypeKind::Path(path),
        },
        ExprKind::Underscore => Type {
            id: NodeId::PLACEHOLDER,
            span: expr.span,
            kind: TypeKind::Infer,
        },
        ExprKind::Dict(_)
        | ExprKind::List(_)
        | ExprKind::Literal(_)
        | ExprKind::Let(_)
        | ExprKind::Type(_)
        | ExprKind::NewType(_)
        | ExprKind::Use(_)
        | ExprKind::Input(_)
        | ExprKind::Closure(_)
        | ExprKind::If(_)
        | ExprKind::Field(_)
        | ExprKind::Index(_)
        | ExprKind::As(_)
        | ExprKind::Dummy => {
            if let Some(diagnostic) =
                error::invalid_expression_in_type_position(expr.span, &expr.kind)
            {
                expander.diagnostics.push(diagnostic);
            }

            Type {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                kind: TypeKind::Dummy,
            }
        }
    }
}

fn path_arguments_to_constraints<'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    arguments: &mut [PathSegmentArgument<'heap>],
) -> heap::Vec<'heap, GenericConstraint<'heap>>
where
    S: BumpAllocator,
{
    let mut constraints = heap::Vec::with_capacity_in(arguments.len(), expander.heap);
    let mut seen = fast_hash_map_with_capacity_in(arguments.len(), &expander.scratch);

    for argument in arguments {
        match argument {
            PathSegmentArgument::Argument(generic::GenericArgument {
                id,
                span,
                r#type:
                    Type {
                        id: _,
                        span: _,
                        kind: TypeKind::Path(path),
                    },
            }) if let Some(&ident) = path.as_ident() => {
                // In this case it's simply interpreted as a generic constraint with no bounds.
                if let Err(error) = seen.try_insert(ident.value, ident.span) {
                    todo!("kael you know what to do");
                    continue;
                }

                constraints.push(GenericConstraint {
                    id: *id,
                    span: *span,
                    name: ident,
                    bound: None,
                });
            }
            PathSegmentArgument::Argument(_) => {
                todo!(
                    "kael you know what to do, means that there's no path, we may want to \
                     specialize in case of a path encountered to educate the user"
                )
            }
            PathSegmentArgument::Constraint(generic_constraint) => {
                if let Err(error) =
                    seen.try_insert(generic_constraint.name.value, generic_constraint.name.span)
                {
                    todo!("kael you know what to do");

                    continue;
                }

                constraints.push(GenericConstraint {
                    id: NodeId::PLACEHOLDER,
                    span: generic_constraint.span,
                    name: generic_constraint.name,
                    bound: generic_constraint.bound.take(),
                });
            }
        }
    }

    constraints
}

fn argument_to_generic_ident<'argument, 'heap, S>(
    expander: &mut Expander<'_, 'heap, S>,

    argument: &mut Argument<'heap>,
) -> Option<(Ident<'heap>, heap::Vec<'heap, GenericConstraint<'heap>>)>
where
    S: BumpAllocator,
{
    if let ExprKind::Path(path) = &mut argument.value.kind
        && let Some((name, arguments)) = path.as_generic_ident_mut()
    {
        let constraints = path_arguments_to_constraints(expander, arguments);

        Some((name, constraints))
    } else {
        None
    }
}

fn lower_type_impl<'heap, S>(
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
        todo!("kael you know what to do :3");

        return Expr::dummy();
    };

    let mut value = mem::replace(&mut value.value, Expr::dummy());
    let mut body = mem::replace(&mut body.value, Expr::dummy());

    expander.with_universe(hashql_core::module::Universe::Type, |expander| {
        expander.visit(&mut value)
    });
    let value = lower_expr_to_type(expander, value);

    expander.enter(
        hashql_core::module::Universe::Type,
        name.value,
        None,
        |expander| expander.visit(&mut body),
    );

    Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Type(TypeExpr {
            id: NodeId::PLACEHOLDER,
            span,
            name,
            constraints,
            value: Box::new_in(value, expander.heap),
            body: Box::new_in(body, expander.heap),
        }),
    }
}

pub(super) fn lower_type<'heap, S>(
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
        todo!("kael you know what to do")
    }

    match &mut **arguments {
        [name, value, body] => lower_type_impl(*span, expander, name, value, body),
        _ => {
            todo!("kael you know what to do :3")
        }
    }
}
