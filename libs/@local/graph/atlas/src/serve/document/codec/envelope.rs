use core::alloc::Allocator;

use error_stack::Report;
use zerocopy::{IntoBytes as _, LE, U16, U32};

use super::{Kind, WIRE_VERSION};

/// The 16-byte envelope prefix.
#[derive(zerocopy::IntoBytes, zerocopy::Immutable)]
#[repr(C)]
struct Prefix {
    kind: Kind,
    version: U16<LE>,
    flags: U16<LE>,
    slots: U16<LE>,
    reserved: U16<LE>,
}

/// A recorded slot's byte extent within the envelope directory.
#[derive(zerocopy::IntoBytes, zerocopy::Immutable)]
#[repr(C)]
struct Entry {
    start: U32<LE>,
    end: U32<LE>,
}

/// The prefix's encoded byte width.
const PREFIX: usize = size_of::<Prefix>();
/// One directory entry's encoded byte width.
const ENTRY: usize = size_of::<Entry>();
/// The completed binary envelope's media type.
const BINARY_CONTENT_TYPE: &str = "application/vnd.hash.saltile-v1";

/// Response metadata from a completed document writer.
#[derive(Debug)]
pub(crate) struct Envelope {
    content_type: &'static str,
}

impl Envelope {
    /// Returns the response's `Content-Type` value.
    pub(crate) const fn content_type(&self) -> &'static str {
        self.content_type
    }

    /// Replaces `bytes` with JSON and returns completion after serialization succeeds.
    ///
    /// # Errors
    ///
    /// Returns the serializer's error if `value` cannot be represented as JSON. The buffer may
    /// contain a partial document on failure.
    pub(crate) fn encode_json<A: Allocator>(
        value: &impl serde::Serialize,
        bytes: &mut Vec<u8, A>,
    ) -> Result<Self, Report<serde_json::Error>> {
        bytes.clear();
        serde_json::to_writer(bytes, value).map_err(Report::new)?;
        Ok(Self {
            content_type: "application/json",
        })
    }
}

/// A writer for one binary envelope.
///
/// The layout is a fixed-size directory of slot extents, followed by each slot's bytes in
/// declaration order.
#[derive(Debug)]
pub(crate) struct EnvelopeWriter<'bytes, A: Allocator> {
    bytes: &'bytes mut Vec<u8, A>,
    slots: u16,
    recorded: u16,
}

impl<'bytes, A: Allocator> EnvelopeWriter<'bytes, A> {
    /// Initializes the envelope prefix and its empty directory.
    ///
    /// This clears the buffer first. The prefix therefore begins at byte zero whatever the buffer
    /// held before, and every recorded extent is an offset into this envelope alone.
    pub(crate) fn new(kind: Kind, slots: u16, bytes: &'bytes mut Vec<u8, A>) -> Self {
        let prefix = Prefix {
            kind,
            version: U16::new(WIRE_VERSION),
            flags: U16::ZERO,
            slots: U16::new(slots),
            reserved: U16::ZERO,
        };

        bytes.clear();
        bytes.extend_from_slice(prefix.as_bytes());
        bytes.resize(PREFIX + ENTRY * slots as usize, 0);

        Self {
            bytes,
            slots,
            recorded: 0,
        }
    }

    /// Reserves `additional` bytes of spare capacity in the backing buffer.
    pub(crate) fn reserve(&mut self, additional: usize) {
        self.bytes.reserve(additional);
    }

    /// Runs `write` and records its output as the next directory slot.
    ///
    /// The writer pads the slot's bytes to an 8-byte boundary.
    ///
    /// # Panics
    ///
    /// Panics if every declared slot is already recorded, if `write` leaves the buffer shorter
    /// than it started, or, through [`record`](Self::record), if the slot's extent does not fit
    /// u32.
    pub(crate) fn slot(&mut self, write: impl FnOnce(&mut Vec<u8, A>)) {
        assert!(
            self.recorded < self.slots,
            "the envelope declares {} slots, all recorded",
            self.slots,
        );

        let start = self.bytes.len();
        write(self.bytes);
        let end = self.bytes.len();
        assert!(end >= start, "a slot writer must only append");

        self.bytes.resize(end.next_multiple_of(8), 0);

        self.record(start, end);
    }

    /// Records the next slot as empty, without writing any bytes.
    ///
    /// # Panics
    ///
    /// Panics if every declared slot is already recorded, or on the first slot: slot 0 (`HEAD`)
    /// must always be present.
    pub(crate) fn skip(&mut self) {
        assert!(
            self.recorded < self.slots,
            "the envelope declares {} slots, all recorded",
            self.slots,
        );
        assert!(self.recorded > 0, "slot 0 (HEAD) is always present");

        self.recorded += 1;
    }

    /// Completes the envelope as the binary media type, once every declared slot is recorded.
    ///
    /// # Panics
    ///
    /// Panics unless every declared slot has been recorded through [`slot`](Self::slot) or
    /// [`skip`](Self::skip).
    pub(crate) fn finish(self) -> Envelope {
        assert_eq!(
            self.recorded, self.slots,
            "the envelope declares {} slots",
            self.slots,
        );
        Envelope {
            content_type: BINARY_CONTENT_TYPE,
        }
    }

    /// Appends a trailer through `write`, then completes the envelope.
    ///
    /// The trailer follows the last recorded slot, and the envelope reports the binary media
    /// type.
    ///
    /// # Panics
    ///
    /// Panics unless every declared slot has been recorded through [`slot`](Self::slot) or
    /// [`skip`](Self::skip).
    pub(crate) fn finish_with_trailer(self, write: impl FnOnce(&mut Vec<u8, A>)) -> Envelope {
        assert_eq!(
            self.recorded, self.slots,
            "the envelope declares {} slots",
            self.slots,
        );

        write(self.bytes);
        Envelope {
            content_type: BINARY_CONTENT_TYPE,
        }
    }

    /// Backfills the directory entry for the most recently written slot.
    ///
    /// # Panics
    ///
    /// Panics where `start` or `end` exceeds [`u32::MAX`]. The directory stores both as u32, and
    /// an envelope whose slots reach 4 GiB therefore refuses to complete rather than recording a
    /// wrapped offset a decoder would follow into the wrong bytes.
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

#[cfg(test)]
mod tests {
    use alloc::alloc::Global;

    use serde::{
        Serialize, Serializer,
        ser::{Error as _, SerializeSeq as _},
    };

    use super::{Envelope, EnvelopeWriter};
    use crate::serve::document::codec::{Kind, WIRE_VERSION};

    #[test]
    fn binary_content_type() {
        let expected = format!("application/vnd.hash.saltile-v{WIRE_VERSION}");
        for kind in [Kind::TILE, Kind::EDGES, Kind::LOCATE] {
            for trailer in [false, true] {
                let mut bytes = Vec::new();
                let mut writer = EnvelopeWriter::new(kind, 1, &mut bytes);
                writer.slot(|bytes| bytes.push(0xA0));
                let envelope = if trailer {
                    writer.finish_with_trailer(|bytes| bytes.push(0xA0))
                } else {
                    writer.finish()
                };
                assert_eq!(
                    envelope.content_type(),
                    expected,
                    "both finalizers should report the binary envelope version for every kind",
                );
            }
        }
    }

    /// Writing into a buffer that already holds unrelated bytes clears them.
    ///
    /// The prefix therefore begins at byte zero. The writer records each slot's write extent - a
    /// written slot, an empty slot, a skipped slot and a fourth written slot - at its own
    /// directory offset, and writes each slot's bytes at the extent recorded for it. The trailer
    /// follows the fourth slot's padding, and no directory entry records it.
    #[expect(
        clippy::little_endian_bytes,
        reason = "the test decodes the envelope directory"
    )]
    #[test]
    fn buffer_reuse() {
        let mut bytes = Vec::new_in(&Global);
        bytes.resize(128, 0xDD);
        let mut writer = EnvelopeWriter::new(Kind::EDGES, 4, &mut bytes);
        writer.slot(|bytes| bytes.push(0xA0));
        writer.slot(|_| {});
        writer.skip();
        writer.slot(|bytes| bytes.extend_from_slice(&[1, 2, 3]));
        let _completed = writer.finish_with_trailer(|bytes| bytes.push(0xF6));

        assert_eq!(&bytes[..16], b"SALTILEE\x01\x00\x00\x00\x04\x00\x00\x00");
        for (slot, expected) in [(48, 49), (56, 56), (0, 0), (56, 59)]
            .into_iter()
            .enumerate()
        {
            let at = 16 + slot * 8;
            let start = u32::from_le_bytes(
                bytes[at..at + 4]
                    .try_into()
                    .expect("should contain a start offset"),
            );
            let end = u32::from_le_bytes(
                bytes[at + 4..at + 8]
                    .try_into()
                    .expect("should contain an end offset"),
            );
            assert_eq!(
                (start, end),
                expected,
                "directory slot {slot} should retain its extent"
            );
        }
        assert_eq!(
            &bytes[48..],
            &[0xA0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0, 0, 0, 0xF6]
        );
    }

    /// Encoding a JSON value replaces a buffer's unrelated bytes with the value alone.
    ///
    /// The resulting envelope reports the `application/json` content type.
    #[test]
    fn json_buffer_reuse() {
        let mut bytes = Vec::new_in(&Global);
        bytes.extend_from_slice(b"previous document");
        let envelope =
            Envelope::encode_json(&serde_json::json!({"nodes": {}, "edges": {}}), &mut bytes)
                .expect("should complete JSON serialization");
        assert_eq!(
            envelope.content_type(),
            "application/json",
            "should report the media type of the completed JSON document",
        );
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&bytes)
                .expect("should parse one complete document"),
            serde_json::json!({"nodes": {}, "edges": {}}),
        );
    }

    /// A value whose [`Serialize`] impl writes one sequence element and then fails.
    ///
    /// It asserts that a mid-serialization error leaves its partial output in the buffer.
    struct PartialValue;

    impl Serialize for PartialValue {
        fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
            let mut sequence = serializer.serialize_seq(Some(2))?;
            sequence.serialize_element(&1)?;
            Err(S::Error::custom("incomplete sequence"))
        }
    }

    /// Encoding a value that fails partway returns the serializer's error.
    ///
    /// The buffer holds exactly the bytes written before the failure, neither cleared nor
    /// completed.
    #[test]
    fn json_partial_value() {
        let mut bytes = Vec::from(b"previous document".as_slice());
        let error = Envelope::encode_json(&PartialValue, &mut bytes)
            .expect_err("should return a serialization error rather than completion");
        assert_eq!(error.current_context().to_string(), "incomplete sequence");
        assert_eq!(
            bytes, b"[1",
            "should retain the serializer's partial output"
        );
    }

    /// Finishing a writer without filling every declared slot panics.
    ///
    /// The panic message names the declared slot count.
    #[test]
    #[should_panic(expected = "the envelope declares 4 slots")]
    fn finish_incomplete() {
        let mut bytes = Vec::new();
        let writer = EnvelopeWriter::new(Kind::EDGES, 4, &mut bytes);
        let _completed = writer.finish();
    }

    /// Finishing with a trailer, without filling every other declared slot, panics.
    ///
    /// The panic message names the declared slot count. This is the same guard
    /// [`finish_incomplete`] exercises without a trailer.
    #[test]
    #[should_panic(expected = "the envelope declares 4 slots")]
    fn trailer_incomplete() {
        let mut bytes = Vec::new();
        let writer = EnvelopeWriter::new(Kind::EDGES, 4, &mut bytes);
        let _completed = writer.finish_with_trailer(|bytes| bytes.push(0xA0));
    }

    /// Skipping slot 0 (the always-present HEAD slot) panics rather than silently omitting it.
    #[test]
    #[should_panic(expected = "slot 0 (HEAD) is always present")]
    fn head_absent() {
        let mut bytes = Vec::new();
        let mut writer = EnvelopeWriter::new(Kind::EDGES, 4, &mut bytes);
        writer.skip();
    }
}
