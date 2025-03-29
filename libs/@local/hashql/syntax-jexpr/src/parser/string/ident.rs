use ada_url::{ParseUrlError, Url};
use hashql_core::symbol::{Ident, IdentKind, Symbol};
use unicode_normalization::{IsNormalized, UnicodeNormalization, is_nfc_quick};
use unicode_properties::{GeneralCategoryGroup, UnicodeGeneralCategory as _};
use winnow::{
    ModalResult, Parser as _,
    combinator::{alt, delimited, dispatch, peek},
    error::ParserError,
    token::{any, one_of, take_while},
};

use super::context::Input;

fn intern(value: &str) -> Symbol {
    match is_nfc_quick(value.chars()) {
        IsNormalized::Yes => Symbol::new(value),
        _ => Symbol::from_chars(value.nfc()),
    }
}

fn parse_ident_lexical<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Ident, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let used = (
        one_of(unicode_ident::is_xid_start),
        take_while(0.., unicode_ident::is_xid_continue),
    );

    let unused = (
        '_', //
        take_while(1.., unicode_ident::is_xid_continue),
    );

    alt((used, unused))
        .take()
        .with_span()
        .map(|(value, span): (&str, _)| Ident {
            span: context.span(span),
            name: intern(value),
            kind: IdentKind::Lexical,
        })
        .parse_next(input)
}

fn is_symbol(char: char) -> bool {
    match char.as_ascii().map(|char| char as u8) {
        Some(
            b'!' | b'#' | b'$' | b'%' | b'&' | b'*' | b'+' | b'.' | b'/' | b'<' | b'=' | b'>'
            | b'?' | b'@' | b'\\' | b'^' | b'|' | b'-' | b'~',
        ) => true,
        Some(_) => false,
        None => {
            matches!(
                char.general_category_group(),
                GeneralCategoryGroup::Punctuation | GeneralCategoryGroup::Symbol
            )
        }
    }
}

fn parse_ident_symbol<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Ident, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let bare = || take_while(1.., is_symbol);
    let escaped = delimited('`', bare(), '`');

    alt((escaped, bare()))
        .take()
        .with_span()
        .map(|(value, span): (&str, _)| Ident {
            span: context.span(span),
            name: intern(value),
            kind: IdentKind::Lexical,
        })
        .parse_next(input)
}

// see: https://www.ietf.org/rfc/rfc3986.txt
static ALLOWED_URL_CHARS: [bool; 256] = {
    const RS: bool = true; // reserved
    const UR: bool = true; // unreserved
    const PC: bool = true; // percent
    const __: bool = false; // not allowed

    [
        //   1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // 0
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // 1
        __, RS, __, RS, RS, PC, RS, RS, RS, RS, RS, RS, RS, UR, UR, RS, // 2
        UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, RS, RS, __, RS, __, RS, // 3
        RS, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, // 4
        UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, RS, __, RS, __, UR, // 5
        __, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, // 6
        UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, UR, __, __, __, UR, __, // 7
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // 8
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // 9
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // A
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // B
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // C
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // D
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // E
        __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // F
    ]
};

fn parse_ident_url<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Ident, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    let context = input.state;

    let url = take_while(1.., |char: char| {
        char.as_ascii()
            .is_some_and(|char| ALLOWED_URL_CHARS[char as usize])
    });

    delimited('`', url, '`')
        .verify(|value| {
            // TODO: proper errors for this, maybe we should even parse

            // check if the value is an actual URL, we have only parsed what *looks* like a URL
            let is_valid_url = Url::can_parse(value, None);
            // the URL must be either http or https
            let is_http_or_https = value.starts_with("http://") || value.starts_with("https://");
            let ends_with_slash = value.ends_with("/");

            is_valid_url && is_http_or_https && ends_with_slash
        })
        .with_span()
        .map(|(url, span)| Ident {
            span: context.span(span),
            name: intern(url),
            kind: IdentKind::BaseUrl,
        })
        .parse_next(input)
}

pub(crate) fn parse_ident<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Ident, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>,
{
    dispatch! {peek(any);
        '`' => alt((parse_ident_url, parse_ident_symbol)),
        char if unicode_ident::is_xid_start(char) || char == '_' => parse_ident_lexical,
        _ => parse_ident_symbol
    }
    .parse_next(input)
}
