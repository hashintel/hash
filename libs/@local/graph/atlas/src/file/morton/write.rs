//! Streaming morton-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U64};

use super::{Fenceposts, FileHeader};
use crate::{
    file::region::{PAGE, write_padding},
    morton::MortonKey,
};

/// The index stride filling one 4096-byte page of codes.
///
/// So one index key resolves to one faulted page.
pub(crate) const PAGE_STRIDE: u32 = 512;
const _: () = assert!(PAGE_STRIDE as u64 * size_of::<u64>() as u64 == PAGE);

/// Streams the index and code regions as a morton file.
///
/// `codes` is the full code column in base delivery order: bucket-major with `fenceposts` naming
/// the segment boundaries, non-decreasing within each segment (the deepest bucket may repeat a key
/// for co-located points). The index keys are sampled from the column at every `stride` positions
/// during the walk, so index, fenceposts, and codes cannot disagree. Every region streams in file
/// order behind the header; wrap a raw [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter).
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// Panics when `stride` is zero (which matches no real file), when `codes` disagrees with the
/// fencepost count, or when a segment's codes decrease - each a producer bug the file format cannot
/// represent, caught before the bytes exist.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; a malformed column is a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_regions(
    stride: u32,
    fenceposts: &Fenceposts,
    codes: &[MortonKey],
    mut write: impl io::Write,
) -> io::Result<()> {
    assert!(stride > 0, "a zero index stride matches no real file");
    assert_eq!(
        codes.len() as u64,
        fenceposts.count(),
        "one code per fencepost-counted position",
    );
    for (bucket, length) in fenceposts.lengths().iter().enumerate() {
        // The count equality above makes every segment range in bounds.
        let start = usize::try_from(fenceposts.posts()[bucket])
            .expect("a resident column fits the address space");
        let length = usize::try_from(*length).expect("a resident column fits the address space");
        assert!(
            codes[start..start + length].is_sorted(),
            "bucket {bucket}'s codes must not decrease",
        );
    }

    let header = FileHeader::new(stride, fenceposts);
    let index_bytes = header
        .index_keys()
        .expect("the stride is nonzero by construction")
        * size_of::<u64>() as u64;

    write.write_all(header.as_bytes())?;
    for key in codes.iter().step_by(stride as usize) {
        write.write_all(U64::<LE>::new(key.to_bits()).as_bytes())?;
    }
    write_padding(&mut write, index_bytes)?;
    for key in codes {
        write.write_all(U64::<LE>::new(key.to_bits()).as_bytes())?;
    }

    Ok(())
}
