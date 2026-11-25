use alloc::{borrow::Cow, string::String};
use core::{
    ascii,
    byte_str::ByteStr,
    mem,
    simd::{
        Select as _,
        cmp::{SimdPartialEq as _, SimdPartialOrd as _},
        num::SimdUint as _,
        u8x4, u8x16, u16x4,
    },
};

mod error;
mod offsets;
#[cfg(test)]
mod tests;

use self::error::{compute_error_span, recover_to_closing_quote};
pub(crate) use self::{
    error::{EscapeError, StringError, StringSyntaxError, ValidatedStringError},
    offsets::RawOffsets,
};

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
        0 if byte == b'u' => {
            let mut rest = *source;
            let result = unicode_escape(&mut rest);
            *source = rest;
            result
        }
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
    type Error;

    fn push_segment(&mut self, bytes: &'source ByteStr) -> Result<(), Self::Error>;
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
    type Error = StringError;
    type Output = Cow<'source, str>;

    fn push_segment(&mut self, bytes: &'source ByteStr) -> Result<(), Self::Error> {
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) enum StringEscapes {
    #[default]
    Verbatim,
    Escaped,
}

impl StringEscapes {
    /// Decodes a validated string body including its closing `"` after the opening `"`.
    ///
    /// # Panics
    ///
    /// Panics if `body` is not a valid JSON string body ending in `"`.
    #[expect(
        clippy::string_slice,
        reason = "validated string bodies always end with an ASCII closing quote"
    )]
    #[inline]
    pub(crate) fn decode(self, body: &str) -> Cow<'_, str> {
        match self {
            Self::Verbatim => Cow::Borrowed(&body[..body.len() - 1]),
            Self::Escaped => scan(DecodeSink::new(), &mut body.as_bytes())
                .expect("validated string passed validation on construction"),
        }
    }
}

#[derive(Debug, Copy, Clone, Default)]
struct ValidationSink {
    escapes: StringEscapes,
}

impl Sink<'_> for ValidationSink {
    type Error = StringSyntaxError;
    type Output = StringEscapes;

    fn push_segment(&mut self, _bytes: &ByteStr) -> Result<(), Self::Error> {
        Ok(())
    }

    fn push_char(&mut self, _character: char) {
        self.escapes = StringEscapes::Escaped;
    }

    fn finish(&mut self) -> Self::Output {
        self.escapes
    }
}

#[inline(never)]
fn scan_escaped<'source, S>(
    mut sink: S,
    mut source: &'source [u8],
) -> (Result<S::Output, S::Error>, &'source [u8])
where
    S: Sink<'source>,
    S::Error: From<StringSyntaxError>,
{
    loop {
        let escaped = match escape(&mut source) {
            Ok(character) => character,
            Err(error) => return (Err(StringSyntaxError::Escape(error).into()), source),
        };
        sink.push_char(escaped);

        let segment = next_segment(&mut source, SegmentLocation::AfterEscape);
        if let Err(error) = sink.push_segment(ByteStr::new(segment)) {
            return (Err(error), source);
        }

        match source.split_off_first() {
            Some(b'"') => return (Ok(sink.finish()), source),
            Some(b'\\') => {}
            Some(_) => return (Err(StringSyntaxError::Control.into()), source),
            None => return (Err(StringSyntaxError::Eof.into()), source),
        }
    }
}

#[inline]
fn scan<'source, S>(mut sink: S, source: &mut &'source [u8]) -> Result<S::Output, S::Error>
where
    S: Sink<'source>,
    S::Error: From<StringSyntaxError>,
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
            return Err(StringSyntaxError::Control.into());
        }
        None => {
            sink.push_segment(ByteStr::new(prefix))?;
            return Err(StringSyntaxError::Eof.into());
        }
    }

    sink.push_segment(ByteStr::new(prefix))?;
    let (result, tail) = scan_escaped(sink, &source[1..]);
    *source = tail;
    result
}

#[expect(
    clippy::string_slice,
    reason = "compute_error_span aligns error spans to UTF-8 character boundaries"
)]
#[cold]
#[inline(never)]
fn validated_error(source: &str, rest_len: usize, kind: StringSyntaxError) -> ValidatedStringError {
    let end = source.len() - rest_len;
    let span = compute_error_span(source, end, kind);
    let tail = recover_to_closing_quote(&source[span.end..]);
    let consumed = source.len() - tail.len();

    ValidatedStringError {
        kind,
        span,
        consumed,
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct LexedStr {
    consumed: usize,
    escapes: StringEscapes,
}

impl LexedStr {
    /// Validates a UTF-8 JSON string body after its opening `"` without allocating.
    ///
    /// # Errors
    ///
    /// Returns [`ValidatedStringError`] for the first lexical failure with a UTF-8
    /// character-boundary span and `consumed` covering bytes through the recovery closing `"`
    /// (or EOF).
    #[inline]
    pub(crate) fn new(source: &str) -> Result<Self, ValidatedStringError> {
        let mut rest = source.as_bytes();
        match scan(ValidationSink::default(), &mut rest) {
            Ok(escapes) => Ok(Self {
                consumed: source.len() - rest.len(),
                escapes,
            }),
            Err(kind) => Err(validated_error(source, rest.len(), kind)),
        }
    }

    #[inline]
    pub(crate) const fn consumed(self) -> usize {
        self.consumed
    }

    #[inline]
    pub(crate) const fn escapes(self) -> StringEscapes {
        self.escapes
    }
}

/// Decodes a quoted JSON string token (`"..."`), borrowing directly when no escapes appear.
///
/// # Errors
///
/// Returns [`StringError`] if `quoted` is not a valid JSON string literal.
#[expect(
    clippy::string_slice,
    reason = "run_length stops at ASCII closing quote, which is always a UTF-8 boundary"
)]
#[inline]
pub(crate) fn decode_quoted(quoted: &str) -> Result<Cow<'_, str>, StringError> {
    let Some(rest) = quoted.strip_prefix('"') else {
        return Err(StringError::Eof);
    };

    let mut bytes = rest.as_bytes();
    let len = run_length(bytes);
    if bytes.get(len) == Some(&b'"') && len + 1 == bytes.len() {
        return Ok(Cow::Borrowed(&rest[..len]));
    }

    let decoded = scan(DecodeSink::new(), &mut bytes)?;
    if bytes.is_empty() {
        Ok(decoded)
    } else {
        Err(StringError::Eof)
    }
}
