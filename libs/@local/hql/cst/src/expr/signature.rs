use core::{fmt, fmt::Display};

use winnow::{
    combinator::{delimited, opt, preceded, separated_pair, trace},
    error::ParserError,
    stream::{AsChar, Compare, Stream, StreamIsPartial},
    PResult, Parser, Stateful,
};

use super::Expr;
use crate::{
    arena::{self, Arena},
    parse::string,
    symbol::{self, parse_symbol, Symbol},
    r#type::{parse_type, Type},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature<'arena> {
    pub generics: arena::Box<'arena, [Generic<'arena>]>,

    pub arguments: arena::Box<'arena, [Argument<'arena>]>,

    pub r#return: Return<'arena>,
}

impl<'a> Display for Signature<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if !self.generics.is_empty() {
            f.write_str("<")?;
            for (index, generic) in self.generics.iter().enumerate() {
                if index > 0 {
                    f.write_str(", ")?;
                }

                Display::fmt(generic, f)?;
            }
            f.write_str(">")?;
        }

        f.write_str("(")?;

        for (index, argument) in self.arguments.iter().enumerate() {
            if index > 0 {
                f.write_str(", ")?;
            }

            Display::fmt(argument, f)?;
        }

        f.write_str(") -> ")?;

        Display::fmt(&self.r#return, f)
    }
}

impl<'arena, 'source> From<Signature<'arena>> for Expr<'arena, 'source> {
    fn from(signature: Signature<'arena>) -> Self {
        Self::Signature(signature)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Generic<'a> {
    pub name: Symbol,
    pub bound: Option<Type<'a>>,
}

impl<'a> Display for Generic<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.name, f)?;

        if let Some(bound) = &self.bound {
            f.write_str(": ")?;
            Display::fmt(bound, f)
        } else {
            Ok(())
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Argument<'a> {
    pub name: Symbol,
    pub r#type: Type<'a>,
}

impl<'a> Display for Argument<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.name, f)?;
        f.write_str(": ")?;
        Display::fmt(&self.r#type, f)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Return<'a> {
    pub r#type: Type<'a>,
}

impl<'a> Display for Return<'a> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.r#type, f)
    }
}

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
pub(crate) fn parse_signature<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Signature<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    let arena = input.state;

    trace(
        "signature",
        (
            opt(parse_generics).map(|generics| generics.unwrap_or_else(|| arena.boxed([]))),
            parse_arguments,
            parse_return,
        )
            .map(|(generics, arguments, r#return)| Signature {
                generics,
                arguments,
                r#return,
            }),
    )
    .parse_next(input)
}

fn parse_generic<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Generic<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    trace(
        "generic",
        (
            parse_symbol(symbol::ParseRestriction::RustOnly),
            opt(preceded(string::ws(':'), parse_type)),
        )
            .map(|(name, bound)| Generic { name, bound }),
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
fn parse_generics<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<arena::Box<'a, [Generic<'a>]>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    let arena = input.state;

    trace(
        "generics",
        delimited(
            string::ws('<'),
            opt((
                string::separated_boxed1(arena, parse_generic, string::ws(',')),
                opt(string::ws(',')).void(),
            ))
            .map(|generics| match generics {
                Some((generics, ())) => generics,
                None => arena.boxed([]),
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
fn parse_argument<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Argument<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    trace(
        "argument",
        separated_pair(
            parse_symbol(symbol::ParseRestriction::RustOnly),
            string::ws(':'),
            parse_type,
        )
        .map(|(name, r#type)| Argument { name, r#type }),
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
fn parse_arguments<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<arena::Box<'a, [Argument<'a>]>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    let arena = input.state;

    trace(
        "argument list",
        delimited(
            string::ws('('),
            opt((
                string::separated_boxed1(arena, parse_argument, string::ws(',')),
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
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Return<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
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
