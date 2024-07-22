use core::mem;

use winnow::{
    ascii::multispace0,
    combinator::{delimited, separated_foldl1, trace},
    error::ParserError,
    stream::{AsChar, Stream, StreamIsPartial},
    Parser,
};

use crate::arena::{self, Arena};

enum VecOrOneValue<'a, T> {
    Vec(arena::Vec<'a, T>),
    One(T),
    None,
}

impl<'a, T> VecOrOneValue<'a, T> {
    fn as_vec(&mut self, arena: &'a Arena) -> &mut arena::Vec<'a, T> {
        let this = mem::replace(self, VecOrOneValue::None);

        let value = match this {
            VecOrOneValue::Vec(value) => value,
            VecOrOneValue::One(value) => {
                let mut vec = arena.vec(Some(1));
                vec.push(value);
                vec
            }
            VecOrOneValue::None => arena.vec(Some(0)),
        };

        *self = VecOrOneValue::Vec(value);

        match self {
            VecOrOneValue::Vec(value) => value,
            _ => unreachable!(),
        }
    }
}

pub(crate) struct VecOrOne<'a, T> {
    arena: &'a Arena,
    value: VecOrOneValue<'a, T>,
}

impl<'a, T> VecOrOne<'a, T> {
    pub(crate) const fn new(arena: &'a Arena, value: T) -> Self {
        Self {
            arena,
            value: VecOrOneValue::One(value),
        }
    }

    pub(crate) fn into_boxed_slice(self) -> arena::Box<'a, [T]> {
        match self.value {
            VecOrOneValue::Vec(vec) => vec.into_boxed_slice(),
            VecOrOneValue::One(value) => Box::into_boxed_slice(self.arena.boxed(value)),
            VecOrOneValue::None => self.arena.boxed([]),
        }
    }

    pub(crate) fn append(&mut self, value: &mut Self) -> &mut Self {
        let value = mem::replace(&mut value.value, VecOrOneValue::None);

        match value {
            VecOrOneValue::Vec(mut vec) => {
                self.value.as_vec(self.arena).append(&mut vec);
            }
            VecOrOneValue::One(value) => {
                self.value.as_vec(self.arena).push(value);
            }
            VecOrOneValue::None => {}
        }

        self
    }
}

pub(crate) fn separated_boxed1<Input, Output, Sep, Error, ParseNext, SepParser>(
    arena: &Arena,
    parser: ParseNext,
    sep: SepParser,
) -> impl Parser<Input, arena::Box<'_, [Output]>, Error>
where
    Input: Stream,
    ParseNext: Parser<Input, Output, Error>,
    SepParser: Parser<Input, Sep, Error>,
    Error: ParserError<Input>,
{
    trace(
        "separated_list1",
        separated_foldl1(
            parser.map(|generic| VecOrOne::new(arena, generic)),
            sep,
            |mut left, _, mut right| {
                left.append(&mut right);
                left
            },
        )
        .map(VecOrOne::into_boxed_slice),
    )
}

/// A combinator that takes a parser `inner` and produces a parser that also consumes both leading
/// and trailing whitespace, returning the output of `inner`.
pub(crate) fn ws<Input, Output, Error, ParseNext>(
    parser: ParseNext,
) -> impl Parser<Input, Output, Error>
where
    Input: StreamIsPartial + Stream<Token: AsChar + Clone>,
    ParseNext: Parser<Input, Output, Error>,
    Error: ParserError<Input>,
{
    trace(
        "ws", //
        delimited(multispace0, parser, multispace0),
    )
}
