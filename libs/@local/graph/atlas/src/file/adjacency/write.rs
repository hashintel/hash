//! Streaming adjacency-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U32, U64};

use super::{EdgeWidth, FileHeader};

/// Streams the fencepost and value regions as an adjacency file.
///
/// `fenceposts` holds `2N + 1` entries delimiting the `2E` `values`
/// slots, so both counts derive from the slices; the header records
/// them beside `width`, which must cover every value
/// ([`EdgeWidth::for_edges`] picks the narrowest that does). Regions
/// stream in file order behind the header, so nothing is buffered here;
/// wrap a raw [`File`](std::fs::File) in a
/// [`BufWriter`](io::BufWriter) - the per-entry writes are small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// Panics when the slices contradict each other - an even fencepost
/// count, an odd value count, or a final fencepost that is not the
/// value count - or when a value escapes `width`; either violates the
/// caller's construction contract and no file geometry can represent
/// it.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; contradictory slices are a caller contract \
              violation, documented under Panics"
)]
#[expect(
    clippy::integer_division,
    reason = "the counts divide exactly under the asserted parities: 2N + 1 posts, 2E slots"
)]
pub(crate) fn write_lists(
    fenceposts: &[u64],
    values: &[u64],
    width: EdgeWidth,
    mut write: impl io::Write,
) -> io::Result<()> {
    assert!(
        !fenceposts.len().is_multiple_of(2),
        "the fencepost column holds two runs per node plus the closing post",
    );
    assert!(
        values.len().is_multiple_of(2),
        "the value array holds one outgoing and one incoming slot per edge",
    );
    assert_eq!(
        fenceposts.last().copied(),
        Some(values.len() as u64),
        "the final fencepost closes the value array",
    );

    let nodes = (fenceposts.len() / 2) as u64;
    let edges = (values.len() / 2) as u64;
    let header = FileHeader::new(nodes, edges, width);

    // A resident adjacency's geometry fits u64; the checked equations
    // exist for parsing foreign headers.
    let values_offset = header
        .values_offset()
        .expect("a resident adjacency's geometry fits u64");
    let fencepost_bytes = fenceposts.len() as u64 * size_of::<U64<LE>>() as u64;
    let fencepost_padding = values_offset - FileHeader::SIZE as u64 - fencepost_bytes;
    let zeros = [0_u8; FileHeader::SIZE];

    write.write_all(header.as_bytes())?;
    for &fencepost in fenceposts {
        write.write_all(U64::<LE>::new(fencepost).as_bytes())?;
    }
    write.write_all(
        &zeros[..usize::try_from(fencepost_padding).expect("padding stays below 4096")],
    )?;

    match width {
        EdgeWidth::U32 => {
            for &value in values {
                let narrowed =
                    u32::try_from(value).expect("every edge row id fits the chosen width");
                write.write_all(U32::<LE>::new(narrowed).as_bytes())?;
            }
        }
        EdgeWidth::U64 => {
            for &value in values {
                write.write_all(U64::<LE>::new(value).as_bytes())?;
            }
        }
    }

    Ok(())
}
