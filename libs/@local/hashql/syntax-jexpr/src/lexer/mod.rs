//! Logos-driven lexer callbacks and lossless token stream for J-Expr.

use text_size::{TextRange, TextSize};

use crate::syntax_kind::SyntaxKind;

pub(crate) mod number;
pub(crate) mod string;

pub(crate) use self::{
    number::{Number, ParseNumberError, ParseNumberErrorKind},
    string::{StringError, decode_quoted},
};

/// Lexical error encountered while tokenizing J-Expr input.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub enum LexError {
    /// Invalid string literal with the exact byte offset where validation failed.
    String {
        /// Specific string lexing failure.
        error: StringError,
        /// Byte range where string validation failed.
        range: TextRange,
    },
    /// Invalid number literal.
    Number(ParseNumberError),
    /// Unterminated `/* ...` block comment.
    UnterminatedBlockComment,
    /// Unrecognized character or bare word.
    #[default]
    UnrecognizedCharacter,
}

/// One scanned token produced on demand by [`Lexer`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ScannedToken {
    /// Syntax kind emitted into the green tree.
    pub kind: SyntaxKind,
    /// Byte range in the source string.
    pub range: TextRange,
    /// Whether a [`SyntaxKind::String`] token contained escape sequences.
    pub has_escapes: bool,
    /// Lex error associated with this token, if any.
    pub error: Option<LexError>,
}

/// Logos callback for `//` line comments up to the line break.
pub(crate) fn lex_line_comment(lexer: &mut logos::Lexer<'_, SyntaxKind>) {
    let remainder = lexer.remainder().as_bytes();
    let len = memchr::memchr(b'\n', remainder).unwrap_or(remainder.len());
    lexer.bump(len);
}

/// Logos callback for `/* ... */` block comments, including consecutive asterisks before `/`.
pub(crate) fn lex_block_comment(lexer: &mut logos::Lexer<'_, SyntaxKind>) -> Result<(), LexError> {
    let remainder = lexer.remainder().as_bytes();
    let mut pos = 0;
    while let Some(offset) = memchr::memchr(b'*', &remainder[pos..]) {
        let star = pos + offset;
        if remainder.get(star + 1) == Some(&b'/') {
            lexer.bump(star + 2);
            return Ok(());
        }
        pos = star + 1;
    }

    lexer.bump(remainder.len());
    Err(LexError::UnterminatedBlockComment)
}

/// Logos callback for zero-allocation SIMD JSON string validation.
#[expect(
    clippy::cast_possible_truncation,
    reason = "Lexer::new asserts source length fits in u32"
)]
#[inline]
pub(crate) fn lex_string(lexer: &mut logos::Lexer<'_, SyntaxKind>) -> Result<(), LexError> {
    let start = lexer.span().start as u32;
    match string::validate(lexer.remainder()) {
        Ok((consumed, has_escapes)) => {
            lexer.bump(consumed);
            lexer.extras = has_escapes;
            Ok(())
        }
        Err(err) => {
            lexer.bump(err.consumed);
            lexer.extras = false;
            Err(LexError::String {
                error: err.kind,
                range: TextRange::empty(TextSize::new(start + 1 + err.offset as u32)),
            })
        }
    }
}

/// Logos callback that validates JSON numbers via [`Number::parse`].
#[expect(
    clippy::cast_possible_truncation,
    reason = "Lexer::new asserts source length fits in u32"
)]
#[inline]
pub(crate) fn lex_number(lexer: &mut logos::Lexer<'_, SyntaxKind>) -> Result<(), LexError> {
    let start = lexer.span().start;
    let slice = &lexer.source().as_bytes()[start..];
    match Number::parse(slice) {
        Ok(number) => {
            // The leading `[0-9-]` byte was already consumed by the regex.
            lexer.bump(number.as_str().len() - 1);
            Ok(())
        }
        Err(mut error) => {
            error.range += TextSize::new(start as u32);
            // Consume the malformed number run so recovery does not re-fail on its tail.
            let extra = slice[1..]
                .iter()
                .take_while(|byte| matches!(byte, b'0'..=b'9' | b'.' | b'e' | b'E' | b'+' | b'-'))
                .count();
            lexer.bump(extra);
            Err(LexError::Number(error))
        }
    }
}

/// Logos callback for unrecognized bare words so they emit one invalid token.
pub(crate) const fn lex_invalid_word(_: &mut logos::Lexer<'_, SyntaxKind>) -> Result<(), LexError> {
    Err(LexError::UnrecognizedCharacter)
}

/// Streaming, cloneable lexer wrapping [`logos::Lexer`] over [`SyntaxKind`].
#[derive(Clone)]
pub(crate) struct Lexer<'source> {
    inner: logos::Lexer<'source, SyntaxKind>,
}

impl<'source> Lexer<'source> {
    /// Creates a lexer positioned at the start of `source`.
    ///
    /// # Panics
    ///
    /// Panics if `source.len()` exceeds `u32::MAX` bytes.
    #[must_use]
    pub(crate) fn new(source: &'source str) -> Self {
        assert!(
            u32::try_from(source.len()).is_ok(),
            "source is larger than 4GiB"
        );
        Self {
            inner: logos::Lexer::new(source),
        }
    }

    /// Returns the end byte offset of the underlying source string.
    #[inline]
    #[expect(
        clippy::cast_possible_truncation,
        reason = "constructor asserts source length fits in u32"
    )]
    pub(crate) fn eof_offset(&self) -> TextSize {
        TextSize::new(self.inner.source().len() as u32)
    }

    /// Returns the slice covered by `range` in the underlying source string.
    #[inline]
    #[expect(
        clippy::string_slice,
        reason = "token ranges produced by logos on &str begin and end on UTF-8 boundaries"
    )]
    pub(crate) fn slice(&self, range: TextRange) -> &'source str {
        &self.inner.source()[usize::from(range.start())..usize::from(range.end())]
    }

    /// Scans the next token (including trivia tokens) and advances the lexer past it.
    #[inline]
    #[expect(
        clippy::cast_possible_truncation,
        reason = "constructor asserts source length fits in u32"
    )]
    pub(crate) fn next_token(&mut self) -> Option<ScannedToken> {
        let result = self.inner.next()?;
        let span = self.inner.span();
        let range = TextRange::new(
            TextSize::new(span.start as u32),
            TextSize::new(span.end as u32),
        );

        match result {
            Ok(kind) => Some(ScannedToken {
                kind,
                range,
                has_escapes: kind == SyntaxKind::String && self.inner.extras,
                error: None,
            }),
            Err(error) => {
                let kind = match error {
                    LexError::String { .. } => SyntaxKind::String,
                    LexError::UnterminatedBlockComment => SyntaxKind::BlockComment,
                    LexError::Number(_) | LexError::UnrecognizedCharacter => {
                        SyntaxKind::InvalidToken
                    }
                };
                Some(ScannedToken {
                    kind,
                    range,
                    has_escapes: false,
                    error: Some(error),
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use text_size::{TextRange, TextSize};

    use super::{LexError, Lexer, ScannedToken, number::ParseNumberErrorKind, string::StringError};
    use crate::syntax_kind::SyntaxKind;

    fn lex_all(source: &str) -> Vec<ScannedToken> {
        let mut lexer = Lexer::new(source);
        let mut tokens = Vec::new();
        while let Some(token) = lexer.next_token() {
            tokens.push(token);
        }
        tokens
    }

    fn lex_significant(source: &str) -> Vec<ScannedToken> {
        lex_all(source)
            .into_iter()
            .filter(|token| !token.kind.is_trivia())
            .collect()
    }

    #[test]
    fn lossless_round_trip_with_comments_and_whitespace() {
        let source =
            "// lead\n  { /* block **/\n\"#literal\": 42, /* * * * */ \"x\": 3.14 } // tail";
        let tokens = lex_all(source);
        let lexer = Lexer::new(source);
        let reconstructed: String = tokens
            .iter()
            .map(|token| lexer.slice(token.range))
            .collect();
        assert_eq!(reconstructed, source);
        assert!(tokens.iter().all(|token| token.error.is_none()));
    }

    #[test]
    fn block_comment_almost_closing_asterisks() {
        let tokens = lex_all("/* Almost closing comment **/42");
        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0].kind, SyntaxKind::BlockComment);
        assert_eq!(tokens[0].range, TextRange::new(0.into(), 29.into()));
        assert!(tokens[0].error.is_none());
        assert_eq!(tokens[1].kind, SyntaxKind::Number);
        assert_eq!(tokens[1].range, TextRange::new(29.into(), 31.into()));
    }

    #[test]
    fn unclosed_block_comments() {
        for source in ["/* This comment never ends", "/*/"] {
            let tokens = lex_all(source);
            assert_eq!(tokens.len(), 1);
            assert_eq!(tokens[0].kind, SyntaxKind::BlockComment);
            assert_eq!(tokens[0].error, Some(LexError::UnterminatedBlockComment));
        }
    }

    #[test]
    fn numbers_emit_single_syntax_kind() {
        let tokens = lex_significant("0 -42 3.14 1e10 1.5e-3");
        let kinds: Vec<_> = tokens.into_iter().map(|token| token.kind).collect();
        assert_eq!(kinds, [SyntaxKind::Number; 5]);
    }

    #[test]
    fn string_error_recovery_preserves_following_tokens() {
        let source = r#"{"a": "bad\zstring", "b": 42}"#;
        let tokens = lex_significant(source);
        assert_eq!(tokens.len(), 9);
        assert_eq!(tokens[3].kind, SyntaxKind::String);
        assert_matches!(
            tokens[3].error,
            Some(LexError::String {
                error: StringError::Escape(_),
                ..
            })
        );
        assert_eq!(tokens[7].kind, SyntaxKind::Number);
        assert!(tokens[7].error.is_none());
    }

    #[test]
    fn invalid_number_consumes_run() {
        let tokens = lex_significant(r#"{"number": 42.}"#);
        assert_eq!(tokens.len(), 5);
        assert_eq!(tokens[3].kind, SyntaxKind::InvalidToken);
        assert_eq!(
            tokens[3].error,
            Some(LexError::Number(super::ParseNumberError {
                kind: ParseNumberErrorKind::ExpectedDigit,
                range: TextRange::empty(TextSize::new(14)),
            }))
        );
        assert_eq!(tokens[4].kind, SyntaxKind::RBrace);
    }

    #[test]
    fn keyword_boundary_rejects_identifier_suffix() {
        let tokens = lex_significant("true truex false null");
        assert_eq!(tokens[0].kind, SyntaxKind::True);
        assert_eq!(tokens[1].kind, SyntaxKind::InvalidToken);
        assert_eq!(tokens[1].error, Some(LexError::UnrecognizedCharacter));
        assert_eq!(tokens[2].kind, SyntaxKind::False);
        assert_eq!(tokens[3].kind, SyntaxKind::Null);
    }

    #[test]
    fn unrecognized_multibyte_utf8_preserves_char_boundaries() {
        let source = "\u{1f980}\u{3053}\u{3093}\u{306b}\u{3061}\u{306f}";
        let tokens = lex_all(source);
        let lexer = Lexer::new(source);
        let reconstructed: String = tokens
            .iter()
            .map(|token| lexer.slice(token.range))
            .collect();
        assert_eq!(reconstructed, source);
        assert!(
            tokens
                .iter()
                .all(|token| token.error == Some(LexError::UnrecognizedCharacter))
        );
    }
}
