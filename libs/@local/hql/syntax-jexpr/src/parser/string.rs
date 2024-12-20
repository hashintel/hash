use hql_cst::arena::{self, Arena};
use hql_span::{SpanId, storage::SpanStorage};
use winnow::{
    Parser,
    ascii::multispace0,
    combinator::{delimited, separated_foldl1, trace},
    error::ParserError,
    stream::{AsChar, Stream, StreamIsPartial},
};

use crate::span::Span;

enum VecOrOneValue<'a, T> {
    Vec(arena::Vec<'a, T>),
    One(T),
}

impl<'a, T> VecOrOneValue<'a, T> {
    fn as_vec<'this>(
        this: &'this mut Option<Self>,
        arena: &'a Arena,
    ) -> &'this mut arena::Vec<'a, T> {
        // capacity of 0 will not allocate
        let value = this
            .take()
            .unwrap_or_else(|| VecOrOneValue::Vec(arena.vec(Some(0))));

        let value = match value {
            VecOrOneValue::Vec(value) => value,
            VecOrOneValue::One(value) => {
                let mut vec = arena.vec(Some(1));
                vec.push(value);
                vec
            }
        };

        let value = this.insert(VecOrOneValue::Vec(value));
        match value {
            VecOrOneValue::Vec(value) => value,
            VecOrOneValue::One(_) => unreachable!(),
        }
    }
}

struct VecOrOne<'a, T> {
    arena: &'a Arena,
    value: Option<VecOrOneValue<'a, T>>,
}

impl<'a, T> VecOrOne<'a, T> {
    const fn new(arena: &'a Arena, value: T) -> Self {
        Self {
            arena,
            value: Some(VecOrOneValue::One(value)),
        }
    }

    fn into_boxed_slice(self) -> arena::Box<'a, [T]> {
        match self.value {
            Some(VecOrOneValue::Vec(vec)) => vec.into_boxed_slice(),
            Some(VecOrOneValue::One(value)) => Box::into_boxed_slice(self.arena.boxed(value)),
            None => self.arena.boxed([]),
        }
    }

    pub(crate) fn append(&mut self, value: &mut Self) -> &mut Self {
        let Some(value) = value.value.take() else {
            return self;
        };

        let vec = VecOrOneValue::as_vec(&mut self.value, self.arena);
        match value {
            VecOrOneValue::Vec(mut values) => {
                vec.append(&mut values);
            }
            VecOrOneValue::One(value) => {
                vec.push(value);
            }
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
        "separated_boxed1",
        separated_foldl1(
            parser.map(|value| VecOrOne::new(arena, value)),
            sep,
            |mut left, _, mut right| {
                left.append(&mut right);
                left
            },
        )
        .map(VecOrOne::into_boxed_slice),
    )
}

/// A combinator that takes a parser `inner` and produces a parser that also consumes both
/// leading and trailing whitespace, returning the output of `inner`.
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

#[derive(Debug, Copy, Clone)]
pub(crate) struct ParseState<'arena, 'span> {
    pub arena: &'arena Arena,
    pub spans: &'span SpanStorage<Span>,

    pub parent_id: Option<SpanId>,
}
