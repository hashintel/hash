//! The envelope writer: prefix, offset directory, padded payloads.
//!
//! One response is a 16-byte prefix (magic with kind byte, wire version, zero flags, slot count,
//! zero reserved), a directory of `slotCount` absolute `(start, end)` byte offsets, the payloads
//! sequential in slot order and zero-padded to 8, and an optional self-delimiting CBOR trailer
//! after the last padded payload. All envelope integers are little-endian; the prefix and every
//! directory entry are `#[repr(C)]` layouts with [`zerocopy`] byteorder-typed fields, so the
//! wire's endianness is part of the type.
//!
//! The directory is the locating mechanism: `(0, 0)` marks an absent slot, `start == end` at a
//! nonzero offset marks a present-but-empty payload, and every present `start` is 8-aligned by
//! construction (the payload region begins at the 8-aligned `16 + 8 * slotCount` and each payload
//! pads to the next 8 boundary). Emitting the right mark carries request semantics - a zero-point
//! tile's columns are present-empty while an unrequested section is absent - so
//! [`slot`](EnvelopeWriter::slot) and [`absent`](EnvelopeWriter::absent) are distinct calls that
//! keep that distinction explicit at every call site.
//!
//! The writer owns the one buffer a response is assembled in: a slot's payload is written
//! directly into it through the closure handed to [`slot`](EnvelopeWriter::slot), and the
//! directory entry is backfilled as the closure returns, so every payload reaches the response
//! by exactly one write.
//!
//! Offsets are `u32`: directory-addressed payloads end below 4 GiB, the format's
//! representability boundary. The writer enforces it with checked conversions - a payload
//! crossing it is a producer panic (caught and answered as a 500), never a truncated or
//! wrapped offset. The trailer sits outside the directory and shares no such ceiling.

use zerocopy::{IntoBytes as _, LE, U16, U32};

use super::{Kind, WIRE_VERSION};

/// Prefix size in bytes, pinned to the layout it measures.
const PREFIX: usize = size_of::<Prefix>();
/// Directory entry size in bytes, pinned to the layout it measures.
const ENTRY: usize = size_of::<Entry>();

/// Rounds `length` up to the next multiple of 8.
const fn align8(length: usize) -> usize {
    length.next_multiple_of(8)
}

/// The 16-byte envelope prefix.
#[derive(zerocopy::IntoBytes, zerocopy::Immutable)]
#[repr(C)]
struct Prefix {
    /// The seven-byte family magic and the kind byte.
    kind: Kind,
    /// The wire version shared by the whole family.
    version: U16<LE>,
    /// Reserved zero.
    flags: U16<LE>,
    /// The directory's entry count.
    slots: U16<LE>,
    /// Reserved zero.
    reserved: U16<LE>,
}

/// One directory entry: absolute byte offsets, `end` exclusive and unpadded.
#[derive(zerocopy::IntoBytes, zerocopy::Immutable)]
#[repr(C)]
struct Entry {
    /// The payload's first byte, 8-aligned when present.
    start: U32<LE>,
    /// One past the payload's last byte.
    end: U32<LE>,
}

/// A single-buffer writer assembling one response.
///
/// Slots are recorded strictly in slot order, one call per slot; the payload is written directly
/// into the envelope's buffer and the directory entry is backfilled into the reserved region as
/// each slot closes, so the buffer is complete the moment the last slot is recorded.
/// [`finish`](Self::finish) checks the slot count and returns the bytes;
/// [`finish_with_trailer`](Self::finish_with_trailer) writes the trailer tail first.
#[derive(Debug)]
pub(crate) struct EnvelopeWriter {
    bytes: Vec<u8>,
    slots: u16,
    recorded: u16,
}

impl EnvelopeWriter {
    /// Opens an envelope of `kind` with `slots` directory entries.
    ///
    /// `slots` is at least the kind's v1 table size at every call site; appended slots beyond the
    /// table are legal by the evolution rule.
    #[must_use]
    pub(crate) fn new(kind: Kind, slots: u16) -> Self {
        let prefix = Prefix {
            kind,
            version: U16::new(WIRE_VERSION),
            flags: U16::ZERO,
            slots: U16::new(slots),
            reserved: U16::ZERO,
        };

        let mut bytes = Vec::new();
        bytes.extend_from_slice(prefix.as_bytes());
        bytes.resize(PREFIX + ENTRY * slots as usize, 0);

        Self {
            bytes,
            slots,
            recorded: 0,
        }
    }

    /// Reserves room for `additional` payload bytes beyond the buffer's current length.
    ///
    /// An allocation hint only; the buffer grows as needed regardless.
    pub(crate) fn reserve(&mut self, additional: usize) {
        self.bytes.reserve(additional);
    }

    /// Records the next slot as present, writing its payload directly into the buffer.
    ///
    /// The closure appends the payload bytes; the slot's extent is whatever it appended.
    /// Zero-padded to the next 8 boundary after the closure returns.
    ///
    /// # Panics
    ///
    /// Panics when every declared slot is already recorded, and when the closure shrinks the
    /// buffer.
    pub(crate) fn slot(&mut self, write: impl FnOnce(&mut Vec<u8>)) {
        assert!(
            self.recorded < self.slots,
            "the envelope declares {} slots, all recorded",
            self.slots,
        );

        let start = self.bytes.len();
        write(&mut self.bytes);
        let end = self.bytes.len();
        assert!(end >= start, "a slot writer must only append");

        self.bytes.resize(align8(end), 0);

        self.record(start, end);
    }

    /// Records the next slot as absent: directory `(0, 0)`, no bytes.
    ///
    /// # Panics
    ///
    /// Panics when every declared slot is already recorded, and on slot 0 - the `HEAD` is always
    /// present.
    pub(crate) fn absent(&mut self) {
        assert!(
            self.recorded < self.slots,
            "the envelope declares {} slots, all recorded",
            self.slots,
        );
        assert!(self.recorded > 0, "slot 0 (HEAD) is always present");

        self.recorded += 1;
    }

    /// Closes the envelope and returns the response bytes.
    ///
    /// # Panics
    ///
    /// Panics when fewer slots were recorded than declared.
    #[must_use]
    pub(crate) fn finish(self) -> Vec<u8> {
        assert_eq!(
            self.recorded, self.slots,
            "the envelope declares {} slots",
            self.slots,
        );

        self.bytes
    }

    /// Closes the envelope, writing the CBOR trailer tail into the buffer first.
    ///
    /// The trailer starts at the 8-aligned end of the last present payload - where the buffer
    /// already stands - and is never padded: its extent is its own CBOR structure.
    ///
    /// # Panics
    ///
    /// Panics when fewer slots were recorded than declared.
    #[must_use]
    pub(crate) fn finish_with_trailer(mut self, write: impl FnOnce(&mut Vec<u8>)) -> Vec<u8> {
        assert_eq!(
            self.recorded, self.slots,
            "the envelope declares {} slots",
            self.slots,
        );

        write(&mut self.bytes);
        self.bytes
    }

    /// Backfills the directory entry for the slot just written.
    fn record(&mut self, start: usize, end: usize) {
        let entry = Entry {
            start: U32::new(
                u32::try_from(start).expect("directory offsets fit u32: payloads end below 4 GiB"),
            ),
            end: U32::new(
                u32::try_from(end).expect("directory offsets fit u32: payloads end below 4 GiB"),
            ),
        };

        let at = PREFIX + ENTRY * self.recorded as usize;
        self.bytes[at..at + ENTRY].copy_from_slice(zerocopy::IntoBytes::as_bytes(&entry));
        self.recorded += 1;
    }
}
