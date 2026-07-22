//! Streaming policy-file writer.

use std::io;

use zerocopy::IntoBytes as _;

use super::{FileHeader, PolicyRow};

/// Streams the policy rows as a policy file.
///
/// `rows` are the resolved policies, ascending by relation; the header records their count
/// verbatim. Wrap a raw [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter) when the table is
/// small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
pub(crate) fn write_rows(rows: &[PolicyRow], mut write: impl io::Write) -> io::Result<()> {
    let header = FileHeader::new(rows.len() as u64);

    write.write_all(header.as_bytes())?;
    write.write_all(rows.as_bytes())?;

    Ok(())
}
