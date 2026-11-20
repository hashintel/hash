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

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum EscapeError {
    Kind(u8),
    HexDigit(u8),
    Surrogate(u16),
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
pub(crate) enum StringError {
    Control,
    Escape(EscapeError),
    Eof,
    Utf8(Utf8Error),
}

#[cold]
fn hex_error(source: &mut &[u8]) -> EscapeError {
    while let Some(&byte) = source.split_off_first() {
        if !byte.is_ascii_hexdigit() {
            return EscapeError::HexDigit(byte);
        }
    }

    EscapeError::Eof
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
    // We just ask here: _is there any escaping to be done here?_
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
fn segment<'source>(source: &mut &'source [u8]) -> Result<&'source str, StringError> {
    let (bytes, rest) = source.split_at(run_length(source));
    *source = rest;

    bytes.as_ascii().map_or_else(
        || str::from_utf8(bytes).map_err(StringError::Utf8),
        |ascii| Ok(ascii.as_str()),
    )
}

#[inline]
fn escaped_segment<'source>(source: &mut &'source [u8]) -> Result<&'source str, StringError> {
    // Escapes can cluster, as in `\r\n`. A short scalar scan can find the next delimiter without
    // setting up a SIMD search. If it misses, `segment` starts from the same cursor, so the
    // lookahead limits how many bytes we scan twice.
    for (length, &byte) in source.iter().take(9).enumerate() {
        match byte {
            0..=0x1F | b'"' | b'\\' => {
                let (run, tail) = source.split_at(length);
                *source = tail;

                return Ok(run.as_ascii().expect("matched ASCII bytes").as_str());
            }
            // A non-ASCII byte ends the fast path. Let `segment` validate the run as UTF-8.
            0x80..=0xFF => break,
            _ => {}
        }
    }

    segment(source)
}

/// Decodes the bytes after an opening quote, leaving the cursor just past the closing quote.
pub(super) fn decode<'source>(
    source: &mut &'source [u8],
) -> Result<Cow<'source, str>, StringError> {
    let prefix = segment(source)?;
    match source.split_off_first() {
        Some(b'"') => return Ok(Cow::Borrowed(prefix)),
        Some(b'\\') => {}
        Some(_) => return Err(StringError::Control),
        None => return Err(StringError::Eof),
    }

    let mut decoded = String::from(prefix);
    loop {
        let escaped = escape(source).map_err(StringError::Escape)?;
        decoded.push(escaped);

        // We have just hit an escaped character, we're likely to hit another one.
        decoded.push_str(escaped_segment(source)?);

        match source.split_off_first() {
            Some(b'"') => return Ok(Cow::Owned(decoded)),
            Some(b'\\') => {}
            Some(_) => return Err(StringError::Control),
            None => return Err(StringError::Eof),
        }
    }
}
