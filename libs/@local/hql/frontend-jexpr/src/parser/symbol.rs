use ecow::EcoString;
use hql_cst::symbol::Symbol;
use unicode_ident::{is_xid_continue, is_xid_start};
use winnow::{
    combinator::{delimited, empty, fail, opt, peek},
    dispatch,
    error::ParserError,
    stream::{AsChar, Compare, Location, Stream, StreamIsPartial},
    token::{any, one_of, take_while},
    PResult, Parser, Stateful,
};

use super::{string::ParseState, IntoTextRange};
use crate::span::Span;

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
pub(crate) fn parse_symbol<'arena, 'spans, Input, Error>(
    restriction: ParseRestriction,
) -> impl Parser<Stateful<Input, ParseState<'arena, 'spans>>, Symbol, Error>
where
    Input: StreamIsPartial
        + Stream<Token: AsChar + Clone, Slice: AsRef<str>>
        + Compare<char>
        + for<'a> Compare<&'a str>
        + Location,
    Error: ParserError<Stateful<Input, ParseState<'arena, 'spans>>>,
{
    move |input: &mut Stateful<Input, ParseState<'arena, 'spans>>| {
        let state = input.state;

        dispatch! {peek(any).map(|token: Input::Token| token.as_char());
            char if is_xid_start(char) => parse_rust_identifier,
            '_' => parse_rust_identifier,
            char if restriction.allow_unsafe() && OPERATORS_PREFIX.contains(&char) => parse_operator,
            '`' => parse_safe_operator,
            _ => fail
        }
        .with_span()
        .map(move |(value, span): (Input::Slice, _)| {
            let value =
            EcoString::from(value.as_ref());
            let span = state.spans.insert(Span {
                range: span.range_trunc(),
                pointer: None,
                parent_id: state.parent_id,
            });

            Symbol { value, span }
        })
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
        .take()
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
    .take()
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
    use hql_cst::arena::Arena;
    use hql_span::storage::SpanStorage;
    use insta::{assert_debug_snapshot, assert_snapshot};
    use winnow::{
        error::{ContextError, ErrMode, ParseError},
        Located, Parser, Stateful,
    };

    use super::{ParseRestriction, Symbol};
    use crate::parser::string::ParseState;

    #[track_caller]
    fn parse<'arena, 'spans, 'input>(
        state: ParseState<'arena, 'spans>,
        input: &'input str,
        restriction: ParseRestriction,
    ) -> Result<
        Symbol,
        ParseError<
            Stateful<Located<&'input str>, ParseState<'arena, 'spans>>,
            ErrMode<ContextError>,
        >,
    > {
        let state = Stateful {
            input: Located::new(input),
            state,
        };

        super::parse_symbol(restriction).parse(state)
    }

    #[track_caller]
    fn parse_ok<'arena, 'spans, 'input>(
        state: ParseState<'arena, 'spans>,
        input: &'input str,
        restriction: ParseRestriction,
    ) -> Symbol {
        parse(state, input, restriction).expect("should be valid symbol")
    }

    #[track_caller]
    fn parse_err<'arena, 'spans, 'input>(
        state: ParseState<'arena, 'spans>,
        input: &'input str,
        restriction: ParseRestriction,
    ) -> ParseError<Stateful<Located<&'input str>, ParseState<'arena, 'spans>>, ErrMode<ContextError>>
    {
        parse(state, input, restriction).expect_err("should be invalid symbol")
    }

    macro_rules! setup {
        ($state:ident) => {
            let arena = Arena::new();
            let spans = SpanStorage::new();

            let $state = ParseState {
                arena: &arena,
                spans: &spans,
                parent_id: None,
            };
        };
    }

    #[test]
    fn rust() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "m", ParseRestriction::None), @"m");
        assert_snapshot!(parse_ok(state, "main", ParseRestriction::None), @"main");
        assert_snapshot!(parse_ok(state, "main_", ParseRestriction::None), @"main_");
        assert_snapshot!(parse_ok(state, "main_123", ParseRestriction::None), @"main_123");
        assert_snapshot!(parse_ok(state, "übung", ParseRestriction::None), @"übung");
        assert_snapshot!(parse_ok(state, "_", ParseRestriction::None), @"_");
        assert_snapshot!(parse_ok(state, "_test", ParseRestriction::None), @"_test");

        assert_debug_snapshot!(parse_err(state, "123", ParseRestriction::None), @r###"
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
        setup!(state);

        assert_snapshot!(parse_ok(state, "_", ParseRestriction::None), @"_");
        assert_snapshot!(parse_ok(state, "_test", ParseRestriction::None), @"_test");
    }

    #[test]
    fn safe_mode() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "übung", ParseRestriction::SafeOnly), @"übung");
        assert_debug_snapshot!(parse_err(state, "+", ParseRestriction::SafeOnly), @r###"
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
        assert_snapshot!(parse_ok(state, "`+`", ParseRestriction::SafeOnly), @"+");
    }

    #[test]
    fn operators() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "+", ParseRestriction::None), @"+");
        assert_snapshot!(parse_ok(state, "-", ParseRestriction::None), @"-");
        assert_snapshot!(parse_ok(state, "*", ParseRestriction::None), @"*");
        assert_snapshot!(parse_ok(state, "/", ParseRestriction::None), @"/");
        assert_snapshot!(parse_ok(state, "|", ParseRestriction::None), @"|");
        assert_snapshot!(parse_ok(state, "&", ParseRestriction::None), @"&");
        assert_snapshot!(parse_ok(state, "^", ParseRestriction::None), @"^");
        assert_snapshot!(parse_ok(state, "==", ParseRestriction::None), @"==");
        assert_snapshot!(parse_ok(state, "!", ParseRestriction::None), @"!");
        assert_snapshot!(parse_ok(state, "!=", ParseRestriction::None), @"!=");
        assert_snapshot!(parse_ok(state, ">", ParseRestriction::None), @">");
        assert_snapshot!(parse_ok(state, ">=", ParseRestriction::None), @">=");
        assert_snapshot!(parse_ok(state, "<", ParseRestriction::None), @"<");
        assert_snapshot!(parse_ok(state, "<=", ParseRestriction::None), @"<=");
    }

    #[test]
    fn operators_safe() {
        setup!(state);

        assert_snapshot!(parse_ok(state, "`+`", ParseRestriction::None), @"+");
        assert_snapshot!(parse_ok(state, "`-`", ParseRestriction::None), @"-");
        assert_snapshot!(parse_ok(state, "`*`", ParseRestriction::None), @"*");
        assert_snapshot!(parse_ok(state, "`/`", ParseRestriction::None), @"/");
        assert_snapshot!(parse_ok(state, "`|`", ParseRestriction::None), @"|");
        assert_snapshot!(parse_ok(state, "`&`", ParseRestriction::None), @"&");
        assert_snapshot!(parse_ok(state, "`^`", ParseRestriction::None), @"^");
        assert_snapshot!(parse_ok(state, "`==`", ParseRestriction::None), @"==");
        assert_snapshot!(parse_ok(state, "`!`", ParseRestriction::None), @"!");
        assert_snapshot!(parse_ok(state, "`!=`", ParseRestriction::None), @"!=");
        assert_snapshot!(parse_ok(state, "`>`", ParseRestriction::None), @">");
        assert_snapshot!(parse_ok(state, "`>=`", ParseRestriction::None), @">=");
        assert_snapshot!(parse_ok(state, "`<`", ParseRestriction::None), @"<");
        assert_snapshot!(parse_ok(state, "`<=`", ParseRestriction::None), @"<=");

        assert_debug_snapshot!(parse_err(state, "`ü`", ParseRestriction::None), @r###"
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
