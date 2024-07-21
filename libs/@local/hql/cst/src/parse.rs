use winnow::{
    ascii::multispace0,
    combinator::delimited,
    error::ParserError,
    stream::{AsChar, Stream, StreamIsPartial},
    Parser,
};

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
    delimited(multispace0, parser, multispace0)
}
