use core::{fmt, ops::Range, str::Utf8Error};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EscapeError {
    /// Unrecognized escape character following `\`.
    Kind(u8),
    /// Non-hexadecimal byte inside a `\uXXXX` escape.
    HexDigit(u8),
    /// Unpaired low UTF-16 surrogate code unit.
    Surrogate(u16),
    /// High UTF-16 surrogate not followed by a `\uXXXX` low surrogate.
    ExpectedLowSurrogate,
    Eof,
}

impl fmt::Display for EscapeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Kind(byte) => write!(fmt, "invalid escape character {}", char::from(byte)),
            Self::HexDigit(byte) => {
                write!(fmt, "invalid hexadecimal character {}", char::from(byte))
            }
            Self::Surrogate(unit) => write!(fmt, "invalid character with index {unit}"),
            Self::ExpectedLowSurrogate => fmt.write_str("expected low surrogate"),
            Self::Eof => fmt.write_str("unexpected end of file"),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum StringError {
    /// Unescaped ASCII control character (`0x00..=0x1F`).
    Control,
    Escape(EscapeError),
    Eof,
    Utf8(Utf8Error),
}

impl From<Utf8Error> for StringError {
    fn from(error: Utf8Error) -> Self {
        Self::Utf8(error)
    }
}

impl From<EscapeError> for StringError {
    fn from(error: EscapeError) -> Self {
        Self::Escape(error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ValidatedStringError {
    pub kind: StringError,
    /// UTF-8 character-boundary byte range of the offending slice after the opening `"`.
    pub span: Range<usize>,
    /// Bytes consumed after the opening `"` through the recovery closing `"` or EOF.
    pub consumed: usize,
}

#[cold]
#[expect(
    clippy::string_slice,
    reason = "memchr2 matches ASCII `\"` or `\\`, so offsets +1 and +2 on ASCII pairs are UTF-8 \
              boundaries"
)]
pub(super) fn recover_to_closing_quote(mut rest: &str) -> &str {
    while let Some(index) = memchr::memchr2(b'"', b'\\', rest.as_bytes()) {
        if rest.as_bytes()[index] == b'"' {
            return &rest[index + 1..];
        }

        // Skip `\"` or `\\` so escaped quotes do not terminate recovery early while staying on a
        // UTF-8 boundary when `\` precedes a multi-byte sequence.
        let step = if matches!(rest.as_bytes().get(index + 1), Some(b'"' | b'\\')) {
            index + 2
        } else {
            index + 1
        };
        rest = &rest[step..];
    }

    ""
}

#[cold]
pub(super) fn compute_error_span(source: &str, end: usize, kind: StringError) -> Range<usize> {
    let bytes = source.as_bytes();
    match kind {
        StringError::Control if end > 0 => (end - 1)..end,
        StringError::Escape(EscapeError::Kind(_)) if end >= 2 => {
            (end - 2)..source.ceil_char_boundary(end)
        }
        StringError::Escape(EscapeError::HexDigit(_)) if end >= 1 => {
            source.floor_char_boundary(end - 1)..source.ceil_char_boundary(end)
        }
        StringError::Escape(EscapeError::Surrogate(_) | EscapeError::ExpectedLowSurrogate)
            if end >= 6 =>
        {
            (end - 6)..end
        }
        StringError::Escape(EscapeError::Eof) => {
            let search_start = end.saturating_sub(6);
            let start = bytes[search_start..end]
                .iter()
                .rposition(|&byte| byte == b'\\')
                .map_or(end, |offset| search_start + offset);
            start..end
        }
        StringError::Eof => end..end,
        StringError::Control | StringError::Escape(_) | StringError::Utf8(_) => {
            let pos = source.ceil_char_boundary(end);
            pos..pos
        }
    }
}
