//! Streaming attraction-file writer.

use std::io;

use zerocopy::IntoBytes as _;

use super::{EdgeRecord, FileHeader, GroupRecord, PaddedFileHeader};
use crate::file::region::write_padding;

/// Streams the group and edge regions as an attraction file.
///
/// `rows` is the corpus row domain the edge records index into, and `edge_count` the number of
/// records `edges` yields - edge streams are typically flattened over groups, which erases the
/// exact length an iterator could promise. The header records all three counts verbatim. Records
/// stream in file order behind the header, so this function buffers nothing; wrap a raw
/// [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter) - the per-record writes are small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// This panics when a stream's length promise breaks, which no file geometry can represent.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; a broken length promise is a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_records(
    rows: u64,
    groups: impl ExactSizeIterator<Item = GroupRecord>,
    edge_count: u64,
    edges: impl Iterator<Item = EdgeRecord>,
    mut write: impl io::Write,
) -> io::Result<()> {
    let header = FileHeader::new(groups.len() as u64, edge_count, rows);

    let group_bytes = header.groups() * size_of::<GroupRecord>() as u64;

    write.write_all(PaddedFileHeader::new(header).as_bytes())?;
    let mut written = 0_u64;
    for group in groups {
        write.write_all(group.as_bytes())?;
        written += 1;
    }
    assert_eq!(
        written,
        header.groups(),
        "the group stream's length promise holds"
    );
    write_padding(&mut write, group_bytes)?;

    let mut written = 0_u64;
    for edge in edges {
        write.write_all(edge.as_bytes())?;
        written += 1;
    }
    assert_eq!(
        written,
        header.edges(),
        "the edge stream's length promise holds"
    );

    Ok(())
}
