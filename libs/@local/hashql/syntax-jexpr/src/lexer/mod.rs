use hashql_core::span::{SpanAncestors, SpanId, SpanTable};
use hashql_diagnostics::Diagnostic;
use logos::SpannedIter;
use text_size::{TextRange, TextSize};

pub(crate) use self::number::Number;
use self::{
    error::{
        LexerDiagnosticCategory, LexerError, from_hifijson_str_error, from_invalid_utf8_error,
        from_number_error, from_unrecognized_character_error,
    },
    number::ParseNumberError,
    token::Token,
    token_kind::TokenKind,
};
use crate::span::Span;

pub(crate) mod error;
mod number;
mod parse;
pub(crate) mod syntax_kind;
pub(crate) mod syntax_kind_set;
pub(crate) mod token;
pub(crate) mod token_kind;

pub(crate) struct LexerContext<'source> {
    pub spans: &'source mut SpanTable<Span>,
}

pub(crate) struct Lexer<'source> {
    inner: SpannedIter<'source, TokenKind<'source>>,
}

impl<'source> Lexer<'source> {
    /// Create a new lexer from the given source.
    ///
    /// # Panics
    ///
    /// Panics if the source is larger than 4GiB.
    #[must_use]
    pub(crate) fn new(source: &'source [u8]) -> Self {
        assert!(
            u32::try_from(source.len()).is_ok(),
            "source is larger than 4GiB"
        );

        Self {
            inner: logos::Lexer::new(source).spanned(),
        }
    }

    #[must_use]
    pub(crate) fn span(&self) -> TextRange {
        let span = self.inner.span();

        // The constructor verifies that the span is always less than `u32::MAX`.
        let start = TextSize::try_from(span.start).unwrap_or_else(|_error| unreachable!());
        let end = TextSize::try_from(span.end).unwrap_or_else(|_error| unreachable!());

        TextRange::new(start, end)
    }

    pub(crate) fn advance(
        &mut self,
        context: &mut LexerContext,
    ) -> Option<Result<Token<'source>, Diagnostic<LexerDiagnosticCategory, SpanId>>> {
        let (kind, span) = self.inner.next()?;

        let span = {
            // The constructor verifies that the span is always less than `u32::MAX`.
            let start = TextSize::try_from(span.start).unwrap_or_else(|_error| unreachable!());
            let end = TextSize::try_from(span.end).unwrap_or_else(|_error| unreachable!());

            TextRange::new(start, end)
        };

        match kind {
            Ok(kind) => Some(Ok(Token { kind, span })),
            Err(LexerError::Number(ParseNumberError { kind, range })) => {
                let span = context.spans.insert(Span::new(range), SpanAncestors::EMPTY);

                Some(Err(from_number_error(kind, span)))
            }
            Err(LexerError::String { error, range }) => {
                let span = context.spans.insert(Span::new(range), SpanAncestors::EMPTY);

                Some(Err(from_hifijson_str_error(&error, span)))
            }
            Err(LexerError::UnrecognizedCharacter) => {
                // we need to make sure that we're not inside of a unicode character
                // The current slice is always a byte long, if we error out.
                let current = self.inner.slice();

                let first_byte = current[0];

                // Determine UTF-8 sequence length from the leading byte
                let expected_len = if first_byte & 0x80 == 0 {
                    // ASCII character (0xxxxxxx)
                    1
                } else if first_byte & 0xE0 == 0xC0 {
                    // 2-byte sequence (110xxxxx)
                    2
                } else if first_byte & 0xF0 == 0xE0 {
                    // 3-byte sequence (1110xxxx)
                    3
                } else if first_byte & 0xF8 == 0xF0 {
                    // 4-byte sequence (11110xxx)
                    4
                } else {
                    // Invalid UTF-8 sequence
                    let span = context.spans.insert(Span::new(span), SpanAncestors::EMPTY);
                    return Some(Err(from_invalid_utf8_error(span)));
                };

                // Create a span that covers the entire sequence
                let span =
                    TextRange::new(span.start(), span.start() + TextSize::from(expected_len));

                // make sure that the when advancing the parser we do not error out the next token
                let length = self.inner.remainder().len();
                self.inner
                    .bump(usize::min((expected_len as usize) - 1, length));

                let span = context.spans.insert(Span::new(span), SpanAncestors::EMPTY);
                Some(Err(from_unrecognized_character_error(span)))
            }
        }
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::non_ascii_literal)]
    use hashql_core::span::{SpanId, SpanTable};
    use hashql_diagnostics::{Diagnostic, source::SourceId};
    use insta::{assert_snapshot, with_settings};
    use text_size::TextRange;

    use super::{Lexer, LexerContext, error::LexerDiagnosticCategory, token::Token};
    use crate::{span::Span, test::render_diagnostic};

    fn parse<'source>(
        source: &'source str,
        spans: &mut SpanTable<Span>,
    ) -> Result<Vec<Token<'source>>, Diagnostic<LexerDiagnosticCategory, SpanId>> {
        let mut lexer = Lexer::new(source.as_bytes());

        let mut tokens = Vec::new();
        while let Some(token) = lexer.advance(&mut LexerContext { spans }) {
            let token = token?;
            tokens.push(token);
        }

        Ok(tokens)
    }

    macro assert_parse($source:expr, $description:literal) {{
        let tokens = parse($source, &mut SpanTable::new(SourceId::new_unchecked(0x00))).expect("should parse successfully");
        // we're not super interested in the spans (a different test covers these)
        let compiled = tokens
            .into_iter()
            .map(|token| token.kind.to_string())
            .collect::<Vec<_>>()
            .join(" ");

        with_settings!({
            description => $description
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, compiled, $source);
        })
    }}

    macro assert_parse_fail($source:expr, $description:literal) {{
        let mut spans = SpanTable::new(SourceId::new_unchecked(0x00));
        let diagnostic = parse($source, &mut spans).expect_err("should fail to parse");

        let report = render_diagnostic($source, &diagnostic, &spans);

        with_settings!({
            description => $description
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, report, $source);
        })
    }}

    macro test_cases(
        $(
            $name:ident($source:expr) => $description:expr,
        )*
    ) {
        $(
            #[test]
            fn $name() {
                assert_parse!($source, $description);
            }
        )*
    }

    macro test_cases_fail(
        $(
            $name:ident($source:expr) => $description:expr,
        )*
    ) {
        $(
            #[test]
            fn $name() {
                assert_parse_fail!($source, $description);
            }
        )*
    }

    test_cases! {
        // Object tests
        empty_object("{}") => "Empty object",
        simple_object(r#"{"key": "value"}"#) => "Simple key-value object",
        nested_object(r#"{"outer": {"inner": "value"}}"#) => "Nested objects",
        complex_object(r#"{"string": "text", "number": 42, "boolean": true, "null": null, "array": [1, 2, 3]}"#) =>
            "Complex object with multiple value types",
        multiple_properties(r#"{"prop1": "val1", "prop2": "val2", "prop3": "val3"}"#) =>
            "Object with multiple properties",

        // Array tests
        empty_array("[]") => "Empty array",
        simple_array("[1, 2, 3]") => "Simple number array",
        mixed_array(r#"[1, "text", true, null]"#) => "Array with mixed types",
        nested_array("[[1, 2], [3, 4]]") => "Nested arrays",
        array_of_objects(r#"[{"id": 1}, {"id": 2}]"#) => "Array of objects",
        object_with_arrays(r#"{"numbers": [1, 2, 3], "strings": ["a", "b", "c"]}"#) =>
            "Object containing arrays",

        // Value tests
        bool_true("true") => "Boolean true value",
        bool_false("false") => "Boolean false value",
        null_value("null") => "Null value",

        // String tests
        empty_string(r#""""#) => "Empty string",
        simple_string(r#""hello world""#) => "Simple string",
        escaped_string(r#""hello \"world\"""#) => "String with escaped quotes",
        unicode_string(r#""こんにちは世界""#) => "Unicode string",
        escaped_unicode(r#""\u3053\u3093\u306B\u3061\u306F""#) => "String with escaped unicode",
        special_chars(r#""\b\f\n\r\t""#) => "String with special characters",
        surrogate_pair(r#""\uD834\uDD1E""#) => "String with surrogate pair",

        // Number tests
        integer("42") => "Integer number",
        negative_integer("-42") => "Negative integer",
        zero("0") => "Zero",
        decimal("3.14159") => "Decimal number",
        exponent("1.0e10") => "Number with exponent",
        neg_exponent("1.0e-10") => "Number with negative exponent",

        // Whitespace handling
        space_indentation("  {  \n  \"key\"  :  42  \n  }  ") =>
            "JSON with space indentation",
        tab_indentation("\t{\t\"key\"\t:\t42\t}\t") =>
            "JSON with tab indentation",
        mixed_whitespace(" \t\r\n{ \t\r\n\"key\" \t\r\n: \t\r\n42 \t\r\n} \t\r\n") =>
            "JSON with mixed whitespace",

        // Complex combinations
        complex_nested(r#"{"data": {"users": [{"name": "Alice", "roles": ["admin", "user"], "active": true}, {"name": "Bob", "roles": ["user"], "active": false}]}}"#) =>
            "Complex nested structure",

        // Syntax errors - these are completely valid as we're not parsing, we're just lexing
        trailing_comma("[1, 2, 3,]") => "Array with trailing comma",
        missing_comma("[1 2 3]") => "Array with missing commas",
        extra_comma("[1,,2]") => "Array with extra comma",

        // Number edge cases
        max_precision_number("1.7976931348623157e308") => "Maximum precision double value",
        min_precision_number("5e-324") => "Minimum precision double value",
        integer_precision("9007199254740991") => "Maximum integer precision (2^53-1)",
        arbitrary_precision("9007199254740992") => "Arbitrary precision integer",

        // String escape sequences
        serialized_json(r#""This JSON string has \"quotes\" and a \\ backslash""#) =>
            "JSON with already-escaped characters",
        escaped_controls(r#""\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007""#) =>
            "String with escaped control characters",

        // JSONC
        // Single line comments
        preceded_comment("// This is a comment\n42") => "Comment at the beginning should be skipped",
        trailing_comment("42\n// This is a comment") => "Comment at the end should be skipped",
        separated_comment("42\n// This is a comment\n42") => "Comment in the middle should be skipped",
        adjacent_comment("42 // This is a comment\n42") => "Comment after element should be skipped",
        adjacent_comment_no_space("42//This is a comment\n42") => "Comment after element without space",
        empty_comment("42\n//\n42") => "Empty comment should be skipped",
        comment_json_inside(r#"//"{"key": "value"}""#) => "JSON inside comment",
        comment_no_space_between("//abc") => "JSON inside comment without space",

        // Multi line comments
        preceded_multiline_comment("/* This is a multi-line comment */42") => "Simple multi-line comment should be skipped",
        trailing_multiline_comment("42/* This is a multi-line comment */") => "Simple multi-line comment should be skipped",
        separated_multiline_comment("42/* This is a multi-line comment */42") => "Simple multi-line comment should be skipped",
        empty_multiline_comment("42/**/42") => "Empty multi-line comment should be skipped",
        multiline_comment_json_inside(r#"42/* This is a multi-line comment with JSON {"key": "value"} */42"#) => "JSON inside multi-line comment",
        multiline_linebreak("42/* This is a multi-line comment with line break\n inside*/42") => "Line break inside multi-line comment",
        // see: https://linear.app/hash/issue/H-4325/hashql-j-expr-more-comprehensive-multiline-comment-support
        // multiline_almost_end("/* Almost closing comment **/42") => "Multi-line comment with extra asterisk that isn't the closing delimiter",
        multiline_with_asterisks("/* * * *\n * comment *\n * * */42") => "Multi-line comment with decorative asterisks",
    }

    test_cases_fail! {
        // String errors
        invalid_escape(r#""\z""#) => "Invalid escape sequence",
        unterminated_string(r#""hello"#) => "Unterminated string literal",
        control_character("\"hello \u{0007} world") => "String with ASCII control character",
        missing_surrogate_pair(r#""\uD800""#) => "Missing low surrogate in surrogate pair",

        // Number errors
        invalid_number(r#"{"number": 42.}"#) => "Invalid number format (trailing decimal point)",
        invalid_exponent("1e") => "Invalid exponent format",
        plus_prefix("+42") => "Number with plus prefix",
        double_minus("--42") => "Number with double minus",
        leading_zero("042") => "Number with leading zero",

        // Structure errors
        unrecognized_character(r#"{"ferris": 🦀}"#) => "Unrecognized emoji character",
        invalid_literal(r#"{"value": True}"#) => "Incorrect case for true literal",

        // Additional control character tests
        control_char_null("\"hello\u{0000}world\"") => "String with null control character",
        control_char_tab_inside_quotes("\"\thello\"") => "Tab character inside quotes",
        control_char_newline_inside_quotes("\"\nhello\"") => "Newline character inside quotes",

        // Emoji tests - single emoji characters
        emoji_simple("😀") => "Simple emoji (4 bytes)",
        emoji_crab("🦀") => "Crab emoji (4 bytes)",
        emoji_rocket("🚀") => "Rocket emoji (4 bytes)",
        emoji_flag("🇺🇸") => "Flag emoji (multiple bytes)",

        // Complex emoji sequences
        emoji_family("👨‍👩‍👧‍👦") => "Family emoji with zero-width joiners",
        emoji_scientist("👩🏾‍🔬") => "Emoji with skin tone modifier and profession",
        emoji_variation("❤️") => "Emoji with variation selector",

        // Multi-character Unicode sequences
        emoji_sequence("🚀🦀💻") => "Multiple emoji characters in sequence",
        japanese_text("こんにちは") => "Multiple Japanese characters",
        mixed_characters("あa三b") => "Mix of single and multi-byte characters",

        // JSONC
        unclosed_multiline_comment("/* This comment never ends") => "Unclosed multi-line comment",
        multiline_comment_too_smol("/*/") => "Multi-line comment is missing closing *",
    }

    #[test]
    fn span_range() {
        let source = r#"{"key": 42}"#;
        let mut spans = SpanTable::new(SourceId::new_unchecked(0x00));
        let mut lexer = Lexer::new(source.as_bytes());

        let mut advance = |lexer: &mut Lexer| {
            lexer
                .advance(&mut LexerContext { spans: &mut spans })
                .expect("should have a token")
                .expect("token should be valid")
                .span
        };

        // First token should be '{'
        let span = advance(&mut lexer);
        assert_eq!(span, TextRange::new(0.into(), 1.into()));

        // Next token should be the string "key"
        let span = advance(&mut lexer);
        assert_eq!(span, TextRange::new(1.into(), 6.into()));

        // Next token should be ':'
        let span = advance(&mut lexer);
        assert_eq!(span, TextRange::new(6.into(), 7.into()));

        // Next token should be the number 42
        let span = advance(&mut lexer);
        assert_eq!(span, TextRange::new(8.into(), 10.into()));

        // Next token should be '}'
        let span = advance(&mut lexer);
        assert_eq!(span, TextRange::new(10.into(), 11.into()));

        // Lexer should be exhausted
        assert!(
            lexer
                .advance(&mut LexerContext { spans: &mut spans })
                .is_none()
        );
    }

    #[test]
    fn custom_error_handling() {
        let source = r#"{"key": 42.}"#;
        let mut spans = SpanTable::new(SourceId::new_unchecked(0x00));
        let result = parse(source, &mut spans);

        assert!(result.is_err(), "should fail to parse invalid number");
        let diagnostic = result.expect_err("should fail to parse invalid number");

        match diagnostic.category {
            LexerDiagnosticCategory::InvalidNumber => {}
            category @ (LexerDiagnosticCategory::InvalidString
            | LexerDiagnosticCategory::InvalidCharacter
            | LexerDiagnosticCategory::InvalidUtf8
            | LexerDiagnosticCategory::UnexpectedEof
            | LexerDiagnosticCategory::UnexpectedToken) => {
                panic!("Expected InvalidNumber error, got {category:?}")
            }
        }
    }

    #[test]
    fn invalid_utf8_sequences() {
        // We need to create some invalid UTF-8 sequences - this requires unsafe code
        // or preparing binary data. Since this is a test, we'll use a controlled approach:

        let invalid_sequences: [&[u8]; 8] = [
            // Construct byte sequences for testing
            &[0xC0, 0x80],             // Overlong encoding of NUL character
            &[0xE0, 0x80, 0x80],       // Overlong encoding of NUL character
            &[0xF0, 0x80, 0x80, 0x80], // Overlong encoding of NUL character
            &[0xC0],                   // Incomplete 2-byte sequence
            &[0xE0, 0x80],             // Incomplete 3-byte sequence
            &[0xF0, 0x80, 0x80],       // Incomplete 4-byte sequence
            &[0xF8],                   // Invalid leading byte
            &[0xFF],                   // Invalid leading byte
        ];

        for bytes in invalid_sequences {
            // Create a storage for spans
            let mut spans = SpanTable::new(SourceId::new_unchecked(0x00));

            // Create a lexer directly from the bytes
            let mut lexer = Lexer::new(bytes);

            // Get the first token
            let result = lexer.advance(&mut LexerContext { spans: &mut spans });

            let diagnostic = result
                .expect("Lexer should produce a result for invalid UTF-8")
                .expect_err("Invalid UTF-8 should produce an error");

            // For invalid UTF-8 we expect either InvalidCharacter or InvalidUtf8
            assert!(
                matches!(
                    diagnostic.category,
                    LexerDiagnosticCategory::InvalidCharacter
                        | LexerDiagnosticCategory::InvalidUtf8
                ),
                "Expected InvalidCharacter or InvalidUtf8 error, got {:?}",
                diagnostic.category
            );
        }
    }
}
