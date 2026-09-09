#![expect(
    clippy::big_endian_bytes,
    reason = "CBOR arguments are network byte order (RFC 8949 section 3)"
)]

#[cfg(test)]
mod tests;

use core::{
    alloc::Allocator,
    fmt::{self, Display},
};

struct TextWriter<'bytes, A: Allocator>(&'bytes mut Vec<u8, A>);

impl<A: Allocator> fmt::Write for TextWriter<'_, A> {
    fn write_str(&mut self, s: &str) -> fmt::Result {
        self.0.extend_from_slice(s.as_bytes());
        Ok(())
    }
}

/// Definite-length CBOR with shortest integers and source-width floats.
#[derive(Debug)]
pub(crate) struct CborWriter<'bytes, A: Allocator> {
    bytes: &'bytes mut Vec<u8, A>,
}

impl<'bytes, A: Allocator> CborWriter<'bytes, A> {
    /// The head of a single-precision float.
    const HEAD_F32: u8 = 0xFA;
    /// The head of a double-precision float.
    const HEAD_F64: u8 = 0xFB;
    /// Major type 4: array.
    const MAJOR_ARRAY: u8 = 4;
    /// Major type 2: byte string.
    const MAJOR_BYTES: u8 = 2;
    /// Major type 5: map.
    const MAJOR_MAP: u8 = 5;
    /// Major type 1: negative integer.
    const MAJOR_NEGATIVE: u8 = 1;
    /// Major type 3: text string.
    const MAJOR_TEXT: u8 = 3;
    /// Major type 0: unsigned integer.
    const MAJOR_UINT: u8 = 0;
    /// The simple value `false`.
    const SIMPLE_FALSE: u8 = 0xF4;
    /// The simple value `null`.
    const SIMPLE_NULL: u8 = 0xF6;
    /// The simple value `true`.
    const SIMPLE_TRUE: u8 = 0xF5;

    /// Opens a writer appending to `bytes`.
    #[must_use]
    pub(crate) const fn over(bytes: &'bytes mut Vec<u8, A>) -> Self {
        Self { bytes }
    }

    /// Emits an unsigned integer.
    pub(crate) fn uint(&mut self, value: u64) {
        self.head(Self::MAJOR_UINT, value);
    }

    /// Emits a signed integer.
    ///
    /// Major type 0 for non-negative values, major type 1 otherwise, shortest form either way.
    pub(crate) fn int(&mut self, value: i64) {
        match u64::try_from(value) {
            Ok(value) => self.head(Self::MAJOR_UINT, value),
            // Major type 1 carries -1 - n; the negation cannot
            // overflow because value is strictly negative.
            Err(_) => self.head(Self::MAJOR_NEGATIVE, !(value.cast_unsigned())),
        }
    }

    /// Emits a boolean.
    pub(crate) fn boolean(&mut self, value: bool) {
        self.bytes.push(if value {
            Self::SIMPLE_TRUE
        } else {
            Self::SIMPLE_FALSE
        });
    }

    /// Emits `null`.
    pub(crate) fn null(&mut self) {
        self.bytes.push(Self::SIMPLE_NULL);
    }

    /// Emits a float at single precision, including exactly representable small values.
    pub(crate) fn f32(&mut self, value: f32) {
        self.bytes.push(Self::HEAD_F32);
        self.bytes.extend_from_slice(&value.to_be_bytes());
    }

    /// Emits a float at double precision, including exactly representable small values.
    pub(crate) fn f64(&mut self, value: f64) {
        self.bytes.push(Self::HEAD_F64);
        self.bytes.extend_from_slice(&value.to_be_bytes());
    }

    /// Emits a byte string.
    pub(crate) fn bytes(&mut self, value: &[u8]) {
        self.head(Self::MAJOR_BYTES, value.len() as u64);
        self.bytes.extend_from_slice(value);
    }

    /// Emits a text string.
    pub(crate) fn text(&mut self, value: &str) {
        self.head(Self::MAJOR_TEXT, value.len() as u64);
        self.bytes.extend_from_slice(value.as_bytes());
    }

    /// Formats `value` as one definite-length text string.
    ///
    /// The display implementation runs once. Existing buffer contents remain unchanged.
    ///
    /// # Panics
    ///
    /// This panics if [`Display::fmt`] returns an error.
    pub(crate) fn collect_text(&mut self, value: impl Display) {
        let start = self.bytes.len();
        fmt::write(&mut TextWriter(self.bytes), format_args!("{value}"))
            .expect("formatting into a byte buffer should succeed");
        let end = self.bytes.len();

        self.head(Self::MAJOR_TEXT, (end - start) as u64);
        let header = self.bytes.len() - end;
        self.bytes[start..].rotate_right(header);
    }

    /// Emits an array head that the caller follows with `length` items.
    pub(crate) fn array(&mut self, length: u64) {
        self.head(Self::MAJOR_ARRAY, length);
    }

    /// Emits a map head before `length` key-value pairs in ascending key order.
    pub(crate) fn map(&mut self, length: u64) {
        self.head(Self::MAJOR_MAP, length);
    }

    /// Emits one head in shortest form.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "each arm's range check proves the narrowing lossless"
    )]
    fn head(&mut self, major: u8, argument: u64) {
        let ty = major << 5;
        match argument {
            // Additional information 0..24: the argument is inline.
            0..0x18 => self.bytes.push(ty | argument as u8),
            // 24 through 27: one, two, four, or eight argument bytes.
            0x18..=0xFF => self.bytes.extend_from_slice(&[ty | 0x18, argument as u8]),
            0x100..=0xFFFF => {
                self.bytes.push(ty | 0x19);
                self.bytes
                    .extend_from_slice(&(argument as u16).to_be_bytes());
            }
            0x1_0000..=0xFFFF_FFFF => {
                self.bytes.push(ty | 0x1A);
                self.bytes
                    .extend_from_slice(&(argument as u32).to_be_bytes());
            }
            _ => {
                self.bytes.push(ty | 0x1B);
                self.bytes.extend_from_slice(&argument.to_be_bytes());
            }
        }
    }
}
