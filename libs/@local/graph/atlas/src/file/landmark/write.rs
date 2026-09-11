//! Streaming landmark-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U32, U64};

use super::{FileHeader, PaddedFileHeader};
use crate::{file::region::write_region, math::Vec2};

/// Streams the three skeleton regions as a landmark file.
///
/// `rows` are the selected node rows in ordinal order, `assignment` the landmark ordinals in
/// node-row order, and `coordinates` the layout positions in ordinal order; the header records
/// their counts verbatim. Every region streams in file order behind the header; wrap a raw
/// [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter) when the regions are small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// This panics when `coordinates` and `rows` disagree on the landmark count, which no file geometry
/// can represent.
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

    write.write_all(PaddedFileHeader::new(header).as_bytes())?;
    write_region(&mut write, rows.as_bytes())?;
    write_region(&mut write, assignment.as_bytes())?;
    write.write_all(coordinates.as_bytes())?;

    Ok(())
}
