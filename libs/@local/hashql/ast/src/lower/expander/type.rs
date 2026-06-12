use hashql_core::{
    module::item::{IntrinsicItem, Item},
    symbol::sym,
};

use super::Expander;
use crate::node::{
    expr::{CallExpr, Expr, ExprKind},
    id::NodeId,
    r#type::{IntersectionType, StructType, TupleType, Type, TypeKind, UnionType},
};

fn lower_call_to_type<'heap>(
    expander: &mut Expander<'_, 'heap>,
    mut call: CallExpr<'heap>,
) -> Type<'heap> {
    if !call.labeled_arguments.is_empty() {
        todo!("ERROR: labeled arguments are not supported in type calls");
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
        todo!("ERROR: unrecognized constructor function");
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
            todo!("ERROR: unrecognized constructor function");
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
            if let Some(existing) = &tuple.r#type {
                todo!("ERROR: tuple has a type annotation in a type position, invalid")
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
            if let Some(existing) = &r#struct.r#type {
                todo!("ERROR: tuple has a type annotation in a type position, invalid")
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
            todo!("ERROR: cannot use in type position");

            Type {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                kind: TypeKind::Dummy,
            }
        }
    }
}
