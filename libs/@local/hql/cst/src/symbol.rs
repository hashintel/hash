use core::fmt::Display;
use std::fmt;

use bumpalo::Bump;
use smol_str::SmolStr;
use unicode_ident::{is_xid_continue, is_xid_start};
use winnow::{
    combinator::{alt, delimited, dispatch, empty, opt},
    error::ParserError,
    stream::{AsChar, Compare, Stream, StreamIsPartial},
    token::{literal, one_of, take_while},
    PResult, Parser, Stateful,
};

// TODO: in the future we might want to use the bump arena here as well.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Symbol(SmolStr);

impl Display for Symbol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, f)
    }
}

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
pub(crate) fn parse_symbol<Input, Error>(input: &mut Input) -> PResult<Symbol, Error>
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
    Input: StreamIsPartial //
        + Stream<Token: AsChar + Clone>
        + Compare<char>,
    Error: ParserError<Input>,
{
    (
        one_of(|c: Input::Token| {
            let c = c.as_char();
            is_xid_start(c) || c == '_'
        }),
        take_while(0.., |c: Input::Token| is_xid_continue(c.as_char())),
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
    Input: StreamIsPartial //
        + Stream<Token: AsChar + Clone>
        + Compare<char>
        + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    dispatch! {one_of(['=', '!', '>', '<', '+', '-', '*', '/', '|', '&', '^']).map(AsChar::as_char);
        '=' | '!' | '>' | '<' => opt('=').void(),
        _ => empty.void()
    }
    .recognize()
    .parse_next(input)
}

fn parse_safe_operator<Input, Error>(input: &mut Input) -> PResult<Input::Slice, Error>
where
    Input: StreamIsPartial //
        + Stream<Token: AsChar + Clone>
        + Compare<char>
        + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    delimited('`', parse_operator, '`').parse_next(input)
}

#[cfg(test)]
mod test {
    use insta::{assert_debug_snapshot, assert_snapshot};
    use winnow::{
        error::{ContextError, ErrMode, ParseError},
        PResult, Parser,
    };

    use super::Symbol;

    #[track_caller]
    fn parse(value: &str) -> Result<Symbol, ParseError<&str, ErrMode<ContextError>>> {
        let mut cursor = value;

        super::parse_symbol.parse(cursor)
    }

    #[track_caller]
    fn parse_ok(value: &str) -> Symbol {
        parse(value).expect("should be valid symbol")
    }

    #[test]
    fn unicode() {
        assert_snapshot!(parse_ok("m"), @"m");
        assert_snapshot!(parse_ok("main"), @"main");
        assert_snapshot!(parse_ok("main_"), @"main_");
        assert_snapshot!(parse_ok("main_123"), @"main_123");
        assert_snapshot!(parse_ok("übung"), @"übung");
        assert_snapshot!(parse_ok("_"), @"_");
        assert_snapshot!(parse_ok("_test"), @"_test");
    }

    #[test]
    fn ignored() {
        assert_snapshot!(parse_ok("_"), @"_");
        assert_snapshot!(parse_ok("_test"), @"_test");
    }

    #[test]
    fn operators() {
        assert_snapshot!(parse_ok("+"), @"+");
        assert_snapshot!(parse_ok("-"), @"-");
        assert_snapshot!(parse_ok("*"), @"*");
        assert_snapshot!(parse_ok("/"), @"/");
        assert_snapshot!(parse_ok("|"), @"|");
        assert_snapshot!(parse_ok("&"), @"&");
        assert_snapshot!(parse_ok("^"), @"^");
        assert_snapshot!(parse_ok("=="), @"==");
        assert_snapshot!(parse_ok("!"), @"!");
        assert_snapshot!(parse_ok("!="), @"!=");
        assert_snapshot!(parse_ok(">"), @">");
        assert_snapshot!(parse_ok(">="), @">=");
        assert_snapshot!(parse_ok("<"), @"<");
        assert_snapshot!(parse_ok("<="), @"<=");
    }

    #[test]
    fn operators_safe() {
        assert_snapshot!(parse_ok("`+`"), @"+");
        assert_snapshot!(parse_ok("`-`"), @"-");
        assert_snapshot!(parse_ok("`*`"), @"*");
        assert_snapshot!(parse_ok("`/`"), @"/");
        assert_snapshot!(parse_ok("`|`"), @"|");
        assert_snapshot!(parse_ok("`&`"), @"&");
        assert_snapshot!(parse_ok("`^`"), @"^");
        assert_snapshot!(parse_ok("`==`"), @"==");
        assert_snapshot!(parse_ok("`!`"), @"!");
        assert_snapshot!(parse_ok("`!=`"), @"!=");
        assert_snapshot!(parse_ok("`>`"), @">");
        assert_snapshot!(parse_ok("`>=`"), @">=");
        assert_snapshot!(parse_ok("`<`"), @"<");
        assert_snapshot!(parse_ok("`<=`"), @"<=");
    }
}

// TODO: tests (special cases, etc.)
