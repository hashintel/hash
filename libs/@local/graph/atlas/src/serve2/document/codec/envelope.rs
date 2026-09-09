use alloc::alloc::Allocator;

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
    kind: Kind,
    version: U16<LE>,
    flags: U16<LE>,
    slots: U16<LE>,
    reserved: U16<LE>,
}

#[derive(zerocopy::IntoBytes, zerocopy::Immutable)]
#[repr(C)]
struct Entry {
    start: U32<LE>,
    end: U32<LE>,
}

pub(crate) struct Envelope {
    _marker: (),
}

#[derive(Debug)]
pub(crate) struct EnvelopeWriter<'bytes, A: Allocator> {
    bytes: &'bytes mut Vec<u8, A>,
    slots: u16,
    recorded: u16,
}

impl<'bytes, A: Allocator> EnvelopeWriter<'bytes, A> {
    /// Opens an envelope of `kind` with `slots` directory entries.
    ///
    /// `slots` is at least the kind's v1 table size at every call site; appended slots beyond the
    /// table are legal by the evolution rule.
    pub(crate) fn new(kind: Kind, slots: u16, bytes: &'bytes mut Vec<u8, A>) -> Self {
        let prefix = Prefix {
            kind,
            version: U16::new(WIRE_VERSION),
            flags: U16::ZERO,
            slots: U16::new(slots),
            reserved: U16::ZERO,
        };

        bytes.extend_from_slice(prefix.as_bytes());
        bytes.resize(PREFIX + ENTRY * slots as usize, 0);

        Self {
            bytes,
            slots,
            recorded: 0,
        }
    }

    pub(crate) fn reserve(&mut self, additional: usize) {
        self.bytes.reserve(additional);
    }

    pub(crate) fn slot(&mut self, write: impl FnOnce(&mut Vec<u8, A>)) {
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

    pub(crate) fn skip(&mut self) {
        assert!(
            self.recorded < self.slots,
            "the envelope declares {} slots, all recorded",
            self.slots,
        );
        assert!(self.recorded > 0, "slot 0 (HEAD) is always present");

        self.recorded += 1;
    }

    pub(crate) fn finish(self) -> Envelope {
        assert_eq!(
            self.recorded, self.slots,
            "the envelope declares {} slots",
            self.slots,
        );
        Envelope { _marker: () }
    }

    pub(crate) fn finish_with_trailer(mut self, write: impl FnOnce(&mut Vec<u8, A>)) -> Envelope {
        assert_eq!(
            self.recorded, self.slots,
            "the envelope declares {} slots",
            self.slots,
        );

        write(&mut self.bytes);
        Envelope { _marker: () }
    }

    /// Backfills the directory entry for the most recently written slot.
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
