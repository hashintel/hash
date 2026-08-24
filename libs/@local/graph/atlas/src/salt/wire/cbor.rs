//! The deterministic CBOR emitter.
//!
//! The wire contract restricts RFC 8949 section 4.2.1 deterministic encoding further. It admits
//! definite lengths, integer map keys, and untagged items only. The originating type fixes each
//! float's width - geometry and `HEAD` values are IEEE 754 single, locate trailer property values
//! double (WIRE 6b, store scalars are doubles) - never the deterministic-core value-dependent
//! shortest form. The writer emits exactly this subset and nothing else - tags in particular have
//! no emitter, which is the profile's proof surface staying minimal.
//!
//! The caller upholds two profile laws, which the fixtures check rather than writer state. The
//! caller emits map keys in ascending numeric order (single-byte encodings below 24 make numeric
//! order the required bytewise order), and it follows a declared map or array length with exactly
//! that many items. Every emission site in this module's consumers writes its keys as literals in
//! ascending source order.
//!
//! Heads follow RFC 8949's shortest form: the argument rides inline below 24 and in the narrowest
//! of 1, 2, 4, or 8 big-endian bytes otherwise. CBOR arguments are network byte order - the one
//! big-endian region of a little-endian wire.
#![expect(
    clippy::big_endian_bytes,
    reason = "CBOR arguments are network byte order (RFC 8949 section 3)"
)]

/// An emitter appending to a borrowed byte buffer.
///
/// Every emission writes its bytes directly into the lent buffer, so encoding a value allocates
/// only when the buffer itself grows.
#[derive(Debug)]
pub(crate) struct CborWriter<'buf> {
    bytes: &'buf mut Vec<u8>,
}

impl<'buf> CborWriter<'buf> {
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
    pub(crate) const fn over(bytes: &'buf mut Vec<u8>) -> Self {
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

    /// Emits a single-precision float.
    ///
    /// Geometry and `HEAD` floats originate as `f32` and stay single on the wire. The emitter never
    /// applies the deterministic-core shortest float form, because the originating type fixes the
    /// width, not the value.
    pub(crate) fn f32(&mut self, value: f32) {
        self.bytes.push(Self::HEAD_F32);
        self.bytes.extend_from_slice(&value.to_be_bytes());
    }

    /// Emits a double-precision float.
    ///
    /// Locate trailer property values originate as store doubles and stay double on the wire (WIRE
    /// 6b), under the same fixed-width posture as [`CborWriter::f32`].
    pub(crate) fn f64(&mut self, value: f64) {
        self.bytes.push(Self::HEAD_F64);
        self.bytes.extend_from_slice(&value.to_be_bytes());
    }

    /// Emits a byte string.
    pub(crate) fn bytes(&mut self, value: &[u8]) {
        self.head(Self::MAJOR_BYTES, value.len() as u64);
        self.bytes.extend_from_slice(value);
    }

    /// Emits a zero-filled byte string of `length` bytes and returns its content slice.
    ///
    /// This appends the head and the zeroed content to the buffer immediately. The returned slice
    /// is the content region, ready for in-place writes.
    pub(crate) fn bytes_zeroed(&mut self, length: usize) -> &mut [u8] {
        self.head(Self::MAJOR_BYTES, length as u64);
        let start = self.bytes.len();
        self.bytes.resize(start + length, 0);

        &mut self.bytes[start..]
    }

    /// Emits a text string.
    pub(crate) fn text(&mut self, value: &str) {
        self.head(Self::MAJOR_TEXT, value.len() as u64);
        self.bytes.extend_from_slice(value.as_bytes());
    }

    /// Emits an array head that the caller follows with `length` items.
    pub(crate) fn array(&mut self, length: u64) {
        self.head(Self::MAJOR_ARRAY, length);
    }

    /// Emits a map head; the caller emits `length` key-value pairs after it, keys ascending.
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
