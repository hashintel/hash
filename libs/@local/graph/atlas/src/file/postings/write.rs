//! Streaming postings-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U32, U64};

use super::FileHeader;

/// Streams the flags, fenceposts, parent edges, and membership entries
/// as a postings file.
///
/// `flags` holds `ceil(types/64)` words with bit `t` set when type
/// `t`'s membership run is a dense bitmap; `membership_posts` and
/// `parent_posts` each hold `types + 1` entries delimiting the
/// `entries` and `parent_ids` arrays; `points` is the base-position
/// domain the header records. Regions stream in file order behind the
/// header, so nothing is buffered here; wrap a raw
/// [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter) - the
/// per-entry writes are small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// Panics when the slices contradict each other - a flags region not
/// sized to the fencepost count, fencepost regions of differing
/// lengths, or a final fencepost that is not its array's length -
/// which violates the caller's construction contract; no file geometry
/// can represent it. The membership and parent list rules (ascent,
/// domains, dense run lengths) are `salt::postings`'s construction
/// contract, asserted where the lists are built.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; contradictory slices are a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_regions(
    points: u64,
    flags: &[u64],
    membership_posts: &[u64],
    entries: &[u32],
    parent_posts: &[u64],
    parent_ids: &[u32],
    mut write: impl io::Write,
) -> io::Result<()> {
    assert_eq!(
        membership_posts.len(),
        parent_posts.len(),
        "both fencepost regions cover the one type domain",
    );
    let types = (membership_posts.len() - 1) as u64;
    assert_eq!(
        flags.len() as u64,
        types.div_ceil(u64::from(u64::BITS)),
        "the flags region holds one bit per type",
    );
    assert_eq!(
        membership_posts.last().copied(),
        Some(entries.len() as u64),
        "the final membership fencepost closes the entries array",
    );
    assert_eq!(
        parent_posts.last().copied(),
        Some(parent_ids.len() as u64),
        "the final parent fencepost closes the parent id array",
    );

    let header = FileHeader::new(types, points, entries.len() as u64, parent_ids.len() as u64);

    // A resident postings' geometry fits u64; the checked equations
    // exist for parsing foreign headers.
    let membership_posts_offset = header
        .membership_posts_offset()
        .expect("a resident postings' geometry fits u64");
    let parent_posts_offset = header
        .parent_posts_offset()
        .expect("a resident postings' geometry fits u64");
    let parent_ids_offset = header
        .parent_ids_offset()
        .expect("a resident postings' geometry fits u64");
    let entries_offset = header
        .entries_offset()
        .expect("a resident postings' geometry fits u64");

    let flag_bytes = flags.len() as u64 * size_of::<u64>() as u64;
    let posts_bytes = membership_posts.len() as u64 * size_of::<U64<LE>>() as u64;
    let parent_id_bytes = parent_ids.len() as u64 * size_of::<u32>() as u64;

    write.write_all(header.as_bytes())?;

    write_words(&mut write, flags)?;
    write_padding(
        &mut write,
        membership_posts_offset - FileHeader::SIZE as u64 - flag_bytes,
    )?;

    write_words(&mut write, membership_posts)?;
    write_padding(
        &mut write,
        parent_posts_offset - membership_posts_offset - posts_bytes,
    )?;

    write_words(&mut write, parent_posts)?;
    write_padding(
        &mut write,
        parent_ids_offset - parent_posts_offset - posts_bytes,
    )?;

    for &id in parent_ids {
        write.write_all(U32::<LE>::new(id).as_bytes())?;
    }
    write_padding(
        &mut write,
        entries_offset - parent_ids_offset - parent_id_bytes,
    )?;

    for &entry in entries {
        write.write_all(U32::<LE>::new(entry).as_bytes())?;
    }

    Ok(())
}

/// Writes one `u64` region in canonical little-endian bytes.
fn write_words(mut write: impl io::Write, words: &[u64]) -> io::Result<()> {
    for &word in words {
        write.write_all(U64::<LE>::new(word).as_bytes())?;
    }

    Ok(())
}

/// Writes the zero padding between two page-aligned regions.
fn write_padding(mut write: impl io::Write, len: u64) -> io::Result<()> {
    let zeros = [0_u8; FileHeader::SIZE];
    write.write_all(&zeros[..usize::try_from(len).expect("padding stays below 4096")])
}
