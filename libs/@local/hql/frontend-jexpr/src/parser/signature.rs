use hql_cst::{
    arena::{self, Arena},
    expr::signature::{Argument, Generic, List, Signature},
};
use winnow::{
    combinator::{delimited, opt, preceded, trace},
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
    let arena = input.state;

    let start = input.location();
    trace(
        "signature",
        (
            opt(parse_generics).map(|generics| generics.unwrap_or_else(|| arena.boxed([]))),
            parse_arguments,
            parse_return,
        )
            .map(|(generics, arguments, r#return)| {
                let end = input.location();

                let span = input.state.spans.insert(Span {
                    range: (start, end).range_trunc(),
                    pointer: None,
                    parent_id: input.state.parent_id,
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
    let start = input.location();

    trace(
        "generic",
        (
            parse_symbol(symbol::ParseRestriction::SafeOnly),
            opt(preceded(string::ws(':'), parse_type)),
        )
            .map(|(name, bound)| {
                let end = input.location();
                let span = input.state.spans.insert(Span {
                    range: (start, end).range_trunc(),
                    pointer: None,
                    parent_id: input.state.parent_id,
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
fn parse_generics<'arena, 'span, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'span>>,
) -> PResult<List<Generic<'arena>>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'span>>>,
{
    trace(
        "generics",
        delimited(
            string::ws('<'),
            opt((
                string::separated_boxed1(input.state.arena, parse_generic, string::ws(',')),
                opt(string::ws(',')).void(),
            ))
            .map(|generics| match generics {
                Some((generics, ())) => generics,
                None => input.state.arena.boxed([]),
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
fn parse_argument<'arena, 'span, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'span>>,
) -> PResult<Argument<'arena>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'span>>>,
{
    let start = input.location();
    trace(
        "argument",
        separated_pair(
            parse_symbol(symbol::ParseRestriction::SafeOnly),
            string::ws(':'),
            parse_type,
        )
        .map(|(name, r#type)| {
            let end = input.location();
            let span = input.state.spans.insert(Span {
                range: (start, end).range_trunc(),
                pointer: None,
                parent_id: input.state.parent_id,
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
fn parse_arguments<'arena, 'span, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'span>>,
) -> PResult<List<'arena, Argument<'arena>>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'span>>>,
{
    let start = input.location();

    trace(
        "argument list",
        delimited(
            string::ws('('),
            opt((
                string::separated_boxed1(input.state.arena, parse_argument, string::ws(',')),
                opt(string::ws(',')).void(),
            ))
            .map(|value| match value {
                Some((arguments, ())) => arguments,
                None => arena.boxed([]),
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
fn parse_return<'a, Input, Error>(
    input: &mut Stateful<Input, ParseState<'arena, 'span>>,
) -> PResult<Return<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'span>>>,
{
    trace(
        "return",
        preceded(string::ws("->"), parse_type).map(|r#type| Return { r#type }),
    )
    .parse_next(input)
}

#[cfg(test)]
mod test {
    use insta::assert_snapshot;
    use winnow::{
        error::{ContextError, ErrMode, ParseError},
        Parser, Stateful,
    };

    use super::Signature;
    use crate::arena::Arena;

    #[track_caller]
    fn parse<'a, 'b>(
        arena: &'a Arena,
        value: &'b str,
    ) -> Result<Signature<'a>, ParseError<Stateful<&'b str, &'a Arena>, ErrMode<ContextError>>>
    {
        let state = Stateful {
            input: value,
            state: arena,
        };

        super::parse_signature.parse(state)
    }

    #[track_caller]
    fn parse_ok<'a>(arena: &'a Arena, value: &str) -> Signature<'a> {
        parse(arena, value).expect("should be valid symbol")
    }

    #[test]
    fn bare() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "() -> Int"), @"() -> Int");
    }

    #[test]
    fn empty_generics() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "<>() -> Int"), @"() -> Int");
    }

    #[test]
    fn generics() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, " <T> () -> Int"), @"<T>() -> Int");
        assert_snapshot!(parse_ok(&arena, "<T>() -> Int"), @"<T>() -> Int");
        assert_snapshot!(parse_ok(&arena, "<T: Int>() -> Int"), @"<T: Int>() -> Int");
        assert_snapshot!(parse_ok(&arena, "<T:Int>() -> Int"), @"<T: Int>() -> Int");
        assert_snapshot!(parse_ok(&arena, "<T: Int, U>() -> Int"), @"<T: Int, U>() -> Int");
        assert_snapshot!(parse_ok(&arena, "<T,U>() -> Int"), @"<T, U>() -> Int");
        assert_snapshot!(parse_ok(&arena, "<T,U,>() -> Int"), @"<T, U>() -> Int");
    }

    #[test]
    fn arguments() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "() -> Int"), @"() -> Int");
        assert_snapshot!(parse_ok(&arena, "(a: Int) -> Int"), @"(a: Int) -> Int");
        assert_snapshot!(parse_ok(&arena, "(a:Int) -> Int"), @"(a: Int) -> Int");
        assert_snapshot!(parse_ok(&arena, "(a: Int, b: Int) -> Int"), @"(a: Int, b: Int) -> Int");
        assert_snapshot!(parse_ok(&arena, "(a: Int,) -> Int"), @"(a: Int) -> Int");
    }

    #[test]
    fn return_type() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "() -> Int"), @"() -> Int");
        assert_snapshot!(parse_ok(&arena, "() -> Int | Bool"), @"() -> (Int | Bool)");
        assert_snapshot!(parse_ok(&arena, "() -> Int | Bool & Float"), @"() -> ((Int | Bool) & Float)");
    }
}
