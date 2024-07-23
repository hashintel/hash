use core::{fmt, fmt::Display};

use smol_str::SmolStr;
use unicode_ident::{is_xid_continue, is_xid_start};
use winnow::{
    combinator::{delimited, dispatch, empty, fail, opt, peek},
    error::ParserError,
    stream::{AsChar, Compare, Stream, StreamIsPartial},
    token::{any, one_of, take_while},
    PResult, Parser,
};

// TODO: in the future we might want to use the bump arena here as well.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Symbol(SmolStr);

impl Display for Symbol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, f)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum ParseRestriction {
    None,
    RustOnly,
}

impl ParseRestriction {
    const fn is_rust(self) -> bool {
        matches!(self, Self::None | Self::RustOnly)
    }

    const fn is_operators(self) -> bool {
        matches!(self, Self::None)
    }
}

impl Default for ParseRestriction {
    fn default() -> Self {
        Self::None
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
pub(crate) fn parse_symbol<Input, Error>(
    restriction: ParseRestriction,
) -> impl Parser<Input, Symbol, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'a> Compare<&'a str>,
    Error: ParserError<Input>,
{
    move |input: &mut Input| {
        dispatch! {peek(any).map(|token: Input::Token| token.as_char());
            char if restriction.is_rust() && is_xid_start(char) => parse_rust_identifier,
            '_' if restriction.is_rust() => parse_rust_identifier,
            char if restriction.is_operators() && OPERATORS_PREFIX.contains(&char) => parse_operator,
            '`' if restriction.is_operators() => parse_safe_operator,
            _ => fail
        }
        .map(SmolStr::new)
        .map(Symbol)
        .parse_next(input)
    }
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

const OPERATORS_PREFIX: &[char] = &['=', '!', '>', '<', '+', '-', '*', '/', '|', '&', '^'];

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
    dispatch! {one_of(OPERATORS_PREFIX).map(AsChar::as_char);
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
    #![expect(
        clippy::non_ascii_literal,
        reason = "using umlaute for XID_START testing purposes"
    )]
    use insta::{assert_debug_snapshot, assert_snapshot};
    use winnow::{
        error::{ContextError, ErrMode, ParseError},
        Parser,
    };

    use super::{ParseRestriction, Symbol};

    #[track_caller]
    fn parse(
        value: &str,
        restriction: ParseRestriction,
    ) -> Result<Symbol, ParseError<&str, ErrMode<ContextError>>> {
        let cursor = value;

        super::parse_symbol(restriction).parse(cursor)
    }

    #[track_caller]
    fn parse_ok(value: &str, restriction: ParseRestriction) -> Symbol {
        parse(value, restriction).expect("should be valid symbol")
    }

    #[track_caller]
    fn parse_err(
        value: &str,
        restriction: ParseRestriction,
    ) -> ParseError<&str, ErrMode<ContextError>> {
        parse(value, restriction).expect_err("should be invalid symbol")
    }

    #[test]
    fn rust() {
        assert_snapshot!(parse_ok("m", ParseRestriction::None), @"m");
        assert_snapshot!(parse_ok("main", ParseRestriction::None), @"main");
        assert_snapshot!(parse_ok("main_", ParseRestriction::None), @"main_");
        assert_snapshot!(parse_ok("main_123", ParseRestriction::None), @"main_123");
        assert_snapshot!(parse_ok("übung", ParseRestriction::None), @"übung");
        assert_snapshot!(parse_ok("_", ParseRestriction::None), @"_");
        assert_snapshot!(parse_ok("_test", ParseRestriction::None), @"_test");

        assert_debug_snapshot!(parse_err("123", ParseRestriction::None), @r###"
        ParseError {
            input: "123",
            offset: 0,
            inner: Backtrack(
                ContextError {
                    context: [],
                    cause: None,
                },
            ),
        }
        "###);
    }

    #[test]
    fn rust_ignored() {
        assert_snapshot!(parse_ok("_", ParseRestriction::None), @"_");
        assert_snapshot!(parse_ok("_test", ParseRestriction::None), @"_test");
    }

    #[test]
    fn rust_restrictions() {
        assert_snapshot!(parse_ok("übung", ParseRestriction::RustOnly), @"übung");
        assert_debug_snapshot!(parse_err("+", ParseRestriction::RustOnly), @r###"
        ParseError {
            input: "+",
            offset: 0,
            inner: Backtrack(
                ContextError {
                    context: [],
                    cause: None,
                },
            ),
        }
        "###);
    }

    #[test]
    fn operators() {
        assert_snapshot!(parse_ok("+", ParseRestriction::None), @"+");
        assert_snapshot!(parse_ok("-", ParseRestriction::None), @"-");
        assert_snapshot!(parse_ok("*", ParseRestriction::None), @"*");
        assert_snapshot!(parse_ok("/", ParseRestriction::None), @"/");
        assert_snapshot!(parse_ok("|", ParseRestriction::None), @"|");
        assert_snapshot!(parse_ok("&", ParseRestriction::None), @"&");
        assert_snapshot!(parse_ok("^", ParseRestriction::None), @"^");
        assert_snapshot!(parse_ok("==", ParseRestriction::None), @"==");
        assert_snapshot!(parse_ok("!", ParseRestriction::None), @"!");
        assert_snapshot!(parse_ok("!=", ParseRestriction::None), @"!=");
        assert_snapshot!(parse_ok(">", ParseRestriction::None), @">");
        assert_snapshot!(parse_ok(">=", ParseRestriction::None), @">=");
        assert_snapshot!(parse_ok("<", ParseRestriction::None), @"<");
        assert_snapshot!(parse_ok("<=", ParseRestriction::None), @"<=");
    }

    #[test]
    fn operators_safe() {
        assert_snapshot!(parse_ok("`+`", ParseRestriction::None), @"+");
        assert_snapshot!(parse_ok("`-`", ParseRestriction::None), @"-");
        assert_snapshot!(parse_ok("`*`", ParseRestriction::None), @"*");
        assert_snapshot!(parse_ok("`/`", ParseRestriction::None), @"/");
        assert_snapshot!(parse_ok("`|`", ParseRestriction::None), @"|");
        assert_snapshot!(parse_ok("`&`", ParseRestriction::None), @"&");
        assert_snapshot!(parse_ok("`^`", ParseRestriction::None), @"^");
        assert_snapshot!(parse_ok("`==`", ParseRestriction::None), @"==");
        assert_snapshot!(parse_ok("`!`", ParseRestriction::None), @"!");
        assert_snapshot!(parse_ok("`!=`", ParseRestriction::None), @"!=");
        assert_snapshot!(parse_ok("`>`", ParseRestriction::None), @">");
        assert_snapshot!(parse_ok("`>=`", ParseRestriction::None), @">=");
        assert_snapshot!(parse_ok("`<`", ParseRestriction::None), @"<");
        assert_snapshot!(parse_ok("`<=`", ParseRestriction::None), @"<=");

        assert_debug_snapshot!(parse_err("`ü`", ParseRestriction::None), @r###"
        ParseError {
            input: "`ü`",
            offset: 1,
            inner: Backtrack(
                ContextError {
                    context: [],
                    cause: None,
                },
            ),
        }
        "###);
    }

    #[test]
    fn operators_restrictions() {
        assert_debug_snapshot!(parse_err("+", ParseRestriction::RustOnly), @r###"
        ParseError {
            input: "+",
            offset: 0,
            inner: Backtrack(
                ContextError {
                    context: [],
                    cause: None,
                },
            ),
        }
        "###);
    }
}
