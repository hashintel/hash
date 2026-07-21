//! The envelope writer: prefix, offset directory, padded payloads.
//!
//! One response is a 16-byte prefix (magic with kind byte, wire version, zero flags, slot count,
//! zero reserved), a directory of `slotCount` absolute `(start, end)` byte offsets, the payloads
//! sequential in slot order and zero-padded to 8, and an optional self-delimiting CBOR trailer
//! after the last padded payload. All envelope integers are little-endian.
//!
//! The directory is the locating mechanism: `(0, 0)` marks an absent slot, `start == end` at a
//! nonzero offset marks a present-but-empty payload, and every present `start` is 8-aligned by
//! construction (the payload region begins at the 8-aligned `16 + 8 * slotCount` and each payload
//! pads to the next 8 boundary). Emitting the right mark carries request semantics - a zero-point
//! tile's columns are present-empty while an unrequested section is absent - so
//! [`present`](EnvelopeWriter::present) and [`absent`](EnvelopeWriter::absent) are distinct calls,
//! never an `Option` collapsed to emptiness.
//!
//! Offsets are `u32`: responses are bounded below 4 GiB by the capacity caps, and a response that
//! could exceed that is a wire version bump recorded in advance - the writer enforces the bound as
//! the producer contract it is.
#![expect(
    clippy::little_endian_bytes,
    reason = "envelope integers are pinned little-endian by the wire contract"
)]

use super::{Kind, WIRE_VERSION};

/// Prefix size in bytes: magic, wire version, flags, slot count, reserved.
const PREFIX: usize = 16;
/// Directory entry size in bytes: start and end `u32`.
const ENTRY: usize = 8;

/// Rounds `length` up to the next multiple of 8.
const fn align8(length: usize) -> usize {
    (length + 7) & !7
}

/// A single-buffer writer assembling one response.
///
/// Slots are recorded strictly in slot order, one call per slot; the directory entry is backfilled
/// into the reserved region as each payload lands, so the buffer is complete the moment the last
/// slot is recorded. [`finish`](Self::finish) checks the slot count and returns the bytes;
/// [`finish_with_trailer`](Self::finish_with_trailer) appends the trailer tail first.
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
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&kind.magic());
        bytes.extend_from_slice(&WIRE_VERSION.to_le_bytes());
        bytes.extend_from_slice(&0_u16.to_le_bytes());
        bytes.extend_from_slice(&slots.to_le_bytes());
        bytes.extend_from_slice(&0_u16.to_le_bytes());
        bytes.resize(PREFIX + ENTRY * slots as usize, 0);

        Self {
            bytes,
            slots,
            recorded: 0,
        }
    }

    /// Records the next slot as present and appends its payload, zero-padded to the next 8
    /// boundary.
    ///
    /// # Panics
    ///
    /// Panics when every declared slot is already recorded.
    pub(crate) fn present(&mut self, payload: &[u8]) {
        assert!(
            self.recorded < self.slots,
            "the envelope declares {} slots, all recorded",
            self.slots,
        );

        let start = self.bytes.len();
        self.bytes.extend_from_slice(payload);
        let end = self.bytes.len();
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

    /// Closes the envelope with a CBOR trailer tail.
    ///
    /// The trailer starts at the 8-aligned end of the last present payload - where the buffer
    /// already stands - and is never padded: its extent is its own CBOR structure.
    ///
    /// # Panics
    ///
    /// Panics when fewer slots were recorded than declared.
    #[must_use]
    pub(crate) fn finish_with_trailer(mut self, trailer: &[u8]) -> Vec<u8> {
        assert_eq!(
            self.recorded, self.slots,
            "the envelope declares {} slots",
            self.slots,
        );

        self.bytes.extend_from_slice(trailer);
        self.bytes
    }

    /// Backfills the directory entry for the slot just appended.
    fn record(&mut self, start: usize, end: usize) {
        let start = u32::try_from(start).expect("responses stay below 4 GiB by the capacity caps");
        let end = u32::try_from(end).expect("responses stay below 4 GiB by the capacity caps");

        let entry = PREFIX + ENTRY * self.recorded as usize;
        self.bytes[entry..entry + 4].copy_from_slice(&start.to_le_bytes());
        self.bytes[entry + 4..entry + 8].copy_from_slice(&end.to_le_bytes());
        self.recorded += 1;
    }
}
