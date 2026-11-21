use alloc::borrow::Cow;

use text_size::{TextRange, TextSize};

use crate::syntax_kind::SyntaxKind;

pub(crate) mod number;
pub(crate) mod string;

pub(crate) use self::{
    number::{Number, ParseNumberError, ParseNumberErrorKind},
    string::{LexedStr, StringError, decode_quoted},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub enum LexError {
    String {
        error: StringError,
        range: TextRange,
    },
    SingleQuotedString,
    Number(ParseNumberError),
    InvalidWord,
    UnterminatedBlockComment,
    #[default]
    UnrecognizedCharacter,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum ScannedPayload<'source> {
    None,
    String(LexedStr<'source>),
    Error(LexError),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ScannedToken<'source> {
    pub kind: SyntaxKind,
    pub range: TextRange,
    payload: ScannedPayload<'source>,
}

impl<'source> ScannedToken<'source> {
    #[inline]
    pub(crate) fn decode_string(self) -> Option<Cow<'source, str>> {
        match self.payload {
            ScannedPayload::String(string) => Some(string.decode()),
            ScannedPayload::None | ScannedPayload::Error(_) => None,
        }
    }

    #[inline]
    pub(crate) const fn error(self) -> Option<LexError> {
        match self.payload {
            ScannedPayload::Error(error) => Some(error),
            ScannedPayload::None | ScannedPayload::String(_) => None,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, logos::Logos)]
#[logos(error = LexError)]
enum LexToken<'source> {
    #[token("\"", lex_string)]
    String(LexedStr<'source>),
    #[regex(r"[0-9-]|\.[0-9]|\+[0-9]", lex_number)]
    Number,
    #[token("true")]
    True,
    #[token("false")]
    False,
    #[token("null")]
    Null,
    #[token(",")]
    Comma,
    #[token(":")]
    Colon,
    #[token("{")]
    LBrace,
    #[token("}")]
    RBrace,
    #[token("[")]
    LBracket,
    #[token("]")]
    RBracket,
    #[regex(r"[ \t\r\n\f]+")]
    Whitespace,
    #[token("//", lex_line_comment)]
    LineComment,
    #[token("/*", lex_block_comment)]
    BlockComment,
    #[regex(r"[A-Za-z_][A-Za-z0-9_]*", lex_invalid_word)]
    #[token("'", lex_single_quoted_string)]
    InvalidToken,
}

impl<'source> LexToken<'source> {
    #[inline]
    const fn into_parts(self) -> (SyntaxKind, ScannedPayload<'source>) {
        match self {
            Self::String(string) => (SyntaxKind::String, ScannedPayload::String(string)),
            Self::Number => (SyntaxKind::Number, ScannedPayload::None),
            Self::True => (SyntaxKind::True, ScannedPayload::None),
            Self::False => (SyntaxKind::False, ScannedPayload::None),
            Self::Null => (SyntaxKind::Null, ScannedPayload::None),
            Self::Comma => (SyntaxKind::Comma, ScannedPayload::None),
            Self::Colon => (SyntaxKind::Colon, ScannedPayload::None),
            Self::LBrace => (SyntaxKind::LBrace, ScannedPayload::None),
            Self::RBrace => (SyntaxKind::RBrace, ScannedPayload::None),
            Self::LBracket => (SyntaxKind::LBracket, ScannedPayload::None),
            Self::RBracket => (SyntaxKind::RBracket, ScannedPayload::None),
            Self::Whitespace => (SyntaxKind::Whitespace, ScannedPayload::None),
            Self::LineComment => (SyntaxKind::LineComment, ScannedPayload::None),
            Self::BlockComment => (SyntaxKind::BlockComment, ScannedPayload::None),
            Self::InvalidToken => (SyntaxKind::InvalidToken, ScannedPayload::None),
        }
    }
}

fn lex_line_comment<'source>(lexer: &mut logos::Lexer<'source, LexToken<'source>>) {
    let remainder = lexer.remainder().as_bytes();
    let len = memchr::memchr(b'\n', remainder).unwrap_or(remainder.len());
    lexer.bump(len);
}

fn lex_block_comment<'source>(
    lexer: &mut logos::Lexer<'source, LexToken<'source>>,
) -> Result<(), LexError> {
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

#[expect(
    clippy::cast_possible_truncation,
    reason = "Lexer::new asserts source length fits in u32"
)]
#[inline]
fn lex_string<'source>(
    lexer: &mut logos::Lexer<'source, LexToken<'source>>,
) -> Result<LexedStr<'source>, LexError> {
    let start = lexer.span().start as u32;
    match LexedStr::new(lexer.remainder()) {
        Ok(string) => {
            lexer.bump(string.consumed());
            Ok(string)
        }
        Err(err) => {
            lexer.bump(err.consumed);
            Err(LexError::String {
                error: err.kind,
                range: TextRange::new(
                    TextSize::new(start + 1 + err.span.start as u32),
                    TextSize::new(start + 1 + err.span.end as u32),
                ),
            })
        }
    }
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "Lexer::new asserts source length fits in u32"
)]
#[inline]
fn lex_number<'source>(
    lexer: &mut logos::Lexer<'source, LexToken<'source>>,
) -> Result<(), LexError> {
    let start = lexer.span().start;
    let already_consumed = lexer.span().len();
    let slice = &lexer.source().as_bytes()[start..];
    match Number::parse(slice) {
        Ok(number) => {
            lexer.bump(number.as_str().len() - already_consumed);
            Ok(())
        }
        Err(mut error) => {
            error.range += TextSize::new(start as u32);
            // Consume the malformed number run so recovery does not re-fail on its tail.
            let extra = slice[already_consumed..]
                .iter()
                .take_while(|byte| matches!(byte, b'0'..=b'9' | b'.' | b'e' | b'E' | b'+' | b'-'))
                .count();
            lexer.bump(extra);
            Err(LexError::Number(error))
        }
    }
}

// Consumes an entire bare ASCII word as one invalid token instead of failing per character.
const fn lex_invalid_word<'source>(
    _: &mut logos::Lexer<'source, LexToken<'source>>,
) -> Result<(), LexError> {
    Err(LexError::InvalidWord)
}

// Consumes a single-line `'...'` string as one invalid token when a closing `'` exists on the same
// line. An unmatched `'` falls back to an unrecognized character so later tokens stay intact.
fn lex_single_quoted_string<'source>(
    lexer: &mut logos::Lexer<'source, LexToken<'source>>,
) -> Result<(), LexError> {
    let remainder = lexer.remainder().as_bytes();
    let mut index = 0;
    while index < remainder.len() {
        match remainder[index] {
            b'\'' => {
                lexer.bump(index + 1);
                return Err(LexError::SingleQuotedString);
            }
            b'\\' => {
                if index + 1 < remainder.len() && !matches!(remainder[index + 1], b'\n' | b'\r') {
                    index += 2;
                } else {
                    return Err(LexError::UnrecognizedCharacter);
                }
            }
            b'\n' | b'\r' => return Err(LexError::UnrecognizedCharacter),
            _ => index += 1,
        }
    }

    Err(LexError::UnrecognizedCharacter)
}

#[derive(Clone)]
pub(crate) struct Lexer<'source> {
    inner: logos::Lexer<'source, LexToken<'source>>,
}

impl<'source> Lexer<'source> {
    /// Creates a streaming lexer over `source`, requiring its byte length to fit in `u32`.
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

    #[expect(
        clippy::cast_possible_truncation,
        reason = "constructor asserts source length fits in u32"
    )]
    #[inline]
    pub(crate) fn eof_offset(&self) -> TextSize {
        TextSize::new(self.inner.source().len() as u32)
    }

    #[expect(
        clippy::string_slice,
        reason = "token ranges produced by logos on &str begin and end on UTF-8 boundaries"
    )]
    #[inline]
    pub(crate) fn slice(&self, range: TextRange) -> &'source str {
        &self.inner.source()[usize::from(range.start())..usize::from(range.end())]
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "constructor asserts source length fits in u32"
    )]
    #[inline]
    pub(crate) fn next_token(&mut self) -> Option<ScannedToken<'source>> {
        let result = self.inner.next()?;
        let span = self.inner.span();
        let range = TextRange::new(
            TextSize::new(span.start as u32),
            TextSize::new(span.end as u32),
        );

        match result {
            Ok(token) => {
                let (kind, payload) = token.into_parts();
                Some(ScannedToken {
                    kind,
                    range,
                    payload,
                })
            }
            Err(error) => {
                let kind = match error {
                    LexError::String { .. } => SyntaxKind::String,
                    LexError::UnterminatedBlockComment => SyntaxKind::BlockComment,
                    LexError::SingleQuotedString
                    | LexError::Number(_)
                    | LexError::InvalidWord
                    | LexError::UnrecognizedCharacter => SyntaxKind::InvalidToken,
                };
                Some(ScannedToken {
                    kind,
                    range,
                    payload: ScannedPayload::Error(error),
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

    fn lex_all(source: &str) -> Vec<ScannedToken<'_>> {
        let mut lexer = Lexer::new(source);
        let mut tokens = Vec::new();
        while let Some(token) = lexer.next_token() {
            tokens.push(token);
        }
        tokens
    }

    fn lex_significant(source: &str) -> Vec<ScannedToken<'_>> {
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
        assert!(tokens.iter().all(|token| token.error().is_none()));
    }

    #[test]
    fn block_comment_almost_closing_asterisks() {
        let tokens = lex_all("/* Almost closing comment **/42");
        assert_eq!(tokens.len(), 2);
        assert_eq!(tokens[0].kind, SyntaxKind::BlockComment);
        assert_eq!(tokens[0].range, TextRange::new(0.into(), 29.into()));
        assert!(tokens[0].error().is_none());
        assert_eq!(tokens[1].kind, SyntaxKind::Number);
        assert_eq!(tokens[1].range, TextRange::new(29.into(), 31.into()));
    }

    #[test]
    fn unclosed_block_comments() {
        for source in ["/* This comment never ends", "/*/"] {
            let tokens = lex_all(source);
            assert_eq!(tokens.len(), 1);
            assert_eq!(tokens[0].kind, SyntaxKind::BlockComment);
            assert_eq!(tokens[0].error(), Some(LexError::UnterminatedBlockComment));
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
            tokens[3].error(),
            Some(LexError::String {
                error: StringError::Escape(_),
                ..
            })
        );
        assert_eq!(tokens[7].kind, SyntaxKind::Number);
        assert!(tokens[7].error().is_none());
    }

    #[test]
    fn invalid_number_consumes_run() {
        let tokens = lex_significant(r#"{"number": 42.}"#);
        assert_eq!(tokens.len(), 5);
        assert_eq!(tokens[3].kind, SyntaxKind::InvalidToken);
        assert_eq!(
            tokens[3].error(),
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
        assert_eq!(tokens[1].error(), Some(LexError::InvalidWord));
        assert_eq!(tokens[2].kind, SyntaxKind::False);
        assert_eq!(tokens[3].kind, SyntaxKind::Null);
    }

    #[test]
    fn single_quoted_and_prefixed_numbers_lex_as_single_tokens() {
        let tokens = lex_significant("'hello' +42 .5 'unterminated");
        assert_eq!(tokens.len(), 5);
        assert_eq!(tokens[0].error(), Some(LexError::SingleQuotedString));
        assert_matches!(tokens[1].error(), Some(LexError::Number(_)));
        assert_matches!(tokens[2].error(), Some(LexError::Number(_)));
        assert_eq!(tokens[3].error(), Some(LexError::UnrecognizedCharacter));
        assert_eq!(tokens[4].error(), Some(LexError::InvalidWord));
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
                .all(|token| token.error() == Some(LexError::UnrecognizedCharacter))
        );
    }
}
