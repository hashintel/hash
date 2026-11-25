use core::alloc::Allocator;

use hashql_ast::node::{
    expr::{DictExpr, Expr, ListExpr, LiteralExpr, StructExpr, TupleExpr, dict::DictEntry},
    r#type::Type,
};
use hashql_core::{heap, span::SpanId};

use super::error::EnclosingSite;
use crate::{
    intern::Interner,
    node::{
        Node,
        data::{Data, Dict, DictField, List, Struct, StructField, Tuple},
        kind::NodeKind,
    },
};

pub(super) trait DataReifier<'heap> {
    type Scratch: Allocator;

    fn interner(&self) -> &Interner<'heap>;
    fn scratch(&self) -> Self::Scratch;
    fn reify_child(&mut self, site: EnclosingSite<'heap>, expr: Expr<'heap>)
    -> Option<Node<'heap>>;
    fn finish_data(
        &mut self,
        span: SpanId,
        kind: NodeKind<'heap>,
        r#type: Option<heap::Box<'heap, Type<'heap>>>,
    ) -> NodeKind<'heap>;
}

pub(super) fn reify_tuple<'heap, R>(
    reifier: &mut R,
    TupleExpr {
        id: _,
        span,
        elements,
        r#type,
    }: TupleExpr<'heap>,
) -> Option<NodeKind<'heap>>
where
    R: DataReifier<'heap> + ?Sized,
{
    let len = elements.len();
    let mut fields = Vec::with_capacity_in(len, reifier.scratch());

    for (index, element) in elements.into_iter().enumerate() {
        let Some(field) = reifier.reify_child(
            EnclosingSite::TupleElement {
                container: span,
                index,
            },
            element.value,
        ) else {
            continue;
        };

        if fields.len() != index {
            // Skip subsequent pushes once a previous element fails so the scratch buffer avoids
            // unnecessary work on failing trees.
            continue;
        }

        fields.push(field);
    }

    if fields.len() != len {
        return None;
    }

    let kind = NodeKind::Data(Data::Tuple(Tuple {
        fields: reifier.interner().intern_nodes(&fields),
    }));

    Some(reifier.finish_data(span, kind, r#type))
}

pub(super) fn reify_list<'heap, R>(
    reifier: &mut R,
    ListExpr {
        id: _,
        span,
        elements: list_elements,
        r#type,
    }: ListExpr<'heap>,
) -> Option<NodeKind<'heap>>
where
    R: DataReifier<'heap> + ?Sized,
{
    let len = list_elements.len();
    let mut elements = Vec::with_capacity_in(len, reifier.scratch());

    for (index, element) in list_elements.into_iter().enumerate() {
        let Some(element) = reifier.reify_child(
            EnclosingSite::ListElement { container: span },
            *element.value,
        ) else {
            continue;
        };

        if elements.len() != index {
            continue;
        }

        elements.push(element);
    }

    if elements.len() != len {
        return None;
    }

    let kind = NodeKind::Data(Data::List(List {
        elements: reifier.interner().intern_nodes(&elements),
    }));

    Some(reifier.finish_data(span, kind, r#type))
}

pub(super) fn reify_struct<'heap, R>(
    reifier: &mut R,
    StructExpr {
        id: _,
        span,
        entries,
        r#type,
    }: StructExpr<'heap>,
) -> Option<NodeKind<'heap>>
where
    R: DataReifier<'heap> + ?Sized,
{
    let len = entries.len();
    let mut fields = Vec::with_capacity_in(len, reifier.scratch());

    for (index, entry) in entries.into_iter().enumerate() {
        let Some(value) = reifier.reify_child(
            EnclosingSite::StructField {
                field_span: entry.key.span,
                name: entry.key.value,
            },
            entry.value,
        ) else {
            continue;
        };

        if fields.len() != index {
            continue;
        }

        fields.push(StructField {
            name: entry.key,
            value,
        });
    }

    if fields.len() != len {
        return None;
    }

    let kind = NodeKind::Data(Data::Struct(Struct {
        fields: reifier.interner().intern_struct_fields(&mut fields),
    }));

    Some(reifier.finish_data(span, kind, r#type))
}

pub(super) fn reify_dict<'heap, R>(
    reifier: &mut R,
    DictExpr {
        id: _,
        span,
        entries,
        r#type,
    }: DictExpr<'heap>,
) -> Option<NodeKind<'heap>>
where
    R: DataReifier<'heap> + ?Sized,
{
    let len = entries.len();
    let mut fields = Vec::with_capacity_in(len, reifier.scratch());

    for (
        index,
        DictEntry {
            id: _,
            span: _,
            key,
            value,
        },
    ) in entries.into_iter().enumerate()
    {
        let key = reifier.reify_child(EnclosingSite::DictKey { container: span }, *key);
        let value = reifier.reify_child(EnclosingSite::DictValue { container: span }, *value);

        let Some((key, value)) = Option::zip(key, value) else {
            continue;
        };

        if fields.len() != index {
            continue;
        }

        fields.push(DictField { key, value });
    }

    if fields.len() != len {
        return None;
    }

    let kind = NodeKind::Data(Data::Dict(Dict {
        fields: reifier.interner().intern_dict_fields(&fields),
    }));

    Some(reifier.finish_data(span, kind, r#type))
}

pub(super) fn reify_literal<'heap, R>(
    reifier: &mut R,
    LiteralExpr {
        id: _,
        span,
        kind,
        r#type,
    }: LiteralExpr<'heap>,
) -> NodeKind<'heap>
where
    R: DataReifier<'heap> + ?Sized,
{
    let kind = NodeKind::Data(Data::Primitive(kind));
    reifier.finish_data(span, kind, r#type)
}
