//! Streaming identity-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U64};

use super::FileHeader;
use crate::file::region::{PAGE, write_padding, write_region};

/// Returns the index stride for `key_width`-byte ids: the pairs one
/// 4096-byte page holds, so one index key resolves to one faulted page.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the stride is a whole count of pairs per page; the remainder is the page tail a \
              stride deliberately leaves unused"
)]
#[must_use]
pub(crate) const fn stride_for(key_width: u32) -> u32 {
    let pair_size = key_width as u64 + size_of::<u64>() as u64;
    let stride = PAGE / pair_size;
    if stride == 0 {
        // Ids wider than a page: one pair per index key.
        1
    } else {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "the stride is at most PAGE / 9, far inside u32"
        )]
        {
            stride as u32
        }
    }
}

/// Streams the three identity regions as an identity file.
///
/// `ids` is the packed id column in row order, `key_width` bytes per
/// id; `order` holds every row exactly once, ascending by id bytes, so
/// pair `j` of the written file is `(ids[order[j]], order[j])` and the
/// index keys fall out of the same walk. Every region streams in file
/// order behind the header; wrap a raw [`File`](std::fs::File) in a
/// [`BufWriter`](io::BufWriter).
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// Panics when `key_width` is zero or `ids` is not one whole id per
/// `order` entry, neither of which any file geometry can represent. An
/// `order` entry beyond the rows panics on the id column access. Order
/// violations beyond that (out-of-order or repeated rows) are the
/// typed table's contract, validated where it lives.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; disagreeing regions are a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_regions(
    key_width: u32,
    ids: &[u8],
    order: &[u64],
    mut write: impl io::Write,
) -> io::Result<()> {
    assert!(key_width > 0, "ids are at least one byte wide");
    let width = key_width as usize;
    assert_eq!(
        ids.len(),
        order.len() * width,
        "one order entry per whole id",
    );

    let stride = stride_for(key_width);
    let header = FileHeader::new(key_width, order.len() as u64, stride);

    let index_bytes = header
        .index_keys()
        .expect("the stride is nonzero by construction")
        * u64::from(key_width);

    let id_of = |row: u64| -> &[u8] {
        let start = usize::try_from(row).expect("a resident row fits the address space") * width;
        &ids[start..start + width]
    };

    write.write_all(header.as_bytes())?;
    write_region(&mut write, ids)?;
    for &row in order.iter().step_by(stride as usize) {
        write.write_all(id_of(row))?;
    }
    write_padding(&mut write, index_bytes)?;
    for &row in order {
        write.write_all(id_of(row))?;
        write.write_all(U64::<LE>::new(row).as_bytes())?;
    }

    Ok(())
}
