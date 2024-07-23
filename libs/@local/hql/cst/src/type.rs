use core::fmt::{self, Display};

use winnow::{
    combinator::{alt, delimited, preceded, repeat},
    error::ParserError,
    stream::{AsChar, Compare, Stream, StreamIsPartial},
    PResult, Parser, Stateful,
};

use crate::{
    arena::{self, Arena},
    parse::ws,
    symbol::{self, parse_symbol, Symbol},
};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Type<'a> {
    Symbol(Symbol),
    Union(arena::Box<'a, [Type<'a>]>),
    Intersection(arena::Box<'a, [Type<'a>]>),
}

impl Display for Type<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Symbol(symbol) => Display::fmt(symbol, f),
            Self::Union(types) => {
                if types.len() > 1 {
                    f.write_str("(")?;
                }

                for (index, ty) in types.into_iter().enumerate() {
                    if index > 0 {
                        f.write_str(" | ")?;
                    }

                    Display::fmt(ty, f)?;
                }

                if types.len() > 1 {
                    f.write_str(")")?;
                }

                Ok(())
            }
            Self::Intersection(types) => {
                if types.len() > 1 {
                    f.write_str("(")?;
                }

                for (index, ty) in types.into_iter().enumerate() {
                    if index > 0 {
                        f.write_str(" & ")?;
                    }

                    Display::fmt(ty, f)?;
                }

                if types.len() > 1 {
                    f.write_str(")")?;
                }

                Ok(())
            }
        }
    }
}

/// Implementation of [`Type`] parsing
///
/// Types are only allowed to be valid rust symbols, operators are *not* allowed.
///
/// # Syntax
///
/// ```abnf
/// primary = symbol-rust / enclosed
/// enclosed = "(" type ")"
/// union = primary *("|" primary)
/// intersection = union *("&" union)
/// type = intersection
/// ```
pub(crate) fn parse_type<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Type<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    parse_intersection.parse_next(input)
}

fn parse_primary<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Type<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    alt((
        parse_enclosed, //
        parse_symbol(symbol::ParseRestriction::RustOnly).map(Type::Symbol),
    ))
    .parse_next(input)
}

fn parse_enclosed<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Type<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    delimited('(', parse_type, ')').parse_next(input)
}

fn parse_union<'a, Input, Error>(input: &mut Stateful<Input, &'a Arena>) -> PResult<Type<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    let arena = input.state;

    (
        parse_primary,
        repeat(0.., preceded(ws('|'), parse_primary)).fold(
            || arena.vec(None),
            |mut acc, value: Type<'a>| {
                acc.push(value);
                acc
            },
        ),
    )
        .map(|(head, mut tail)| {
            if tail.is_empty() {
                head
            } else {
                tail.insert(0, head);

                Type::Union(tail.into_boxed_slice())
            }
        })
        .parse_next(input)
}

fn parse_intersection<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Type<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'b> Compare<&'b str>,
    Error: ParserError<Stateful<Input, &'a Arena>>,
{
    let arena = input.state;

    (
        parse_union,
        repeat(0.., preceded(ws('&'), parse_union)).fold(
            || arena.vec(None),
            |mut acc, value: Type<'a>| {
                acc.push(value);
                acc
            },
        ),
    )
        .map(|(head, mut tail)| {
            if tail.is_empty() {
                head
            } else {
                tail.insert(0, head);

                Type::Intersection(tail.into_boxed_slice())
            }
        })
        .parse_next(input)
}

#[cfg(test)]
mod test {
    use insta::assert_snapshot;
    use winnow::{
        error::{ContextError, ErrMode, ParseError},
        Parser, Stateful,
    };

    use super::Type;
    use crate::arena::Arena;

    #[track_caller]
    fn parse<'a, 'b>(
        arena: &'a Arena,
        value: &'b str,
    ) -> Result<Type<'a>, ParseError<Stateful<&'b str, &'a Arena>, ErrMode<ContextError>>> {
        let state = Stateful {
            input: value,
            state: arena,
        };

        super::parse_type.parse(state)
    }

    #[track_caller]
    fn parse_ok<'a>(arena: &'a Arena, value: &str) -> Type<'a> {
        parse(arena, value).expect("should be valid symbol")
    }

    #[test]
    fn union() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "Int"), @"Int");
        assert_snapshot!(parse_ok(&arena, "Int | Float"), @"(Int | Float)");
        assert_snapshot!(parse_ok(&arena, "Int | Float | Bool"), @"(Int | Float | Bool)");
    }

    #[test]
    fn intersection() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "Int"), @"Int");
        assert_snapshot!(parse_ok(&arena, "Int & Float"), @"(Int & Float)");
        assert_snapshot!(parse_ok(&arena, "Int & Float & Bool"), @"(Int & Float & Bool)");
    }

    #[test]
    fn precedence() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "Int | Float & Bool"), @"((Int | Float) & Bool)");
        assert_snapshot!(parse_ok(&arena, "Int & Float | Bool"), @"(Int & (Float | Bool))");
        assert_snapshot!(parse_ok(&arena, "Int & (Float | Bool)"), @"(Int & (Float | Bool))");
    }

    #[test]
    fn whitespace() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "Int|Float&Bool"), @"((Int | Float) & Bool)");
        assert_snapshot!(parse_ok(&arena, "Int | Float & Bool"), @"((Int | Float) & Bool)");
        assert_snapshot!(parse_ok(&arena, "Int   |   Float   &   Bool"), @"((Int | Float) & Bool)");
    }

    #[test]
    fn enclosed() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "(Int)"), @"Int");
        assert_snapshot!(parse_ok(&arena, "(Int | Float)"), @"(Int | Float)");
        assert_snapshot!(parse_ok(&arena, "(Int | Float) & Bool"), @"((Int | Float) & Bool)");
    }

    #[test]
    fn symbol() {
        let arena = Arena::new();

        assert_snapshot!(parse_ok(&arena, "Int"), @"Int");
        assert_snapshot!(parse_ok(&arena, "Float"), @"Float");
        assert_snapshot!(parse_ok(&arena, "Bool"), @"Bool");
    }
}

// TODO: tests (precedence, etc.)
