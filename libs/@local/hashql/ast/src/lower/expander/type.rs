use hashql_core::{
    module::item::{IntrinsicItem, Item},
    symbol::sym,
};

use super::Expander;
use crate::{
    lower::expander::error,
    node::{
        expr::{CallExpr, Expr, ExprKind},
        id::NodeId,
        r#type::{IntersectionType, StructType, TupleType, Type, TypeKind, UnionType},
    },
};

fn lower_call_to_type<'heap>(
    expander: &mut Expander<'_, 'heap>,
    mut call: CallExpr<'heap>,
) -> Type<'heap> {
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

pub(super) fn lower_expr_to_type<'heap>(
    expander: &mut Expander<'_, 'heap>,
    expr: Expr<'heap>,
) -> Type<'heap> {
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
