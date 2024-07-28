use core::{fmt, fmt::Display};

use ecow::EcoString;
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
pub struct Symbol(EcoString);

impl Display for Symbol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, f)
    }
}

/// Restrictions on the valid symbols that can be used
///
/// In certain contexts, such as when parsing generics of signatures, some operator symbols
/// introduce ambiguity, for example, given `<>() -> Unit` (which is valid), `<` is used to indicate
/// the start of all generic arguments, but because `>` is a valid identifier character, the parser
/// assumes that `>` is the name of a generic, and then fails, as no closing `>` is found.
///
/// Using parsing restrictions, the signature parser is able to restrict the set of valid symbols to
/// only safe identifiers, which do not suffer from this ambiguity.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub(crate) enum ParseRestriction {
    /// Any symbol is allowed
    /// This includes:
    /// - Rust identifiers
    /// - Operators
    /// - Safe Operators
    #[default]
    None,
    /// This includes:
    /// - Rust identifiers
    /// - Safe Operators
    SafeOnly,
}

impl ParseRestriction {
    const fn allow_unsafe(self) -> bool {
        matches!(self, Self::None)
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
            char if is_xid_start(char) => parse_rust_identifier,
            '_' => parse_rust_identifier,
            char if restriction.allow_unsafe() && OPERATORS_PREFIX.contains(&char) => parse_operator,
            '`' => parse_safe_operator,
            _ => fail
        }
        .map(|value: Input::Slice| EcoString::from(value.as_ref()))
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
    fn safe_mode() {
        assert_snapshot!(parse_ok("übung", ParseRestriction::SafeOnly), @"übung");
        assert_debug_snapshot!(parse_err("+", ParseRestriction::SafeOnly), @r###"
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
        assert_snapshot!(parse_ok("`+`", ParseRestriction::SafeOnly), @"+");
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
}
