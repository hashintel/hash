//! The deterministic CBOR emitter.
//!
//! RFC 8949 section 4.2.1 deterministic encoding, restricted further
//! by the wire contract: definite lengths only, integer map keys, no
//! tags, no indefinite items, floats always IEEE 754 single. The
//! writer emits exactly this subset and nothing else - negative
//! integers, wider floats, and tags have no emitter because no wire
//! value needs them, which is the profile's proof surface staying
//! minimal.
//!
//! Two profile laws live with the caller, checked by the goldens
//! rather than writer state: map keys are emitted in ascending numeric
//! order (single-byte encodings below 24 make numeric order the
//! required bytewise order), and a declared map or array length is
//! followed by exactly that many items. Every emission site in this
//! module's consumers writes its keys as literals in ascending source
//! order.
//!
//! Heads follow RFC 8949's shortest form: the argument rides inline
//! below 24 and in the narrowest of 1, 2, 4, or 8 big-endian bytes
//! otherwise. CBOR arguments are network byte order - the one
//! big-endian region of a little-endian wire.
#![expect(
    clippy::big_endian_bytes,
    reason = "CBOR arguments are network byte order (RFC 8949 section 3)"
)]

/// An emitter over one growing byte buffer.
#[derive(Debug, Default)]
pub(crate) struct CborWriter {
    bytes: Vec<u8>,
}

impl CborWriter {
    /// The head of a single-precision float.
    const HEAD_F32: u8 = 0xFA;
    /// Major type 4: array.
    const MAJOR_ARRAY: u8 = 4;
    /// Major type 2: byte string.
    const MAJOR_BYTES: u8 = 2;
    /// Major type 5: map.
    const MAJOR_MAP: u8 = 5;
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

    /// Creates an empty writer.
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self { bytes: Vec::new() }
    }

    /// Returns the encoded bytes.
    #[must_use]
    pub(crate) fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }

    /// Emits an unsigned integer.
    pub(crate) fn uint(&mut self, value: u64) {
        self.head(Self::MAJOR_UINT, value);
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
    /// The profile pins every float to IEEE 754 single: the wire's
    /// floats originate as `f32`, and the deterministic-core shortest
    /// float form is deliberately NOT applied - width is fixed, not
    /// value-dependent.
    pub(crate) fn f32(&mut self, value: f32) {
        self.bytes.push(Self::HEAD_F32);
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

    /// Emits an array head; the caller emits `length` items after it.
    pub(crate) fn array(&mut self, length: u64) {
        self.head(Self::MAJOR_ARRAY, length);
    }

    /// Emits a map head; the caller emits `length` key-value pairs
    /// after it, keys ascending.
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
