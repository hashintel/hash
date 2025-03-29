use hashql_ast::node::{
    generic::{GenericArgument, GenericParam, Generics},
    id::NodeId,
};
use winnow::{
    ModalResult, Parser as _,
    combinator::{delimited, opt, preceded},
    error::ParserError,
};

use super::{
    combinator::{separated_boxed1, ws},
    context::Input,
    ident::parse_ident,
    r#type::parse_type,
};

pub(crate) fn parse_generic_argument<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<GenericArgument<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    parse_type
        .with_span()
        .map(|(r#type, span)| GenericArgument {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            r#type: context.heap.boxed(r#type),
        })
        .parse_next(input)
}

fn parse_generic_param<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<GenericParam<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    (parse_ident, opt(preceded(":", parse_type)))
        .with_span()
        .map(|((name, bound), span)| GenericParam {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            name,
            bound: bound.map(|bound| context.heap.boxed(bound)),
        })
        .parse_next(input)
}

pub(crate) fn parse_generics<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Generics<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    delimited(
        "<",
        separated_boxed1(context.heap, parse_generic_param, ws(",")),
        ">",
    )
    .with_span()
    .map(|(params, span)| Generics {
        id: NodeId::PLACEHOLDER,
        span: context.span(span),
        params,
    })
    .parse_next(input)
}
