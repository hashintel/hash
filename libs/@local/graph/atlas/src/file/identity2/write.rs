//! Streaming identity-file writer.

use std::{collections::HashMap, io};

use fst::MapBuilder;
use hashql_core::id::{Id, IdSlice};
use zerocopy::IntoBytes as _;

use super::{FileHeader, Key, Kind, PaddedFileHeader, PayloadSpan};
use crate::file::region::write_region;

/// Streams the four identity regions as an identity file.
///
/// `keys` is the key column in row order and `auxiliary` the display payload of each row: label
/// bytes for node and edge files, icon bytes for ontology files. A row without a display value
/// carries empty bytes. The index derives from the key column, and the span table from the
/// payloads, with equal payloads sharing one span. Every region streams in file order
/// behind the header, so wrap a raw [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter).
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// This panics when `auxiliary` is not one payload per key or when two rows carry one key.
/// Neither has a representation: the span table holds exactly one span per row, and the index
/// maps each key to exactly one row.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; disagreeing columns and duplicate keys are a \
              caller contract violation, documented under Panics"
)]
pub(crate) fn write_regions<I, K, A>(
    kind: Kind,
    keys: &IdSlice<I, K>,
    auxiliary: &IdSlice<I, A>,
    mut write: impl io::Write,
) -> io::Result<()>
where
    I: Id,
    K: Key,
    A: AsRef<[u8]>,
{
    const {
        assert!(
            K::KIND.width() == size_of::<K>(),
            "the key kind's declared width is the key type's size",
        );
    }

    let keys = keys.as_raw();
    let auxiliary = auxiliary.as_raw();
    assert_eq!(keys.len(), auxiliary.len(), "one payload per key");

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
    // in first-appearance order.
    let mut interner = HashMap::<&[u8], PayloadSpan>::new();
    let mut payload = Vec::new();
    let mut spans = Vec::with_capacity(auxiliary.len());
    for value in auxiliary {
        let bytes = value.as_ref();
        let span = *interner.entry(bytes).or_insert_with(|| {
            let offset = payload.len() as u64;
            payload.extend_from_slice(bytes);
            PayloadSpan::new(offset, bytes.len() as u64)
        });
        spans.push(span);
    }

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
