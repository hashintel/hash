use hashql_ast::node::{
    expr::{
        DictExpr, Expr, ExprKind, ListExpr, LiteralExpr, StructExpr, TupleExpr, dict::DictEntry,
        list::ListElement, r#struct::StructEntry, tuple::TupleElement,
    },
    id::NodeId,
};
use hashql_core::value::{self, Primitive};

use super::{Lowerer, wrap_object};
use crate::{
    cst::{self, Node as _, Token as _},
    embedded::parse_ident_from_string,
    error::constructor,
};

pub(crate) fn lower_literal<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    node: cst::Literal<'_>,
) -> Option<Expr<'heap>> {
    let (mut literal, r#type) =
        lowerer.lower_typed_pair(node.type_field(), node.field(), |lowerer, field| {
            let value = field.value()?;
            lower_literal_value(lowerer, value)
        })?;
    literal.r#type = r#type;

    let span = lowerer.insert_range(node.text_range());
    Some(Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Literal(literal),
    })
}

fn lower_literal_value<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    value: cst::LiteralValue<'_>,
) -> Option<LiteralExpr<'heap>> {
    let kind = match value.token()? {
        cst::LiteralToken::Null(_) => Primitive::Null,
        cst::LiteralToken::Bool(token) => Primitive::Boolean(token.value()),
        cst::LiteralToken::Number(token) => {
            let symbol = lowerer.heap().intern_symbol(token.text());
            if token.is_float() {
                Primitive::Float(value::Float::new_unchecked(symbol))
            } else {
                Primitive::Integer(value::Integer::new_unchecked(symbol))
            }
        }
        cst::LiteralToken::String(token) => {
            let Ok(decoded) = token.decode() else {
                return None;
            };
            Primitive::String(value::String::new(lowerer.heap().intern_symbol(&decoded)))
        }
    };

    let span = lowerer.insert_range(value.text_range());
    Some(LiteralExpr {
        id: NodeId::PLACEHOLDER,
        span,
        kind,
        r#type: None,
    })
}

pub(crate) fn lower_struct<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    node: cst::Struct<'_, cst::Expr<'_>>,
) -> Option<Expr<'heap>> {
    let (mut struct_expr, r#type) =
        lowerer.lower_typed_pair(node.type_field(), node.field(), |lowerer, field| {
            let body = field.body()?;
            lower_struct_body(lowerer, body)
        })?;
    struct_expr.r#type = r#type;

    let span = lowerer.insert_range(node.text_range());
    Some(Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Struct(struct_expr),
    })
}

fn lower_struct_body<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    body: cst::StructBody<'_, cst::Expr<'_>>,
) -> Option<StructExpr<'heap>> {
    let heap = lowerer.heap();
    let mut entries = Vec::new_in(heap);
    let mut ok = true;

    for entry in body.entries() {
        let ident = entry.key().and_then(|token| {
            let Ok(decoded) = token.decode() else {
                return None;
            };
            let key_span = lowerer.insert_range(token.text_range());
            match parse_ident_from_string(heap, lowerer.spans_mut(), key_span, &decoded) {
                Ok(ident) => Some(ident),
                Err(error) => {
                    let error = (error.offset(), error.into_inner());
                    let diagnostic = constructor::struct_key_expected_identifier(
                        lowerer.spans_mut(),
                        key_span,
                        token.text(),
                        &decoded,
                        error,
                    )
                    .map_category(wrap_object)
                    .generalize();
                    lowerer.push_diagnostic(diagnostic);
                    None
                }
            }
        });

        let value = entry.value().and_then(|expr| lowerer.lower_expr(expr));
        match (ident, value) {
            (Some(key), Some(value)) => {
                let span = lowerer.insert_range(entry.text_range());
                entries.push(StructEntry {
                    id: NodeId::PLACEHOLDER,
                    span,
                    key,
                    value,
                });
            }
            _ => ok = false,
        }
    }

    if !ok {
        return None;
    }

    let span = lowerer.insert_range(body.text_range());
    Some(StructExpr {
        id: NodeId::PLACEHOLDER,
        span,
        entries,
        r#type: None,
    })
}

pub(crate) fn lower_tuple<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    node: cst::Tuple<'_, cst::Expr<'_>>,
) -> Option<Expr<'heap>> {
    let (mut tuple_expr, r#type) =
        lowerer.lower_typed_pair(node.type_field(), node.field(), |lowerer, field| {
            let body = field.body()?;
            lower_tuple_body(lowerer, body)
        })?;
    tuple_expr.r#type = r#type;

    let span = lowerer.insert_range(node.text_range());
    Some(Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Tuple(tuple_expr),
    })
}

fn lower_tuple_body<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    body: cst::TupleBody<'_, cst::Expr<'_>>,
) -> Option<TupleExpr<'heap>> {
    let mut elements = Vec::new_in(lowerer.heap());
    let mut ok = true;

    for element in body.elements() {
        if let Some(expr) = element.value().and_then(|expr| lowerer.lower_expr(expr)) {
            elements.push(TupleElement {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                value: expr,
            });
        } else {
            ok = false;
        }
    }

    if !ok {
        return None;
    }

    let span = lowerer.insert_range(body.text_range());
    Some(TupleExpr {
        id: NodeId::PLACEHOLDER,
        span,
        elements,
        r#type: None,
    })
}

pub(crate) fn lower_list<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    node: cst::List<'_, cst::Expr<'_>>,
) -> Option<Expr<'heap>> {
    let (mut list_expr, r#type) =
        lowerer.lower_typed_pair(node.type_field(), node.field(), |lowerer, field| {
            let body = field.body()?;
            lower_list_body(lowerer, body)
        })?;
    list_expr.r#type = r#type;

    let span = lowerer.insert_range(node.text_range());
    Some(Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::List(list_expr),
    })
}

fn lower_list_body<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    body: cst::ListBody<'_, cst::Expr<'_>>,
) -> Option<ListExpr<'heap>> {
    let heap = lowerer.heap();
    let mut elements = Vec::new_in(heap);
    let mut ok = true;

    for element in body.elements() {
        if let Some(expr) = element.value().and_then(|expr| lowerer.lower_expr(expr)) {
            elements.push(ListElement {
                id: NodeId::PLACEHOLDER,
                span: expr.span,
                value: Box::new_in(expr, heap),
            });
        } else {
            ok = false;
        }
    }

    if !ok {
        return None;
    }

    let span = lowerer.insert_range(body.text_range());
    Some(ListExpr {
        id: NodeId::PLACEHOLDER,
        span,
        elements,
        r#type: None,
    })
}

pub(crate) fn lower_dict<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    node: cst::Dict<'_, cst::Expr<'_>>,
) -> Option<Expr<'heap>> {
    let (mut dict_expr, r#type) =
        lowerer.lower_typed_pair(node.type_field(), node.field(), |lowerer, field| {
            let body = field.body()?;
            lower_dict_body(lowerer, body)
        })?;
    dict_expr.r#type = r#type;

    let span = lowerer.insert_range(node.text_range());
    Some(Expr {
        id: NodeId::PLACEHOLDER,
        span,
        kind: ExprKind::Dict(dict_expr),
    })
}

fn lower_dict_body<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    body: cst::DictBody<'_, cst::Expr<'_>>,
) -> Option<DictExpr<'heap>> {
    match body {
        cst::DictBody::Object(object) => lower_dict_object_body(lowerer, object),
        cst::DictBody::Array(array) => lower_dict_array_body(lowerer, array),
    }
}

fn lower_dict_object_body<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    body: cst::DictObjectBody<'_, cst::Expr<'_>>,
) -> Option<DictExpr<'heap>> {
    let heap = lowerer.heap();
    let mut entries = Vec::new_in(heap);
    let mut ok = true;

    for entry in body.entries() {
        let key_expr = entry.key().and_then(|token| {
            let Ok(decoded) = token.decode() else {
                return None;
            };
            let key_span = lowerer.insert_range(token.text_range());
            Some(Expr {
                id: NodeId::PLACEHOLDER,
                span: key_span,
                kind: ExprKind::Literal(LiteralExpr {
                    id: NodeId::PLACEHOLDER,
                    span: key_span,
                    kind: Primitive::String(value::String::new(heap.intern_symbol(&decoded))),
                    r#type: None,
                }),
            })
        });

        let value = entry.value().and_then(|expr| lowerer.lower_expr(expr));
        match (key_expr, value) {
            (Some(key), Some(value)) => {
                let span = lowerer.insert_range(entry.text_range());
                entries.push(DictEntry {
                    id: NodeId::PLACEHOLDER,
                    span,
                    key: Box::new_in(key, heap),
                    value: Box::new_in(value, heap),
                });
            }
            _ => ok = false,
        }
    }

    if !ok {
        return None;
    }

    let span = lowerer.insert_range(body.text_range());
    Some(DictExpr {
        id: NodeId::PLACEHOLDER,
        span,
        entries,
        r#type: None,
    })
}

fn lower_dict_array_body<'heap>(
    lowerer: &mut Lowerer<'heap, '_>,
    body: cst::DictArrayBody<'_, cst::Expr<'_>>,
) -> Option<DictExpr<'heap>> {
    let heap = lowerer.heap();
    let mut entries = Vec::new_in(heap);
    let mut ok = true;

    for entry in body.entries() {
        let mut key = None;
        let mut value = None;
        let mut count = 0_usize;

        for item in entry.items() {
            let expr = lowerer.lower_expr(item);
            match count {
                0 => key = expr,
                1 => value = expr,
                _ => {}
            }
            count += 1;
        }

        if count == 2
            && let (Some(key), Some(value)) = (key, value)
        {
            let span = lowerer.insert_range(entry.text_range());
            entries.push(DictEntry {
                id: NodeId::PLACEHOLDER,
                span,
                key: Box::new_in(key, heap),
                value: Box::new_in(value, heap),
            });
        } else {
            ok = false;
        }
    }

    if !ok {
        return None;
    }

    let span = lowerer.insert_range(body.text_range());
    Some(DictExpr {
        id: NodeId::PLACEHOLDER,
        span,
        entries,
        r#type: None,
    })
}
