use hashql_core::{
    heap::Heap,
    symbol::{Ident, IdentKind, Symbol},
};
use unicode_normalization::{IsNormalized, UnicodeNormalization as _, is_nfc_quick};
use unicode_properties::{GeneralCategoryGroup, UnicodeGeneralCategory as _};
use url::Url;
use winnow::{
    ModalResult, Parser as _,
    combinator::{alt, cut_err, delimited, dispatch, fail, peek, preceded},
    error::{AddContext, ParserError, StrContext, StrContextValue},
    token::{any, one_of, take_while},
};

use super::context::Input;

fn intern<'heap>(heap: &'heap Heap, value: &str) -> Symbol<'heap> {
    if is_nfc_quick(value.chars()) == IsNormalized::Yes {
        heap.intern_symbol(value)
    } else {
        let normalized: String = value.nfc().collect();
        heap.intern_symbol(&normalized)
    }
}

fn parse_ident_lexical<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Ident<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    let used = (
        one_of(unicode_ident::is_xid_start),
        cut_err(take_while(0.., unicode_ident::is_xid_continue)),
    );

    let unused = ('_', take_while(1.., unicode_ident::is_xid_continue));

    alt((used, unused))
        .take()
        .with_span()
        .map(|(value, span): (&str, _)| Ident {
            span: context.span(span),
            value: intern(context.heap, value),
            kind: IdentKind::Lexical,
        })
        .parse_next(input)
}

fn is_symbol(char: char) -> bool {
    match char.as_ascii().map(|char| char as u8) {
        Some(
            b'!' | b'#' | b'$' | b'%' | b'&' | b'*' | b'+' | b'.' | b'/' | b'<' | b'=' | b'>'
            | b'?' | b'@' | b'\\' | b'^' | b'|' | b'-' | b'~' | b'[' | b']',
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
) -> ModalResult<Ident<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    let bare = || take_while(1.., is_symbol);
    let escaped = delimited(
        '`',
        bare(),
        cut_err('`').context(StrContext::Expected(StrContextValue::CharLiteral('`'))),
    );

    alt((escaped, bare()))
        .with_span()
        .map(|(value, span): (&str, _)| Ident {
            span: context.span(span),
            value: intern(context.heap, value),
            kind: IdentKind::Symbol,
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

fn is_url_char(char: char) -> bool {
    char.as_ascii()
        .is_some_and(|char| ALLOWED_URL_CHARS[char as usize])
}

fn parse_ident_url<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Ident<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    let context = input.state;

    let url = (one_of(is_url_char), cut_err(take_while(1.., is_url_char)))
        .take()
        .verify(|value: &str| {
            // check if the value is an actual URL, we have only parsed what *looks* like a URL
            let Ok(url) = Url::parse(value) else {
                return false;
            };

            let scheme = matches!(url.scheme(), "http" | "https");
            let ends_with_slash = value.ends_with('/');

            scheme && ends_with_slash
        })
        .context(StrContext::Expected(StrContextValue::Description(
            "http(s) url with trailing `/`",
        )));

    delimited(
        '`',
        url,
        cut_err('`').context(StrContext::Expected(StrContextValue::CharLiteral('`'))),
    )
    .with_span()
    .map(|(url, span)| Ident {
        span: context.span(span),
        value: intern(context.heap, url),
        kind: IdentKind::BaseUrl,
    })
    .parse_next(input)
}

pub(crate) fn parse_ident<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Ident<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    dispatch! {peek(any);
        '`' => cut_err(alt((parse_ident_symbol, parse_ident_url))),
        char if unicode_ident::is_xid_start(char) || char == '_' => parse_ident_lexical,
        char if is_symbol(char) => cut_err(parse_ident_symbol),
        _ => fail
    }
    .context(StrContext::Label("identifier"))
    .parse_next(input)
}

pub(crate) fn parse_ident_labelled_argument<'heap, 'span, 'source, E>(
    input: &mut Input<'heap, 'span, 'source>,
) -> ModalResult<Ident<'heap>, E>
where
    E: ParserError<Input<'heap, 'span, 'source>>
        + AddContext<Input<'heap, 'span, 'source>, StrContext>,
{
    preceded(
        cut_err(':').context(StrContext::Expected(StrContextValue::CharLiteral(':'))),
        parse_ident,
    )
    .parse_next(input)
}

#[cfg(test)]
mod tests {
    #![expect(clippy::non_ascii_literal)]

    use super::parse_ident;
    use crate::parser::string::test::{bind_parser, test_cases};

    bind_parser!(Debug; fn parse(parse_ident));

    // Test cases for lexical identifiers
    test_cases! {parse;
        lexical_basic("hello") => "Basic lexical identifier",
        lexical_with_underscore("_hello") => "Lexical identifier starting with underscore",
        lexical_with_numbers("hello123") => "Lexical identifier with numbers",
        lexical_mixed_case("HelloWorld") => "Lexical identifier with mixed case",
        lexical_with_trailing("hello_world after") => "Lexical identifier with trailing content",
    }

    // Test cases for Unicode identifiers
    test_cases! {parse;
        unicode_japanese("こんにちは") => "Japanese Unicode identifier",
        unicode_mixed("hello世界") => "Mixed ASCII and Unicode identifier",
        unicode_with_emoji("x☺") => "Identifier with emoji",
        unicode_precomposed("café") => "Identifier with precomposed character",
        unicode_decomposed("cafe\u{0301}") => "Identifier with decomposed character",
    }

    // Test cases for symbol identifiers
    test_cases! {parse;
        symbol_basic("++") => "Basic symbol",
        symbol_complex("<=>") => "Complex symbol combination",
        symbol_escaped("`++`") => "Escaped symbol",
        symbol_escaped_with_trailing("`++` next") => "Escaped symbol with trailing content",
        symbol_unicode("…") => "Unicode symbol",
        symbol_unicode_complex("≤≥≠") => "Complex Unicode symbols",
        symbol_unicode_escaped("`§¶†‡`") => "Escaped Unicode symbols",
    }

    // Test cases for URL identifiers
    test_cases! {parse;
        url_http("`http://example.com/`") => "Basic HTTP URL",
        url_https("`https://example.com/`") => "HTTPS URL",
        url_with_path("`https://example.com/path/to/resource/`") => "URL with path",
        url_with_query("`https://example.com/?query=value&param=123/`") => "URL with query parameters",
        url_with_trailing("`https://example.com/` next") => "URL with trailing content",
        url_with_port("`https://example.com:8080/`") => "URL with port",
        url_with_auth("`https://user:pass@example.com/`") => "URL with authentication",
        url_with_fragment("`https://example.com/#fragment/`") => "URL with fragment",
    }

    // Test cases for invalid inputs
    test_cases! {parse;
        invalid_url_no_trailing_slash("`https://example.com`") => "URL without trailing slash (invalid)",
        invalid_url_not_http("`ftp://example.com/`") => "Non-HTTP/HTTPS URL (invalid)",
        invalid_url_malformed("`http:///invalid/`") => "Malformed URL (invalid)",
        invalid_unclosed_backtick("`unclosed") => "Unclosed backtick (invalid)",
        invalid_unclosed_backtick_url("`https://example.com/") => "Unclosed backtick in URL (invalid)",
        invalid_empty("") => "Empty input (invalid)",
        invalid_whitespace("   ") => "Whitespace only (invalid)",
    }

    // Test for colon in symbols - should be rejected
    test_cases! {parse;
        invalid_colon_symbol(":") => "Colon as bare symbol (should be rejected)",
        invalid_colon_symbol_compound("::") => "Compound colon symbol (should be rejected)",
        invalid_colon_symbol_mixed("->:") => "Symbol with colon (should be rejected)",
        invalid_colon_symbol_assign(":=") => "Assignment with colon (should be rejected)",
        invalid_colon_symbol_backticks("`:`") => "Colon in backticks (should be rejected)",
        invalid_colon_symbol_backticks_compound("`:=`") => "Compound colon in backticks (should be rejected)",
        invalid_colon_in_fake_url("`example:not-url/`") => "Colon in invalid URL-like string (should be rejected)",
    }

    // Test mixed input scenarios
    test_cases! {parse;
        mixed_lexical_then_symbol("hello++") => "Lexical followed by symbol without space",
        mixed_with_whitespace("hello `symbol`") => "Lexical then symbol with space",
    }

    // Additional test for specific edge cases
    test_cases! {parse;
        edge_single_underscore("_") => "Single underscore identifier",
        edge_single_character("x") => "Single character identifier",
        edge_all_numbers_invalid("123") => "All numbers (invalid as lexical identifier)",
        edge_dash_only("-") => "Single dash as symbol",
        edge_complex_operators("<=>=><=>") => "Complex operator chain",
    }

    // Unicode normalization and edge cases
    test_cases! {parse;
        unicode_combining_marks("a\u{0308}\u{0323}") => "Identifier with multiple combining marks",
        unicode_homoglyphs("рaypal") => "Identifier with Cyrillic 'р' instead of Latin 'p'",
        unicode_zero_width("hello\u{200B}world") => "Identifier with zero-width space",
        unicode_normalization_nfd("a\u{0308}") => "Character with combining diaeresis (NFD)",
    }

    // Complex symbol tests
    test_cases! {parse;
        symbol_very_long(&"*".repeat(100)) => "Very long repeated symbol",
        symbol_mixed_blocks("≈∞♥★") => "Symbols from different Unicode blocks",
        symbol_with_whitespace("`+ +`") => "Symbol with internal whitespace in backticks",
    }

    // Complex URL tests
    test_cases! {parse;
        url_idn("`https://例子.测试/`") => "URL with internationalized domain name",
        url_ipv6("`https://[2001:db8::1]/`") => "URL with IPv6 address",
        url_percent_encoded("`https://example.com/%E2%82%AC/`") => "URL with percent-encoded characters",
        url_complex("`https://sub.many.levels.example.co.uk:8443/very/deep/path/?q=complex&t=true#section/`") => "Complex URL with multiple components",
    }

    // Error cases and boundaries
    test_cases! {parse;
        error_valid_start_invalid_continue("a\u{0000}bc") => "Identifier with null character",
        error_max_length_exceeded(&"a".repeat(10000)) => "Extremely long identifier",
        error_control_chars("test\u{0007}beep") => "Identifier with control character",
    }

    #[test]
    fn unicode_normalization() {
        // The precomposed character "é" (U+00E9)
        let precomposed = "café";

        // The decomposed version: "e" + combining acute accent (U+0065 U+0301)
        let decomposed = "cafe\u{0301}";

        // Parse both forms
        let (precomposed_result, _) = parse(precomposed);
        let (decomposed_result, _) = parse(decomposed);

        // They should be identical after parsing due to normalization
        assert_eq!(precomposed_result, decomposed_result);
    }
}
