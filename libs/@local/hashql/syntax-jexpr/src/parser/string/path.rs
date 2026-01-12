use hashql_ast::node::{
    id::NodeId,
    path::{Path, PathSegment, PathSegmentArgument},
};
use winnow::{
    ModalResult, Parser as _,
    combinator::{alt, cut_err, delimited, opt},
    error::{AddContext, ParserError, StrContext, StrContextValue},
};

use super::{
    combinator::{separated_alloc1, ws},
    context::Input,
    generic::{parse_generic_argument, parse_generic_constraint},
    ident::parse_ident,
};

fn parse_path_segment<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<PathSegment<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let arguments = opt(delimited(
        ws("<"),
        separated_alloc1(
            input.state.heap,
            alt((
                parse_generic_constraint.map(PathSegmentArgument::Constraint),
                parse_generic_argument.map(PathSegmentArgument::Argument),
            )),
            ws(","),
        ),
        ws(cut_err(">").context(StrContext::Expected(StrContextValue::CharLiteral('>')))),
    ));

    let ((ident, arguments), span) = (parse_ident, arguments).with_span().parse_next(input)?;

    Ok(PathSegment {
        id: NodeId::PLACEHOLDER,
        span: input.state.span(span),
        name: ident,
        arguments: arguments.unwrap_or_else(|| Vec::new_in(input.state.heap)),
    })
}

pub(crate) fn parse_path<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Path<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let root = opt(ws("::")).map(|value| value.is_some());
    let segments = separated_alloc1(input.state.heap, parse_path_segment, ws("::"));

    let ((rooted, segments), span) = (root, segments)
        .with_span()
        .context(StrContext::Label("path"))
        .parse_next(input)?;

    Ok(Path {
        id: NodeId::PLACEHOLDER,
        span: input.state.span(span),
        rooted,
        segments,
    })
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

    // Generic Constraints
    test_cases!(parse_path_test;
        simple_constraint("Vec<T: Clone>") => "Simple generic constraint",
        multiple_constraints("Vec<T: Clone, U: Copy>") => "Multiple generic constraints",
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
