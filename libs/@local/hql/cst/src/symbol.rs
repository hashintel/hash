use smol_str::SmolStr;
use unicode_ident::{is_xid_continue, is_xid_start};
use winnow::{
    combinator::{alt, delimited},
    error::ParserError,
    stream::{AsChar, Compare, Stream, StreamIsPartial},
    token::{literal, one_of, take_while},
    PResult, Parser,
};

pub struct Symbol(SmolStr);

/// Implementation of Symbol parsing
///
/// # Syntax
///
/// ```abnf
/// symbol = regular / ignore / operator / operatorSafe
///
/// regular = XID_START *XID_CONTINUE
/// ignore = "_" *XID_CONTINUE
///
/// operator = "+" / "-" / "*" / "/" / "|" / "&" / "^" / "==" / "!=" / ">" / ">=" / "<" / "<="
/// operatorSafe = "`" operators "`"
/// ```
fn parse_symbol<Input, Error>(input: &mut Input) -> PResult<Symbol, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    alt((
        parse_rust_identifier, //
        parse_operator,
        parse_safe_operator,
    ))
    .map(SmolStr::new)
    .map(Symbol)
    .parse_next(input)
}

/// Implementation of `regular` and `ignore` parsing
///
/// # Syntax
///
/// ```abnf
/// regular = XID_START *XID_CONTINUE
/// ignore = "_" *XID_CONTINUE
/// ```
fn parse_rust_identifier<Input, Error>(input: &mut Input) -> PResult<Input::Slice, Error>
where
    Input: StreamIsPartial + Stream<Token: AsChar + Clone> + Compare<char>,
    Error: ParserError<Input>,
{
    (
        one_of(|c: Input::Token| {
            let c = c.as_char();
            is_xid_start(c) || c == '_'
        }),
        take_while(0.., |c: Input::Token| {
            let c = c.as_char();
            is_xid_continue(c)
        }),
    )
        .recognize()
        .parse_next(input)
}

/// Implementation of `operator` parsing
///
/// # Syntax
///
/// ```abnf
/// operator = "+" / "-" / "*" / "/" / "|" / "&" / "^" / "==" / "!=" / ">" / ">=" / "<" / "<="
/// ```
fn parse_operator<Input, Error>(input: &mut Input) -> PResult<Input::Slice, Error>
where
    Input:
        StreamIsPartial + Stream<Token: AsChar + Clone> + Compare<char> + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    alt((
        one_of(['+', '-', '*', '/', '|', '&', '^', '>', '<']).recognize(), //
        "==",
        "!=",
        ">=",
        "<=",
    ))
    .parse_next(input)
}

fn parse_safe_operator<Input, Error>(input: &mut Input) -> PResult<Input::Slice, Error>
where
    Input:
        StreamIsPartial + Stream<Token: AsChar + Clone> + Compare<char> + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    delimited('`', parse_operator, '`').parse_next(input)
}
