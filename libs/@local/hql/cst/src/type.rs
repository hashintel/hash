use alloc::alloc::Global;

use bumpalo::Bump;
use winnow::{
    combinator::{alt, delimited, preceded, repeat},
    error::ParserError,
    stream::{Accumulate, AsChar, Compare, Stream, StreamIsPartial},
    PResult, Parser, Stateful,
};

use crate::{
    arena::{self, Arena},
    parse::ws,
    symbol::{parse_symbol, Symbol},
};

pub enum Type<'a> {
    Symbol(Symbol),
    Union(arena::Box<'a, [Type<'a>]>),
    Intersection(arena::Box<'a, [Type<'a>]>),
}

/// Implementation of [`Type`] parsing
///
/// # Syntax
///
/// ```abnf
/// primary = symbol / enclosed
/// enclosed = "(" type ")"
/// union = primary *("|" primary)
/// intersection = union *("&" union)
/// type = intersection
/// ```
fn parse_type<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Signature<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    alt((parse_intersection)).parse_next(input)
}

fn parse_primary<'a, Input, Error>(
    input: &mut Stateful<Input, &'a Arena>,
) -> PResult<Type<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    alt((
        parse_symbol.map(Type::Symbol), //
        parse_enclosed,
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
        + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    delimited('(', parse_type, ')').parse_next(input)
}

fn parse_union<'a, Input, Error>(input: &mut Stateful<Input, &'a Arena>) -> PResult<Type<'a>, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    let arena = input.state;

    (
        parse_type,
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
        + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    let arena = input.state;

    (
        parse_union,
        repeat(0.., preceded('&', parse_union)).fold(
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
