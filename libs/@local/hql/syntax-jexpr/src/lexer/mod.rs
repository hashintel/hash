use alloc::sync::Arc;

use hql_diagnostics::Diagnostic;
use hql_span::{storage::SpanStorage, SpanId};
use logos::SpannedIter;
use text_size::{TextRange, TextSize};

use self::{
    error::{
        from_hifijson_num_error, from_hifijson_str_error, from_unrecognized_character_error,
        LexingError,
    },
    token::Token,
    token_kind::TokenKind,
};
use crate::span::Span;

mod error;
mod parse;
pub(crate) mod syntax_kind;
pub(crate) mod syntax_kind_set;
pub(crate) mod token;
pub(crate) mod token_kind;

pub(crate) struct Lexer<'source> {
    inner: SpannedIter<'source, TokenKind<'source>>,
    spans: Arc<SpanStorage<Span>>,
}

impl<'source> Lexer<'source> {
    /// Create a new lexer from the given source.
    ///
    /// # Panics
    ///
    /// Panics if the source is larger than 4GiB.
    #[must_use]
    pub(crate) fn new(source: &'source [u8], storage: impl Into<Arc<SpanStorage<Span>>>) -> Self {
        assert!(
            u32::try_from(source.len()).is_ok(),
            "source is larger than 4GiB"
        );

        Self {
            inner: logos::Lexer::new(source).spanned(),
            spans: storage.into(),
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
    ) -> Option<Result<Token<'source>, Diagnostic<'static, SpanId>>> {
        let (kind, span) = self.inner.next()?;

        let span = {
            // The constructor verifies that the span is always less than `u32::MAX`.
            let start = TextSize::try_from(span.start).unwrap_or_else(|_error| unreachable!());
            let end = TextSize::try_from(span.end).unwrap_or_else(|_error| unreachable!());

            TextRange::new(start, end)
        };

        match kind {
            Ok(kind) => Some(Ok(Token { kind, span })),
            Err(LexingError::Number { error, range }) => {
                let span = self.spans.insert(Span::new(range));

                Some(Err(from_hifijson_num_error(&error, span)))
            }
            Err(LexingError::String { error, range }) => {
                let span = self.spans.insert(Span::new(range));

                Some(Err(from_hifijson_str_error(&error, span)))
            }
            Err(LexingError::UnrecognizedCharacter) => {
                let span = self.spans.insert(Span::new(span));

                Some(Err(from_unrecognized_character_error(span)))
            }
        }
    }
}

impl<'source> Iterator for Lexer<'source> {
    type Item = Result<Token<'source>, Diagnostic<'static, SpanId>>;

    fn next(&mut self) -> Option<Self::Item> {
        self.advance()
    }
}

#[cfg(test)]
mod test {
    use core::fmt::Write;

    use hql_diagnostics::{config::ReportConfig, span::DiagnosticSpan};
    use hql_span::storage::SpanStorage;
    use insta::assert_snapshot;

    use super::Lexer;
    use crate::span::Span;

    #[test]
    fn ok() {
        let input = r#"
            {
                "hello": "world",
                "number": 42,
                "array": [1, 2, 3],
                "object": {
                    "key": "value"
                }
            }
        "#;

        let tokens: Vec<_> = Lexer::new(input.as_bytes(), SpanStorage::new())
            .map(|result| result.map(|token| token.kind))
            .collect::<Result<_, _>>()
            .expect("no malformed tokens");

        let output = tokens.into_iter().fold(String::new(), |mut acc, token| {
            write!(acc, "{token}").expect("infallible");

            acc
        });

        assert_snapshot!(output, @r###"{"hello":"world","number":42,"array":[1,2,3],"object":{"key":"value"}}"###);
    }

    fn parse_err(input: &str, skip: usize) -> String {
        let mut lexer = Lexer::new(input.as_bytes(), SpanStorage::new());

        for _ in 0..skip {
            lexer.next();
        }

        let diagnostic = lexer
            .next()
            .expect("lexer should have lexed at least one token")
            .expect_err("token should have been an error");

        let diagnostic = diagnostic
            .resolve(&lexer.spans)
            .expect("span storage should have a reference to every span");

        let report = diagnostic.report(
            ReportConfig {
                color: false,
                ..ReportConfig::default()
            }
            .with_transform_span(|span: &Span| DiagnosticSpan::from(span)),
        );

        let mut output = Vec::new();
        report
            .write_for_stdout(ariadne::Source::from(input), &mut output)
            .expect("infallible");

        String::from_utf8(output).expect("output should be valid UTF-8")
    }

    #[expect(clippy::non_ascii_literal, reason = "emoji for testing purposes")]
    #[test]
    fn unrecognized_character() {
        let input = r#"{"ferris": 🦀}"#;

        let output = parse_err(input, 3);
        assert_snapshot!(insta::_macro_support::AutoName, output, input);
    }

    #[test]
    fn invalid_number() {
        let input = r#"{"number": 42.}"#;

        let output = parse_err(input, 3);
        assert_snapshot!(insta::_macro_support::AutoName, output, input);
    }

    #[test]
    fn unterminated_string() {
        let input = r#""hello"#;

        let output = parse_err(input, 0);
        assert_snapshot!(insta::_macro_support::AutoName, output, input);
    }

    #[test]
    fn missing_surrogate_pair() {
        let input = r#""\uD800""#;

        let output = parse_err(input, 0);
        assert_snapshot!(insta::_macro_support::AutoName, output, input);
    }

    #[test]
    fn invalid_escape() {
        let input = r#""\z""#;

        let output = parse_err(input, 0);
        assert_snapshot!(insta::_macro_support::AutoName, output, input);
    }
}
