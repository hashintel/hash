use hashql_ast::node::{
    id::NodeId,
    r#type::{
        IntersectionType, StructField, StructType, TupleField, TupleType, Type, TypeKind, UnionType,
    },
};
use winnow::{
    ModalResult, Parser as _,
    combinator::{alt, delimited, dispatch, opt, peek, repeat, separated_pair, terminated},
    error::ParserError,
    token::any,
};

use super::{
    combinator::{separated_boxed1, ws},
    context::Input,
    ident::parse_ident,
};
use crate::parser::string::path::parse_path;

fn parse_type_infer<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    "_".with_span()
        .map(|(_, span)| Type {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            kind: TypeKind::Infer,
        })
        .parse_next(input)
}

fn parse_type_tuple_field<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<TupleField<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    parse_type
        .with_span()
        .map(|(r#type, span)| TupleField {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            r#type,
        })
        .parse_next(input)
}

fn parse_type_tuple<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let empty = "()".with_span().map(|(_, span)| TupleType {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        fields: context.heap.empty_slice(),
    });

    let fields = delimited(
        ws("("),
        (
            repeat(1.., terminated(parse_type_tuple_field, ws(","))),
            opt(parse_type_tuple_field),
        )
            .map(|(types, last): (Vec<_>, _)| {
                let required_length = types.len() + usize::from(last.is_some());

                let mut vec = context.heap.vec(Some(required_length));

                vec.extend(types);
                vec.extend(last);

                vec.into_boxed_slice()
            }),
        ws(")"),
    )
    .with_span()
    .map(|(fields, span)| TupleType {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        fields,
    });

    alt((empty, fields))
        .map(|tuple| Type {
            id: NodeId::PLACEHOLDER,
            span: tuple.span,
            kind: TypeKind::Tuple(tuple),
        })
        .parse_next(input)
}

fn parse_type_struct_field<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<StructField<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    separated_pair(parse_ident, ws(":"), parse_type)
        .with_span()
        .map(|((name, r#type), span)| StructField {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            name,
            r#type,
        })
        .parse_next(input)
}

fn parse_type_struct<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let empty = "(:)".with_span().map(|(_, span)| StructType {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        fields: context.heap.empty_slice(),
    });

    let fields = delimited(
        ws("("),
        terminated(
            separated_boxed1(context.heap, parse_type_struct_field, ","),
            opt(","),
        ),
        ws(")"),
    )
    .with_span()
    .map(|(fields, span)| StructType {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        fields,
    });

    alt((empty, fields))
        .map(|r#struct| Type {
            id: NodeId::PLACEHOLDER,
            span: r#struct.span,
            kind: TypeKind::Struct(r#struct),
        })
        .parse_next(input)
}

fn parse_type_paren<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    delimited(ws("("), parse_type, ws(")")).parse_next(input)
}

fn parse_type_atom<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let mut path = parse_path.map(|path| Type {
        id: NodeId::PLACEHOLDER,
        span: path.span,
        kind: TypeKind::Path(path),
    });

    dispatch! {peek(any);
        '_' => parse_type_infer,
        '(' => alt((parse_type_paren, parse_type_tuple, parse_type_struct)),
        _ => path
    }
    .parse_next(input)
}

fn parse_type_union<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    separated_boxed1(context.heap, parse_type_atom, ws("|"))
        .with_span()
        .map(|(types, span)| {
            let span = context.span(span);

            Type {
                id: NodeId::PLACEHOLDER,
                span,
                kind: TypeKind::Union(UnionType {
                    id: NodeId::PLACEHOLDER,
                    span,
                    types,
                }),
            }
        })
        .parse_next(input)
}

fn parse_type_intersection<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    separated_boxed1(context.heap, parse_type_union, ws("&"))
        .with_span()
        .map(|(types, span)| {
            let span = context.span(span);

            Type {
                id: NodeId::PLACEHOLDER,
                span,
                kind: TypeKind::Intersection(IntersectionType {
                    id: NodeId::PLACEHOLDER,
                    span,
                    types,
                }),
            }
        })
        .parse_next(input)
}

/// ```abnf
/// infer = "_"
/// tuple = "()" / "(" +(type ",") ?(type) ")"
/// struct = "(:)" / "(" ident ":" type *("," ident ":" type) ?"," ")"
/// paren = "(" type ")"
/// atom = path / tuple / struct / infer / paren
/// union = atom *("|" atom)
/// intersection = union *("&" union)
/// type = intersection
/// ```
pub(crate) fn parse_type<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Type<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    parse_type_intersection.parse_next(input)
}
