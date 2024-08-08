use hql_cst::expr::signature::{Argument, Generic, List, Return, Signature};
use winnow::{
    combinator::{delimited, opt, preceded, separated_pair, trace},
    error::ParserError,
    stream::{AsChar, Compare, Location, Stream, StreamIsPartial},
    PResult, Parser, Stateful,
};

use super::{
    string::{self, ParseState},
    symbol::{self, parse_symbol},
    r#type::parse_type,
    IntoTextRange,
};
use crate::span::Span;

/// Implementation of [`Signature`] parsing
///
/// Arguments and generics are only allowed to be rust symbols, operators are **not** allowed
///
/// # Syntax
///
/// ```abnf
/// signature = [generics] "(" [ argument *("," argument) ] ")" "->" type
/// generics = "<" symbol-rust [":" type ] ">"
/// argument = symbol-rust ":" type
/// ```
pub(crate) fn parse_signature<'arena, 'span, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'span>>,
) -> PResult<Signature<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'span>>>,
{
    let state = input.state;

    trace(
        "signature",
        (
            opt(parse_generics)
                .with_span()
                .map(move |(generics, range)| {
                    generics.unwrap_or_else(|| {
                        let span = state.spans.insert(Span {
                            range: range.range_trunc(),
                            pointer: None,
                            parent_id: state.parent_id,
                        });

                        List {
                            items: state.arena.boxed([]),
                            span,
                        }
                    })
                }),
            parse_arguments,
            parse_return,
        )
            .with_span()
            .map(move |((generics, arguments, r#return), range)| {
                let span = state.spans.insert(Span {
                    range: range.range_trunc(),
                    pointer: None,
                    parent_id: state.parent_id,
                });

                Signature {
                    generics,
                    arguments,
                    r#return,

                    span,
                }
            }),
    )
    .parse_next(input)
}

fn parse_generic<'arena, 'span, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'span>>,
) -> PResult<Generic<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'span>>>,
{
    let state = input.state;

    trace(
        "generic",
        (
            parse_symbol(symbol::ParseRestriction::SafeOnly),
            opt(preceded(string::ws(':'), parse_type)),
        )
            .with_span()
            .map(move |((name, bound), range)| {
                let span = state.spans.insert(Span {
                    range: range.range_trunc(),
                    pointer: None,
                    parent_id: state.parent_id,
                });

                Generic { name, bound, span }
            }),
    )
    .parse_next(input)
}

// TODO: generics are not working properly, <> isn't working, also trailing , isn't
/// Implementation of generics parsing
///
/// # Syntax
///
/// ```abnf
/// generics = "<" symbol [":" type ] ">"
/// ```
fn parse_generics<'arena, 'spans, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'spans>>,
) -> PResult<List<'arena, Generic<'arena>>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    let state = input.state;

    trace(
        "generics",
        delimited(
            string::ws('<'),
            opt((
                string::separated_boxed1(state.arena, parse_generic, string::ws(',')),
                opt(string::ws(',')).void(),
            ))
            .with_span()
            .map(move |(generics, range)| {
                let items = match generics {
                    Some((generics, ())) => generics,
                    None => state.arena.boxed([]),
                };

                let span = state.spans.insert(Span {
                    range: range.range_trunc(),
                    pointer: None,
                    parent_id: state.parent_id,
                });

                List { items, span }
            }),
            string::ws('>'),
        ),
    )
    .parse_next(input)
}

/// Implementation of argument parsing
///
/// # Syntax
///
/// ```abnf
/// argument = symbol ":" type
/// ```
fn parse_argument<'arena, 'spans, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'spans>>,
) -> PResult<Argument<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    let state = input.state;

    trace(
        "argument",
        separated_pair(
            parse_symbol(symbol::ParseRestriction::SafeOnly),
            string::ws(':'),
            parse_type,
        )
        .with_span()
        .map(move |((name, r#type), span)| {
            let span = state.spans.insert(Span {
                range: span.range_trunc(),
                pointer: None,
                parent_id: state.parent_id,
            });

            Argument { name, r#type, span }
        }),
    )
    .parse_next(input)
}

/// Implementation of argument list parsing
///
/// # Syntax
///
/// ```abnf
/// arguments = "(" [ argument *("," argument) ] ")"
/// argument = symbol ":" type
/// ```
fn parse_arguments<'arena, 'spans, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'spans>>,
) -> PResult<List<'arena, Argument<'arena>>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    let state = input.state;

    trace(
        "argument list",
        delimited(
            string::ws('('),
            opt((
                string::separated_boxed1(input.state.arena, parse_argument, string::ws(',')),
                opt(string::ws(',')).void(),
            ))
            .with_span()
            .map(move |(value, range)| {
                let items = match value {
                    Some((arguments, ())) => arguments,
                    None => state.arena.boxed([]),
                };

                let span = state.spans.insert(Span {
                    range: range.range_trunc(),
                    pointer: None,
                    parent_id: state.parent_id,
                });

                List { items, span }
            }),
            string::ws(')'),
        ),
    )
    .parse_next(input)
}

/// Implementation of return type parsing
///
/// # Syntax
///
/// ```abnf
/// return-type = "->" type
/// ```
fn parse_return<'arena, 'spans, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'spans>>,
) -> PResult<Return<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    let state = input.state;

    trace(
        "return",
        preceded(string::ws("->"), parse_type)
            .with_span()
            .map(move |(r#type, range)| {
                let span = state.spans.insert(Span {
                    range: range.range_trunc(),
                    pointer: None,
                    parent_id: state.parent_id,
                });

                Return { r#type, span }
            }),
    )
    .parse_next(input)
}

#[cfg(test)]
mod test {
    use hql_cst::arena::Arena;
    use hql_span::storage::SpanStorage;
    use insta::assert_snapshot;
    use winnow::{
        error::{ContextError, ErrMode, ParseError},
        Located, Parser, Stateful,
    };

    use super::Signature;
    use crate::parser::string::ParseState;

    #[track_caller]
    #[expect(clippy::type_complexity, reason = "test code")]
    fn parse<'arena, 'spans, 'input>(
        state: ParseState<'arena, 'spans>,
        input: &'input str,
    ) -> Result<
        Signature<'arena>,
        ParseError<
            Stateful<Located<&'input str>, ParseState<'arena, 'spans>>,
            ErrMode<ContextError>,
        >,
    > {
        let state = Stateful {
            input: Located::new(input),
            state,
        };

        super::parse_signature.parse(state)
    }

    #[track_caller]
    fn parse_ok<'arena>(state: ParseState<'arena, '_>, value: &str) -> Signature<'arena> {
        parse(state, value).expect("should be valid symbol")
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
    fn bare() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "() -> Int"), @"() -> Int");
    }

    #[test]
    fn empty_generics() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "<>() -> Int"), @"() -> Int");
    }

    #[test]
    fn generics() {
        setup!(state);

        assert_snapshot!(parse_ok(state, " <T> () -> Int"), @"<T>() -> Int");
        assert_snapshot!(parse_ok(state, "<T>() -> Int"), @"<T>() -> Int");
        assert_snapshot!(parse_ok(state, "<T: Int>() -> Int"), @"<T: Int>() -> Int");
        assert_snapshot!(parse_ok(state, "<T:Int>() -> Int"), @"<T: Int>() -> Int");
        assert_snapshot!(parse_ok(state, "<T: Int, U>() -> Int"), @"<T: Int, U>() -> Int");
        assert_snapshot!(parse_ok(state, "<T,U>() -> Int"), @"<T, U>() -> Int");
        assert_snapshot!(parse_ok(state, "<T,U,>() -> Int"), @"<T, U>() -> Int");
    }

    #[test]
    fn arguments() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "() -> Int"), @"() -> Int");
        assert_snapshot!(parse_ok(state, "(a: Int) -> Int"), @"(a: Int) -> Int");
        assert_snapshot!(parse_ok(state, "(a:Int) -> Int"), @"(a: Int) -> Int");
        assert_snapshot!(parse_ok(state, "(a: Int, b: Int) -> Int"), @"(a: Int, b: Int) -> Int");
        assert_snapshot!(parse_ok(state, "(a: Int,) -> Int"), @"(a: Int) -> Int");
    }

    #[test]
    fn return_type() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "() -> Int"), @"() -> Int");
        assert_snapshot!(parse_ok(state, "() -> Int | Bool"), @"() -> (Int | Bool)");
        assert_snapshot!(parse_ok(state, "() -> Int | Bool & Float"), @"() -> ((Int | Bool) & Float)");
    }
}
