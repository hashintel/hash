use hashql_ast::heap::{self, Heap};
use winnow::{
    Parser,
    ascii::multispace0,
    combinator::{delimited, separated_foldl1, trace},
    error::ParserError,
    stream::{AsChar, Stream, StreamIsPartial},
};

enum VecOrOneValue<T> {
    Vec(Vec<T>),
    One(T),
}

impl<T> VecOrOneValue<T> {
    fn as_vec(this: &mut Option<Self>) -> &mut Vec<T> {
        // capacity of 0 will not allocate
        let value = this.take().unwrap_or_else(|| Self::Vec(Vec::new()));

        let value = match value {
            Self::Vec(value) => value,
            Self::One(value) => vec![value],
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
    value: Option<VecOrOneValue<T>>,
}

impl<'heap, T> VecOrOne<'heap, T> {
    const fn new(heap: &'heap Heap, value: T) -> Self {
        Self {
            heap,
            value: Some(VecOrOneValue::One(value)),
        }
    }

    fn into_boxed_slice(self) -> heap::Box<'heap, [T]> {
        match self.value {
            Some(VecOrOneValue::Vec(vec)) => self.heap.boxed_slice(vec),
            Some(VecOrOneValue::One(value)) => Box::into_boxed_slice(self.heap.boxed(value)),
            None => self.heap.boxed([]),
        }
    }

    pub(crate) fn append(&mut self, value: &mut Self) -> &mut Self {
        let Some(value) = value.value.take() else {
            return self;
        };

        let vec = VecOrOneValue::as_vec(&mut self.value);
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
    heap: &Heap,
    parser: ParseNext,
    sep: SepParser,
) -> impl Parser<Input, heap::Box<'_, [Output]>, Error>
where
    Input: Stream,
    ParseNext: Parser<Input, Output, Error>,
    SepParser: Parser<Input, Sep, Error>,
    Error: ParserError<Input>,
{
    trace(
        "separated_boxed1",
        separated_foldl1(
            parser.map(|value| VecOrOne::new(heap, value)),
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
