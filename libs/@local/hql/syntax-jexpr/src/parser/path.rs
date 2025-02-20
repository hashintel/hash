use hql_cst::expr::path::Path;
use winnow::{
    ModalParser, Parser as _, Stateful,
    combinator::trace,
    error::ParserError,
    stream::{AsChar, Compare, Location, Stream, StreamIsPartial},
};

use super::{
    IntoTextRange as _,
    string::{ParseState, separated_boxed1},
    symbol::{ParseRestriction, parse_symbol},
};
use crate::span::Span;

/// Implementation of Path parsing
///
/// # Syntax
///
/// ```abnf
/// path = symbol *("::" symbol)
/// ```
pub(crate) fn parse_path<'arena, 'span, Input, Error>(
    restriction: ParseRestriction,
) -> impl ModalParser<Stateful<Input, ParseState<'arena, 'span>>, Path<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'a> Compare<&'a str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'span>>>,
{
    move |input: &mut Stateful<Input, ParseState<'arena, 'span>>| {
        let state = input.state;

        trace(
            "path",
            separated_boxed1(state.arena, parse_symbol(restriction), "::")
                .with_span()
                .map(move |(segments, range)| Path {
                    segments,
                    span: state.spans.insert(Span {
                        range: range.range_trunc(),
                        pointer: None,
                        parent_id: state.parent_id,
                    }),
                }),
        )
        .parse_next(input)
    }
}

#[cfg(test)]
mod test {
    use hql_cst::arena::Arena;
    use hql_span::storage::SpanStorage;
    use insta::{assert_debug_snapshot, assert_snapshot};
    use winnow::{
        LocatingSlice, Parser as _, Stateful,
        error::{ContextError, ErrMode, ParseError},
    };

    use super::{Path, parse_path};
    use crate::{
        error::test::ParseErrorDebug,
        parser::{string::ParseState, symbol::ParseRestriction},
    };

    #[track_caller]
    #[expect(clippy::type_complexity, reason = "test code")]
    fn parse<'arena, 'spans, 'input>(
        state: ParseState<'arena, 'spans>,
        input: &'input str,
    ) -> Result<
        Path<'arena>,
        ParseError<
            Stateful<LocatingSlice<&'input str>, ParseState<'arena, 'spans>>,
            ErrMode<ContextError>,
        >,
    > {
        let input = Stateful {
            input: LocatingSlice::new(input),
            state,
        };

        parse_path(ParseRestriction::None).parse(input)
    }

    #[track_caller]
    fn parse_ok<'arena>(state: ParseState<'arena, '_>, input: &str) -> Path<'arena> {
        parse(state, input).expect("should be valid path")
    }

    fn parse_err<'arena, 'spans, 'input>(
        state: ParseState<'arena, 'spans>,
        input: &'input str,
    ) -> ParseErrorDebug<
        Stateful<LocatingSlice<&'input str>, ParseState<'arena, 'spans>>,
        ErrMode<ContextError>,
    > {
        parse(state, input)
            .map_err(ParseErrorDebug)
            .expect_err("should be invalid path")
    }

    macro_rules! setup {
        ($state:ident) => {
            let arena = Arena::new();
            let spans = SpanStorage::new();

            let $state = ParseState {
                arena: &arena,
                spans: &spans,
                parent_id: None,
            };
        };
    }

    #[test]
    fn should_parse() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "foo"), @"foo");
        assert_snapshot!(parse_ok(state, "foo::bar"), @"foo::bar");
        assert_snapshot!(parse_ok(state, "foo::bar::baz"), @"foo::bar::baz");
    }

    #[test]
    fn no_trailing_colon_colon() {
        setup!(state);

        assert_debug_snapshot!(parse_err(state, "foo::"), @r###"
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
        setup!(state);

        assert_snapshot!(parse_ok(state, "+::+::-::`*`"), @"+::+::-::*");
    }
}
