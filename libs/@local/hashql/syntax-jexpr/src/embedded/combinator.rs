use core::alloc::Allocator;

use hashql_core::heap::{self, Heap};
use winnow::{
    ModalParser, Parser,
    ascii::multispace0,
    combinator::{cut_err, delimited, fail, separated_foldl1, trace},
    error::{AddContext, ParserError, StrContext},
    stream::{AsChar, Stream, StreamIsPartial},
};

use super::context::Input;
use crate::stack::ensure_sufficient_stack;

pub(crate) enum Alt2<L, R> {
    Left(L),
    Right(R),
}

enum VecOrOneValue<'heap, T> {
    Vec(heap::Vec<'heap, T>),
    One(T),
}

impl<'heap, T> VecOrOneValue<'heap, T> {
    fn as_vec<'this>(
        this: &'this mut Option<Self>,
        heap: &'heap Heap,
    ) -> &'this mut heap::Vec<'heap, T> {
        // Vec won't allocate until it is pushed to
        let value = this.take().unwrap_or_else(|| Self::Vec(Vec::new_in(heap)));

        let value = match value {
            Self::Vec(value) => value,
            Self::One(value) => {
                let mut vec = Vec::new_in(heap);
                vec.push(value);
                vec
            }
        };

        let value = this.insert(Self::Vec(value));
        match value {
            Self::Vec(value) => value,
            Self::One(_) => unreachable!(),
        }
    }
}

struct VecOrOne<'heap, T> {
    heap: &'heap Heap,
    value: Option<VecOrOneValue<'heap, T>>,
}

impl<'heap, T> VecOrOne<'heap, T> {
    const fn new(heap: &'heap Heap, value: T) -> Self {
        Self {
            heap,
            value: Some(VecOrOneValue::One(value)),
        }
    }

    fn into_vec(self) -> heap::Vec<'heap, T> {
        match self.value {
            Some(VecOrOneValue::Vec(vec)) => vec,
            Some(VecOrOneValue::One(value)) => {
                let mut vec = Vec::new_in(self.heap);
                vec.push(value);
                vec
            }
            None => Vec::new_in(self.heap),
        }
    }

    pub(crate) fn append(&mut self, value: &mut Self) -> &mut Self {
        let Some(value) = value.value.take() else {
            return self;
        };

        let vec = VecOrOneValue::as_vec(&mut self.value, self.heap);
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

pub(crate) fn separated_alloc1<Input, Output, Sep, Error, ParseNext, SepParser>(
    heap: &Heap,
    parser: ParseNext,
    sep: SepParser,
) -> impl Parser<Input, heap::Vec<'_, Output>, Error>
where
    Input: Stream,
    ParseNext: Parser<Input, Output, Error>,
    SepParser: Parser<Input, Sep, Error>,
    Error: ParserError<Input>,
{
    trace(
        "separated_alloc1",
        separated_foldl1(
            parser.map(|value| VecOrOne::new(heap, value)),
            sep,
            |mut left, _, mut right| {
                left.append(&mut right);
                left
            },
        )
        .map(VecOrOne::into_vec),
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

/// Context label of the error [`nested`] and [`nesting_limit`] fail with.
pub(crate) const NESTING_LIMIT_LABEL: &str = "nesting limit";

/// Fails without backtracking, labeled as [`NESTING_LIMIT_LABEL`].
pub(crate) fn nesting_limit<'heap, 'span, 'source, Output, Error, A: Allocator>(
    input: &mut Input<'heap, 'span, 'source, A>,
) -> winnow::ModalResult<Output, Error>
where
    Error: ParserError<Input<'heap, 'span, 'source, A>>
        + AddContext<Input<'heap, 'span, 'source, A>, StrContext>,
{
    cut_err(fail)
        .context(StrContext::Label(NESTING_LIMIT_LABEL))
        .parse_next(input)
}

/// Runs `parser` one nesting level down, failing once [`ParserOptions::nesting_limit`] levels are
/// open.
///
/// [`ParserOptions::nesting_limit`]: crate::ParserOptions::nesting_limit
pub(crate) fn nested<'heap, 'span, 'source, Output, Error, A: Allocator>(
    mut parser: impl ModalParser<Input<'heap, 'span, 'source, A>, Output, Error>,
) -> impl ModalParser<Input<'heap, 'span, 'source, A>, Output, Error>
where
    Error: ParserError<Input<'heap, 'span, 'source, A>>
        + AddContext<Input<'heap, 'span, 'source, A>, StrContext>,
{
    move |input: &mut Input<'heap, 'span, 'source, A>| {
        if input.state.depth >= input.state.options.nesting_limit {
            return nesting_limit(input);
        }

        input.state.depth += 1;
        input.state.max_depth = input.state.max_depth.max(input.state.depth);
        let result = ensure_sufficient_stack(|| parser.parse_next(input));
        input.state.depth -= 1;

        result
    }
}
