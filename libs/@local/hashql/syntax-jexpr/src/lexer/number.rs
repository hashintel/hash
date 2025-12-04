use core::{fmt, num::NonZero};

use hifijson::{Read, num::Lex as _, token::Lex as _};
use text_size::{TextRange, TextSize};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum ParseNumberErrorKind {
    Eof,
    ExpectedDigit,
    UnexpectedDigit(u8),
}

impl fmt::Display for ParseNumberErrorKind {
    fn fmt(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Eof => fmt.write_str("unexpected end of input"),
            Self::ExpectedDigit => fmt.write_str("expected digit"),
            Self::UnexpectedDigit(digit) => write!(fmt, "unexpected digit '{}'", *digit as char),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ParseNumberError {
    pub kind: ParseNumberErrorKind,
    pub range: TextRange,
}

impl ParseNumberError {
    const fn eof() -> Self {
        Self {
            kind: ParseNumberErrorKind::Eof,
            range: TextRange::empty(TextSize::new(0)),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(super) struct Parts {
    dot: Option<NonZero<usize>>,
    exp: Option<NonZero<usize>>,
}

impl From<hifijson::num::Parts> for Parts {
    fn from(hifijson::num::Parts { dot, exp }: hifijson::num::Parts) -> Self {
        Self { dot, exp }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct Number<'source> {
    value: &'source [u8],
    parts: Parts,
}

impl<'source> Number<'source> {
    #[expect(unsafe_code)]
    pub(super) const unsafe fn from_parts_unchecked(value: &'source [u8], parts: Parts) -> Self {
        debug_assert!(
            core::str::from_utf8(value).is_ok(),
            "Invalid UTF-8 Sequence"
        );

        Self { value, parts }
    }

    pub(crate) const fn has_dot(&self) -> bool {
        self.parts.dot.is_some()
    }

    pub(crate) const fn has_exponent(&self) -> bool {
        self.parts.exp.is_some()
    }

    #[expect(unsafe_code)]
    pub(crate) const fn as_str(&self) -> &'source str {
        // SAFETY: The value is verified to be valid UTF-8
        unsafe { core::str::from_utf8_unchecked(self.value) }
    }

    pub(crate) fn parse(value: &'source [u8]) -> (u32, Result<Self, ParseNumberError>) {
        if value.is_empty() {
            return (0, Err(ParseNumberError::eof()));
        }

        let mut lexer = hifijson::SliceLexer::new(value);

        let mut consumed = 0;
        if value[0] == b'-' {
            consumed += 1;
            lexer.discarded();
        }

        let result = lexer
            .num_foreach(|_| {
                consumed += 1;
            })
            .map_err(|error| ParseNumberError {
                kind: match error {
                    hifijson::num::Error::ExpectedDigit => ParseNumberErrorKind::ExpectedDigit,
                },
                range: TextRange::empty(TextSize::new(consumed)),
            })
            .and_then(|parts| {
                // We must verify that what follows isn't a digit, as that would indicate an invalid
                // number
                if let Some(digit @ b'0'..=b'9') = lexer.peek_next() {
                    Err(ParseNumberError {
                        kind: ParseNumberErrorKind::UnexpectedDigit(digit),
                        range: TextRange::empty(TextSize::new(consumed + 1)),
                    })
                } else {
                    Ok(parts)
                }
            })
            .map(
                #[expect(unsafe_code)]
                |parts| {
                    // SAFETY: hifijson verified the value is valid UTF-8
                    unsafe { Self::from_parts_unchecked(value, parts.into()) }
                },
            );

        (consumed, result)
    }
}

impl fmt::Display for Number<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(self.as_str())
    }
}
