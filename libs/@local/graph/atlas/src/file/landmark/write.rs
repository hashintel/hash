//! Streaming landmark-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U32, U64};

use super::FileHeader;
use crate::math::Vec2;

/// Streams the three skeleton regions as a landmark file.
///
/// `rows` are the selected node rows in ordinal order, `assignment`
/// the landmark ordinals in node-row order, and `coordinates` the
/// layout positions in ordinal order; the header records their counts
/// verbatim. Every region streams in file order behind the header;
/// wrap a raw [`File`](std::fs::File) in a
/// [`BufWriter`](io::BufWriter) when the regions are small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// Panics when `coordinates` and `rows` disagree on the landmark
/// count, which no file geometry can represent.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; disagreeing regions are a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_regions(
    rows: &[U64<LE>],
    assignment: &[U32<LE>],
    coordinates: &[Vec2],
    mut write: impl io::Write,
) -> io::Result<()> {
    assert_eq!(coordinates.len(), rows.len(), "one coordinate per landmark");
    let header = FileHeader::new(rows.len() as u64, assignment.len() as u64);

    // A resident skeleton's geometry fits u64; the checked equations
    // exist for parsing foreign headers.
    let assignment_offset = header
        .assignment_offset()
        .expect("a resident skeleton's geometry fits u64");
    let coordinates_offset = header
        .coordinates_offset()
        .expect("a resident skeleton's geometry fits u64");

    let rows_padding = assignment_offset - FileHeader::SIZE as u64 - rows.as_bytes().len() as u64;
    let assignment_padding =
        coordinates_offset - assignment_offset - assignment.as_bytes().len() as u64;
    let zeros = [0_u8; FileHeader::SIZE];

    write.write_all(header.as_bytes())?;
    write.write_all(rows.as_bytes())?;
    write.write_all(&zeros[..usize::try_from(rows_padding).expect("padding stays below 4096")])?;
    write.write_all(assignment.as_bytes())?;
    write.write_all(
        &zeros[..usize::try_from(assignment_padding).expect("padding stays below 4096")],
    )?;
    write.write_all(coordinates.as_bytes())?;

    Ok(())
}
