//! Streaming postings-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U32, U64};

use super::FileHeader;
use crate::file::region::write_padding;

/// The regions of one postings file, borrowed from a finished build.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Regions<'build> {
    /// The base-position domain the header records.
    pub points: u64,
    /// `ceil(types/64)` words, bit `t` set when type `t`'s membership run is a dense bitmap.
    pub flags: &'build [u64],
    /// `types + 1` fenceposts delimiting [`entries`](Self::entries).
    pub membership_posts: &'build [u64],
    /// The membership entries, type-major: sorted positions for list types, bitmap words for dense
    /// types.
    pub entries: &'build [u32],
    /// `types + 1` fenceposts delimiting [`parent_ids`](Self::parent_ids).
    pub parent_posts: &'build [u64],
    /// The direct parent rows, type-major.
    pub parent_ids: &'build [u64],
}

/// Streams the postings regions as a postings file.
///
/// Regions stream in file order behind the header, so this function buffers nothing. Wrap a raw
/// [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter), because the per-entry writes are
/// small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// This panics when the region slices contradict each other. Each fencepost region holds one post
/// per type plus the closing post, so an empty one describes no type domain at all. Fencepost
/// regions of differing lengths, a flags region that does not hold one bit per type, and a final
/// fencepost differing from its array's length are the remaining contradictions. No file geometry
/// represents any of them.
///
/// `salt::postings` owns the membership and parent list rules (ascent, domains, dense run lengths)
/// as its construction contract and asserts them where it builds the lists.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; contradictory slices are a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_regions(
    Regions {
        points,
        flags,
        membership_posts,
        entries,
        parent_posts,
        parent_ids,
    }: Regions<'_>,
    mut write: impl io::Write,
) -> io::Result<()> {
    assert_eq!(
        membership_posts.len(),
        parent_posts.len(),
        "both fencepost regions cover the one type domain",
    );
    assert!(
        !membership_posts.is_empty(),
        "a fencepost region holds one post per type plus the closing post",
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

    let flag_bytes = flags.len() as u64 * size_of::<u64>() as u64;
    let posts_bytes = membership_posts.len() as u64 * size_of::<U64<LE>>() as u64;
    let parent_id_bytes = parent_ids.len() as u64 * size_of::<u64>() as u64;

    write.write_all(header.as_bytes())?;

    write_words(&mut write, flags)?;
    write_padding(&mut write, flag_bytes)?;

    write_words(&mut write, membership_posts)?;
    write_padding(&mut write, posts_bytes)?;

    write_words(&mut write, parent_posts)?;
    write_padding(&mut write, posts_bytes)?;

    write_words(&mut write, parent_ids)?;
    write_padding(&mut write, parent_id_bytes)?;

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
