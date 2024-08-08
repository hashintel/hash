use hql_cst::{arena::Arena, expr::path::Path};
use winnow::{
    error::ParserError,
    stream::{AsChar, Compare, StreamIsPartial},
    Parser, Stateful,
};

use super::{
    stream::TokenStream,
    string::separated_boxed1,
    symbol::{parse_symbol, ParseRestriction},
};

/// Implementation of Path parsing
///
/// # Syntax
///
/// ```abnf
/// path = symbol *("::" symbol)
/// ```
pub(crate) fn parse_path<'arena, Input, Error>(
    restriction: ParseRestriction,
) -> impl Parser<Stateful<Input, &'arena Arena>, Path<'arena>, Error>
where
    Input: StreamIsPartial
        + TokenStream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'a> Compare<&'a str>,
    Error: ParserError<Stateful<Input, &'arena Arena>>,
{
    move |input: &mut Stateful<Input, &'arena Arena>| {
        trace(
            "path",
            separated_boxed1(input.state, parse_symbol(restriction), "::").map(Path),
        )
        .parse_next(input)
    }
}

#[cfg(test)]
mod test {
    use insta::{assert_debug_snapshot, assert_snapshot};
    use winnow::{
        error::{ContextError, ErrMode, ParseError},
        Parser, Stateful,
    };

    use super::{parse_path, Path};
    use crate::{arena::Arena, symbol::ParseRestriction};

    #[track_caller]
    fn parse<'a, 'b>(
        arena: &'a Arena,
        value: &'b str,
    ) -> Result<Path<'a>, ParseError<Stateful<&'b str, &'a Arena>, ErrMode<ContextError>>> {
        let state = Stateful {
            input: value,
            state: arena,
        };

        parse_path(ParseRestriction::None).parse(state)
    }

    #[track_caller]
    fn parse_ok<'a>(arena: &'a Arena, value: &str) -> Path<'a> {
        parse(arena, value).expect("should be valid path")
    }

    fn parse_err<'a, 'b>(
        arena: &'a Arena,
        value: &'b str,
    ) -> ParseError<Stateful<&'b str, &'a Arena>, ErrMode<ContextError>> {
        parse(arena, value).expect_err("should be invalid path")
    }

    #[test]
    fn should_parse() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "foo"), @"foo");
        assert_snapshot!(parse_ok(&arena, "foo::bar"), @"foo::bar");
        assert_snapshot!(parse_ok(&arena, "foo::bar::baz"), @"foo::bar::baz");
    }

    #[test]
    fn no_trailing_colon_colon() {
        let arena = Arena::new();

        assert_debug_snapshot!(parse_err(&arena, "foo::"), @r###"
        ParseError {
            input: "foo::",
            offset: 3,
            inner: Backtrack(
                ContextError {
                    context: [],
                    cause: None,
                },
            ),
        }
        "###);
    }

    #[test]
    fn non_rust_identifiers() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "+::+::-::`*`"), @"+::+::-::*");
    }
}
