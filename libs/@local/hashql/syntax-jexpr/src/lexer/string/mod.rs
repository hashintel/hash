use alloc::borrow::Cow;
use core::{
    fmt,
    simd::{
        Select as _,
        cmp::{SimdPartialEq as _, SimdPartialOrd as _},
        num::SimdUint as _,
        u8x4, u8x16, u16x4,
    },
    str::Utf8Error,
};

#[cfg(test)]
mod tests;

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

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ValidatedStringError {
    pub kind: StringError,
    /// UTF-8 character-boundary offset from the byte immediately after the opening `"`.
    pub offset: usize,
    /// Bytes consumed after the opening `"` through the recovery closing `"` or EOF.
    pub consumed: usize,
}

#[cold]
fn hex_error(source: &mut &[u8]) -> EscapeError {
    if let Some(index) = source.iter().position(|byte| !byte.is_ascii_hexdigit()) {
        let byte = source[index];
        *source = &source[index + 1..];
        EscapeError::HexDigit(byte)
    } else {
        *source = &[];
        EscapeError::Eof
    }
}

fn hex_quad(source: &mut &[u8]) -> Result<u16, EscapeError> {
    // SIMD here works because we assume that the bytes that we have in the register are correct, we
    // then validate that assumption before we actually emit the result.
    let Some((&chunk, tail)) = source.split_first_chunk::<4>() else {
        return Err(hex_error(source));
    };

    let bytes = u8x4::from_array(chunk);
    let decimal = bytes - u8x4::splat(b'0');

    // Setting bit `0x20` maps `A..=F` to `a..=f` and leaves lowercase hex digits unchanged.
    let letter = (bytes | u8x4::splat(0x20)) - u8x4::splat(b'a');

    let is_decimal = decimal.simd_lt(u8x4::splat(10));
    let is_letter = letter.simd_lt(u8x4::splat(6));

    let valid = is_decimal | is_letter;
    if !valid.all() {
        return Err(hex_error(source));
    }

    let digits = is_decimal.select(decimal, letter + u8x4::splat(10));
    let weighted = digits.cast::<u16>() * u16x4::from_array([0x1000, 0x100, 0x10, 1]);

    *source = tail;
    Ok(weighted.reduce_sum())
}

const SIMPLE_ESCAPES: [u8; 256] = {
    let mut table = [0; 256];
    table[b'"' as usize] = b'"';
    table[b'\\' as usize] = b'\\';
    table[b'/' as usize] = b'/';
    table[b'b' as usize] = b'\x08';
    table[b'f' as usize] = b'\x0c';
    table[b'n' as usize] = b'\n';
    table[b'r' as usize] = b'\r';
    table[b't' as usize] = b'\t';
    table
};

fn unicode_escape(source: &mut &[u8]) -> Result<char, EscapeError> {
    let first = hex_quad(source)?;
    if !(0xD800..=0xDBFF).contains(&first) {
        return char::from_u32(u32::from(first)).ok_or(EscapeError::Surrogate(first));
    }

    let [b'\\', b'u', tail @ ..] = source else {
        return Err(EscapeError::ExpectedLowSurrogate);
    };
    *source = tail;

    let second = hex_quad(source)?;
    if !(0xDC00..=0xDFFF).contains(&second) {
        return Err(EscapeError::ExpectedLowSurrogate);
    }

    let scalar = 0x10000 + (u32::from(first - 0xD800) << 10) + u32::from(second - 0xDC00);
    Ok(char::from_u32(scalar).expect("paired surrogates encode a Unicode scalar"))
}

#[inline]
fn escape(source: &mut &[u8]) -> Result<char, EscapeError> {
    let &byte = source.split_off_first().ok_or(EscapeError::Eof)?;

    match SIMPLE_ESCAPES[usize::from(byte)] {
        0 if byte == b'u' => unicode_escape(source),
        0 => Err(EscapeError::Kind(byte)),
        ascii => Ok(char::from(ascii)),
    }
}

fn run_length(source: &[u8]) -> usize {
    // Check for how long we can run before hitting an ASCII delimiter, because UTF-8 codepoints are
    // designed in a way where multi-byte codepoints cannot use ASCII bytes, this is safe, even if
    // we end up crossing a vector boundary.
    let mut rest = source;

    while let Some((&chunk, tail)) = rest.split_first_chunk::<16>() {
        let bytes = u8x16::from_array(chunk);

        let is_control = bytes.simd_lt(u8x16::splat(0x20));
        let is_quote = bytes.simd_eq(u8x16::splat(b'"'));
        let is_escape = bytes.simd_eq(u8x16::splat(b'\\'));

        let stop = is_control | is_quote | is_escape;

        if let Some(lane) = stop.first_set() {
            return source.len() - rest.len() + lane;
        }

        rest = tail;
    }

    let tail = rest
        .iter()
        .position(|byte| matches!(byte, 0..=0x1F | b'"' | b'\\'))
        .unwrap_or(rest.len());

    source.len() - rest.len() + tail
}

#[inline]
fn next_segment<'source>(source: &mut &'source [u8], after_escape: bool) -> &'source [u8] {
    let length = if after_escape {
        // Escapes often cluster (such as `\r\n`). A short scalar scan finds the next delimiter
        // without setting up a SIMD search.
        let lookahead = &source[..source.len().min(9)];
        lookahead
            .iter()
            .position(|byte| matches!(byte, 0..=0x1F | b'"' | b'\\'))
            .unwrap_or_else(|| run_length(source))
    } else {
        run_length(source)
    };
    let (head, tail) = source.split_at(length);
    *source = tail;
    head
}

#[inline]
fn bytes_to_str(bytes: &[u8]) -> Result<&str, StringError> {
    bytes.as_ascii().map_or_else(
        || str::from_utf8(bytes).map_err(StringError::Utf8),
        |ascii| Ok(ascii.as_str()),
    )
}

trait StringSink<'source>: Sized {
    type Output;

    fn on_prefix(prefix: &'source [u8]) -> Result<Self::Output, StringError>;
    fn begin_escaped(prefix: &'source [u8]) -> Result<Self, StringError>;
    fn push_char(&mut self, character: char);
    fn push_segment(&mut self, bytes: &'source [u8]) -> Result<(), StringError>;
    fn finish(self) -> Self::Output;
}

struct DecodeSink(String);

impl<'source> StringSink<'source> for DecodeSink {
    type Output = Cow<'source, str>;

    #[inline]
    fn on_prefix(prefix: &'source [u8]) -> Result<Self::Output, StringError> {
        bytes_to_str(prefix).map(Cow::Borrowed)
    }

    #[inline]
    fn begin_escaped(prefix: &'source [u8]) -> Result<Self, StringError> {
        bytes_to_str(prefix).map(|text| Self(String::from(text)))
    }

    #[inline]
    fn push_char(&mut self, character: char) {
        self.0.push(character);
    }

    #[inline]
    fn push_segment(&mut self, bytes: &'source [u8]) -> Result<(), StringError> {
        self.0.push_str(bytes_to_str(bytes)?);
        Ok(())
    }

    #[inline]
    fn finish(self) -> Self::Output {
        Cow::Owned(self.0)
    }
}

struct ValidateSink;

impl<'source> StringSink<'source> for ValidateSink {
    type Output = bool;

    #[inline]
    fn on_prefix(_prefix: &'source [u8]) -> Result<Self::Output, StringError> {
        Ok(false)
    }

    #[inline]
    fn begin_escaped(_prefix: &'source [u8]) -> Result<Self, StringError> {
        Ok(Self)
    }

    #[inline]
    fn push_char(&mut self, _character: char) {}

    #[inline]
    fn push_segment(&mut self, _bytes: &'source [u8]) -> Result<(), StringError> {
        Ok(())
    }

    #[inline]
    fn finish(self) -> Self::Output {
        true
    }
}

#[inline]
fn scan<'source, S: StringSink<'source>>(
    source: &mut &'source [u8],
) -> Result<S::Output, StringError> {
    let prefix = next_segment(source, false);
    match source.first() {
        Some(b'"') => {
            let output = S::on_prefix(prefix)?;
            *source = &source[1..];
            return Ok(output);
        }
        Some(b'\\') => {}
        Some(_) => {
            let _: S::Output = S::on_prefix(prefix)?;
            *source = &source[1..];
            return Err(StringError::Control);
        }
        None => {
            let _: S::Output = S::on_prefix(prefix)?;
            return Err(StringError::Eof);
        }
    }

    let mut sink = S::begin_escaped(prefix)?;
    *source = &source[1..];

    loop {
        let escaped = escape(source).map_err(StringError::Escape)?;
        sink.push_char(escaped);

        let segment = next_segment(source, true);
        sink.push_segment(segment)?;

        match source.split_off_first() {
            Some(b'"') => return Ok(sink.finish()),
            Some(b'\\') => {}
            Some(_) => return Err(StringError::Control),
            None => return Err(StringError::Eof),
        }
    }
}

#[cold]
#[expect(
    clippy::string_slice,
    reason = "memchr2 matches ASCII `\"` or `\\`, so offsets +1 and +2 on ASCII pairs are UTF-8 \
              boundaries"
)]
fn recover_to_closing_quote(mut rest: &str) -> &str {
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

/// Validates a UTF-8 JSON string body after its opening `"` without allocating.
///
/// Returns `(consumed, has_escapes)` on success, where `consumed` is the byte count through the
/// closing `"`.
///
/// # Errors
///
/// Returns [`ValidatedStringError`] for the first lexical failure at a UTF-8 character boundary,
/// with `consumed` covering bytes through the recovery closing `"` (or EOF).
#[inline]
#[expect(
    clippy::string_slice,
    reason = "error offsets are aligned via `str::ceil_char_boundary`"
)]
pub(crate) fn validate(source: &str) -> Result<(usize, bool), ValidatedStringError> {
    let mut rest = source.as_bytes();
    match scan::<ValidateSink>(&mut rest) {
        Ok(has_escapes) => Ok((source.len() - rest.len(), has_escapes)),
        Err(kind) => {
            let offset = source.ceil_char_boundary(source.len() - rest.len());
            let tail = recover_to_closing_quote(&source[offset..]);
            let consumed = source.len() - tail.len();
            Err(ValidatedStringError {
                kind,
                offset,
                consumed,
            })
        }
    }
}

/// Decodes the bytes after an opening quote, leaving the cursor just past the closing quote.
///
/// # Errors
///
/// Returns [`StringError`] if the string contains an unescaped control character, invalid escape
/// sequence, invalid UTF-8, or reaches end of input without a closing `"`.
#[inline]
pub(crate) fn decode<'source>(
    source: &mut &'source [u8],
) -> Result<Cow<'source, str>, StringError> {
    scan::<DecodeSink>(source)
}

/// Decodes a quoted JSON string token (`"..."`), borrowing directly when no escapes are present.
///
/// # Errors
///
/// Returns [`StringError`] if `quoted` is not a valid JSON string literal.
#[inline]
#[expect(
    clippy::string_slice,
    reason = "run_length stops at ASCII closing quote, which is always a UTF-8 boundary"
)]
pub(crate) fn decode_quoted(quoted: &str) -> Result<Cow<'_, str>, StringError> {
    let Some(rest) = quoted.strip_prefix('"') else {
        return Err(StringError::Eof);
    };

    let mut bytes = rest.as_bytes();
    let len = run_length(bytes);
    if bytes.get(len) == Some(&b'"') {
        return Ok(Cow::Borrowed(&rest[..len]));
    }

    decode(&mut bytes)
}
