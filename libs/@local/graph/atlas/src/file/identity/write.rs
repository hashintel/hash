//! Streaming identity-file writer.

use core::hash::{Hash, Hasher};
use std::io;

use fst::MapBuilder;
use hashql_core::{
    collections::{FastHashMap, FastHashMapEntry},
    id::{Id, IdSlice},
};
use zerocopy::{Immutable, IntoBytes};

use super::{FileHeader, Key, Kind, PaddedFileHeader, PayloadSpan};
use crate::file::region::write_region;

/// A payload keyed by its byte view.
///
/// Hashing and equality delegate to the bytes [`IntoBytes`] exposes, so an interning map stores
/// each distinct payload reference itself rather than a copy of its bytes.
struct ByteKeyed<'a, A: ?Sized>(&'a A);

impl<A: IntoBytes + Immutable + ?Sized> PartialEq for ByteKeyed<'_, A> {
    fn eq(&self, other: &Self) -> bool {
        self.0.as_bytes() == other.0.as_bytes()
    }
}

impl<A: IntoBytes + Immutable + ?Sized> Eq for ByteKeyed<'_, A> {}

impl<A: IntoBytes + Immutable + ?Sized> Hash for ByteKeyed<'_, A> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.as_bytes().hash(state);
    }
}

/// Streams the four identity regions as an identity file.
///
/// `keys` is the key column in row order and `auxiliary` yields each row's display payload in
/// the same order, with the payload's bytes entering the region verbatim. Node and edge files
/// carry label bytes, ontology files carry icon bytes, and a row
/// without a display value carries empty bytes. The index derives from the key column, and the
/// span table from the payloads, with equal payloads sharing one span. Every region streams in
/// file order behind the header, so wrap a raw [`File`](std::fs::File) in a
/// [`BufWriter`](io::BufWriter).
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// This panics when `auxiliary` does not yield exactly one payload per key or when two rows
/// carry one key. Neither has a representation: the span table holds exactly one span per row,
/// and the index maps each key to exactly one row. The check runs before any byte reaches the
/// writer.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; disagreeing columns and duplicate keys are a \
              caller contract violation, documented under Panics"
)]
pub(crate) fn write_regions<'a, I, K>(
    kind: Kind,
    keys: &IdSlice<I, K>,
    auxiliary: impl IntoIterator<Item = &'a K::Payload>,
    mut write: impl io::Write,
) -> io::Result<()>
where
    I: Id,
    K: Key<Payload: 'a>,
{
    const {
        assert!(
            K::KIND.width() == size_of::<K>(),
            "the key kind's declared width is the key type's size",
        );
    }

    let keys = keys.as_raw();

    // The index inserts in ascending key-byte order, which is the only order keys carry.
    let mut order: Vec<usize> = (0..keys.len()).collect();
    order.sort_unstable_by(|&left, &right| keys[left].as_bytes().cmp(keys[right].as_bytes()));

    let mut builder = MapBuilder::memory();
    for &row in &order {
        builder
            .insert(keys[row].as_bytes(), row as u64)
            .expect("two rows carry one key");
    }
    let index = builder
        .into_inner()
        .expect("an in-memory index build performs no io");

    // Equal payloads intern to one span, so the payload region carries each distinct value once,
    // in first-appearance order. The map stores the yielded references keyed by their byte view,
    // so interning copies nothing beyond the payload region it builds.
    let mut interner = FastHashMap::<ByteKeyed<K::Payload>, PayloadSpan>::default();
    let mut payload = Vec::new();
    let mut spans = Vec::with_capacity(keys.len());
    for value in auxiliary {
        match interner.entry(ByteKeyed(value)) {
            FastHashMapEntry::Occupied(entry) => spans.push(*entry.get()),
            FastHashMapEntry::Vacant(entry) => {
                let bytes = entry.key().0.as_bytes();
                let span = PayloadSpan::new(payload.len() as u64, bytes.len() as u64);
                payload.extend_from_slice(bytes);
                spans.push(span);
                entry.insert(span);
            }
        }
    }
    assert_eq!(spans.len(), keys.len(), "one payload per key");

    let header = FileHeader::new(
        kind,
        K::KIND,
        keys.len() as u64,
        index.len() as u64,
        payload.len() as u64,
    );

    write.write_all(PaddedFileHeader::new(header).as_bytes())?;
    write_region(&mut write, keys.as_bytes())?;
    write_region(&mut write, &index)?;
    write_region(&mut write, spans.as_bytes())?;
    write.write_all(&payload)
}
