use hashql_ast::node::{
    id::NodeId,
    path::{Path, PathSegment},
};
use winnow::{
    ModalResult, Parser as _,
    combinator::{delimited, opt},
    error::ParserError,
};

use super::{
    combinator::{separated_boxed1, ws},
    context::Input,
    generic::parse_generic_argument,
    ident::parse_ident,
};

fn parse_path_segment<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<PathSegment<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let arguments = opt(delimited(
        "<",
        separated_boxed1(context.heap, parse_generic_argument, ws(",")),
        ">",
    ));

    (parse_ident, arguments)
        .with_span()
        .map(|((ident, arguments), span)| PathSegment {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            name: ident,
            arguments: arguments.unwrap_or_else(|| context.heap.empty_slice()),
        })
        .parse_next(input)
}

pub(crate) fn parse_path<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Path<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let root = opt("::").map(|value| value.is_some());
    let segments = separated_boxed1(context.heap, parse_path_segment, "::");

    (root, segments)
        .with_span()
        .map(|((rooted, segments), span)| Path {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            rooted,
            segments,
        })
        .parse_next(input)
}

#[cfg(test)]
mod tests {
    #![expect(clippy::non_ascii_literal)]
    use super::parse_path;
    use crate::parser::string::test::{bind_parser, test_cases};

    // Bind our parser to create a testing function
    bind_parser!(SyntaxDump; fn parse(parse_path));

    // TODO: tests
}
