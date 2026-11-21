use alloc::{borrow::Cow, string::String};
use core::{
    ascii, mem,
    simd::{
        Select as _,
        cmp::{SimdPartialEq as _, SimdPartialOrd as _},
        num::SimdUint as _,
        u8x4, u8x16, u16x4,
    },
};
use std::bstr::ByteStr;

mod error;
#[cfg(test)]
mod tests;

pub(crate) use self::error::ValidatedStringError;
pub use self::error::{EscapeError, StringError};
use self::error::{compute_error_span, recover_to_closing_quote};

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
    // UTF-8 multi-byte codepoints never contain ASCII bytes. Scanning 16-byte SIMD chunks for
    // ASCII delimiters stays valid across vector boundaries.
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

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum SegmentLocation {
    AfterEscape,
    BeforeEscape,
}

#[inline]
fn next_segment<'source>(source: &mut &'source [u8], location: SegmentLocation) -> &'source [u8] {
    let length = if location == SegmentLocation::AfterEscape {
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

const ASCII_CHARS: [ascii::Char; ascii::Char::MAX as usize + 1] = {
    let mut table = [ascii::Char::MIN; ascii::Char::MAX as usize + 1];
    let mut index = 0_u8;

    loop {
        table[index as usize] = ascii::Char::from_u8(index).expect("index is within ASCII range");
        if index == ascii::Char::MAX as u8 {
            break;
        }
        index += 1;
    }

    table
};

trait Sink<'source> {
    type Output;

    fn push_segment(&mut self, bytes: &'source ByteStr) -> Result<(), StringError>;
    fn push_char(&mut self, character: char);
    fn finish(&mut self) -> Self::Output;
}

struct DecodeSink<'source>(Cow<'source, str>);

impl DecodeSink<'_> {
    const fn new() -> Self {
        Self(Cow::Borrowed(""))
    }
}

impl<'source> Sink<'source> for DecodeSink<'source> {
    type Output = Cow<'source, str>;

    fn push_segment(&mut self, bytes: &'source ByteStr) -> Result<(), StringError> {
        if bytes.is_empty() {
            return Ok(());
        }

        let segment: &str = bytes.try_into()?;
        match &mut self.0 {
            Cow::Borrowed(str @ "") => *str = segment,
            Cow::Owned(owned) => owned.push_str(segment),
            Cow::Borrowed(borrowed) => {
                let mut owned = String::with_capacity(borrowed.len() + segment.len());
                owned.push_str(borrowed);
                owned.push_str(segment);
                self.0 = Cow::Owned(owned);
            }
        }
        Ok(())
    }

    fn push_char(&mut self, character: char) {
        match &mut self.0 {
            Cow::Borrowed(str @ "") => {
                if let Some(ascii) = character.as_ascii() {
                    *str = ASCII_CHARS[ascii as usize].as_str();
                } else {
                    let mut owned = String::with_capacity(character.len_utf8());
                    owned.push(character);
                    self.0 = Cow::Owned(owned);
                }
            }
            Cow::Owned(owned) => owned.push(character),
            Cow::Borrowed(borrowed) => {
                let mut owned = String::with_capacity(borrowed.len() + character.len_utf8());
                owned.push_str(borrowed);
                owned.push(character);
                self.0 = Cow::Owned(owned);
            }
        }
    }

    fn finish(&mut self) -> Self::Output {
        mem::take(&mut self.0)
    }
}

#[derive(Debug, Copy, Clone, Default)]
struct ValidationSink {
    has_escapes: bool,
}

impl Sink<'_> for ValidationSink {
    type Output = bool;

    fn push_segment(&mut self, _bytes: &ByteStr) -> Result<(), StringError> {
        Ok(())
    }

    fn push_char(&mut self, _character: char) {
        self.has_escapes = true;
    }

    fn finish(&mut self) -> Self::Output {
        mem::take(&mut self.has_escapes)
    }
}

#[inline]
fn scan<'source, S>(sink: &mut S, source: &mut &'source [u8]) -> Result<S::Output, StringError>
where
    S: Sink<'source>,
{
    let prefix = next_segment(source, SegmentLocation::BeforeEscape);
    match source.first() {
        Some(b'"') => {
            sink.push_segment(ByteStr::new(prefix))?;
            *source = &source[1..];
            return Ok(sink.finish());
        }
        Some(b'\\') => {}
        Some(_) => {
            sink.push_segment(ByteStr::new(prefix))?;
            *source = &source[1..];
            return Err(StringError::Control);
        }
        None => {
            sink.push_segment(ByteStr::new(prefix))?;
            return Err(StringError::Eof);
        }
    }

    sink.push_segment(ByteStr::new(prefix))?;
    *source = &source[1..];

    loop {
        let escaped = escape(source).map_err(StringError::Escape)?;
        sink.push_char(escaped);

        let segment = next_segment(source, SegmentLocation::AfterEscape);
        sink.push_segment(ByteStr::new(segment))?;

        match source.split_off_first() {
            Some(b'"') => return Ok(sink.finish()),
            Some(b'\\') => {}
            Some(_) => return Err(StringError::Control),
            None => return Err(StringError::Eof),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct LexedStr<'source> {
    value: &'source str,
    has_escapes: bool,
}

impl<'source> LexedStr<'source> {
    /// Validates a UTF-8 JSON string body after its opening `"` without allocating.
    ///
    /// # Errors
    ///
    /// Returns [`ValidatedStringError`] for the first lexical failure with a UTF-8
    /// character-boundary span and `consumed` covering bytes through the recovery closing `"`
    /// (or EOF).
    #[inline]
    #[expect(
        clippy::string_slice,
        reason = "scan stops at ASCII `\"` and `compute_error_span` aligns error spans to UTF-8 \
                  character boundaries"
    )]
    pub(crate) fn new(source: &'source str) -> Result<Self, ValidatedStringError> {
        let mut rest = source.as_bytes();
        match scan(&mut ValidationSink::default(), &mut rest) {
            Ok(has_escapes) => Ok(Self {
                value: &source[..source.len() - rest.len()],
                has_escapes,
            }),
            Err(kind) => {
                let end = source.len() - rest.len();
                let span = compute_error_span(source, end, kind);
                let tail = recover_to_closing_quote(&source[span.end..]);
                let consumed = source.len() - tail.len();

                Err(ValidatedStringError {
                    kind,
                    span,
                    consumed,
                })
            }
        }
    }

    #[inline]
    pub(crate) const fn consumed(&self) -> usize {
        self.value.len()
    }

    #[inline]
    pub(crate) fn decode(&self) -> Cow<'source, str> {
        if !self.has_escapes {
            let body = self
                .value
                .strip_suffix('"')
                .expect("lexed string ends with a closing quote");
            return Cow::Borrowed(body);
        }

        scan(&mut DecodeSink::new(), &mut self.value.as_bytes())
            .expect("lexed string passed validation on construction")
    }
}

/// Decodes a quoted JSON string token (`"..."`), borrowing directly when no escapes appear.
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
    if bytes.get(len) == Some(&b'"') && len + 1 == bytes.len() {
        return Ok(Cow::Borrowed(&rest[..len]));
    }

    let decoded = scan(&mut DecodeSink::new(), &mut bytes)?;
    if bytes.is_empty() {
        Ok(decoded)
    } else {
        Err(StringError::Eof)
    }
}
