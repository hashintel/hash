use hashql_ast::node::{
    id::NodeId,
    path::{Path, PathSegment},
};
use winnow::{
    ModalResult, Parser as _,
    combinator::{cut_err, delimited, opt},
    error::{AddContext, ParserError, StrContext, StrContextValue},
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
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    let arguments = opt(delimited(
        ws("<"),
        separated_boxed1(context.heap, parse_generic_argument, ws(",")),
        ws(cut_err(">").context(StrContext::Expected(StrContextValue::CharLiteral('>')))),
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
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    let root = opt(ws("::")).map(|value| value.is_some());
    let segments = separated_boxed1(context.heap, parse_path_segment, ws("::"));

    (root, segments)
        .with_span()
        .map(|((rooted, segments), span)| Path {
            id: NodeId::PLACEHOLDER,
            span: context.span(span),
            rooted,
            segments,
        })
        .context(StrContext::Label("path"))
        .parse_next(input)
}

#[cfg(test)]
mod tests {
    #![expect(clippy::non_ascii_literal)]
    use super::parse_path;
    use crate::parser::string::test::{bind_parser, test_cases};

    // Bind our parser to create a testing function
    bind_parser!(SyntaxDump; fn parse_path_test(parse_path));

    // Basic path structure tests
    test_cases!(parse_path_test;
        simple_identifier("foo") => "Simple identifier path",
        two_segment_path("foo::bar") => "Two-segment path",
        multi_segment_path("foo::bar::baz") => "Multi-segment path",
        rooted_path("::foo") => "Rooted path",
        rooted_multi_segment("::foo::bar") => "Rooted multi-segment path",
    );

    // Generic arguments
    test_cases!(parse_path_test;
        single_generic("Vec<T>") => "Single generic argument",
        multiple_generics("Map<K, V>") => "Multiple generic arguments",
        path_with_generics("std::collections::HashMap<K, V>") => "Path segments with generics",
        nested_generics("Result<Option<T>, E>") => "Nested generic arguments",
        complex_generics("HashMap<String, Vec<Option<T>>>") => "Complex nested generics",
    );

    // Whitespace variations
    test_cases!(parse_path_test;
        path_whitespace("foo :: bar") => "Whitespace around path separator",
        generics_whitespace("Vec< T , U >") => "Whitespace in generic arguments",
        mixed_whitespace("std :: collections :: HashMap< K , V >") => "Mixed whitespace patterns",
    );

    // Edge cases
    test_cases!(parse_path_test;
        unicode_identifier("标识符") => "Unicode identifier",
        mixed_unicode("std::标识符::Vec<T>") => "Mixed Unicode and ASCII in path",
        path_trailing_separator("foo::") => "Path with trailing separator",
        empty_root("::") => "Empty rooted path",
    );

    // Error handling
    test_cases!(parse_path_test;
        unclosed_generic("Vec<T") => "Unclosed generic argument",
        empty_generic_args("Vec<>") => "Empty generic arguments",
        missing_separator("Vec<T U>") => "Missing separator in generic arguments",
        invalid_separator("foo;bar") => "Invalid path separator",
        double_separator("foo::::bar") => "Double path separator",
        empty_path("") => "Empty path",
    );
}
