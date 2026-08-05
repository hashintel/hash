//! Streaming postings-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U64};

use super::{FileHeader, PaddedFileHeader};
use crate::{
    bitset::{DenseBitSlice, DenseBitSliceArray},
    file::region::{write_padding, write_region},
    identity::{BasePosition, OntologyRowId},
};

/// The regions of one postings file, borrowed from a finished build.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Regions<'build> {
    /// The base-position domain the header records.
    pub points: u64,
    /// The types whose membership is a dense set.
    pub flags: &'build DenseBitSlice<OntologyRowId>,
    /// `types + 1` fenceposts delimiting [`list_entries`](Self::list_entries); a dense type's run
    /// is empty.
    pub list_posts: &'build [u64],
    /// The list membership entries, type-major, sorted ascending per type.
    pub list_entries: &'build [BasePosition],
    /// The dense region holds one frame per dense type in ascending type order, behind the
    /// region's own point-domain header.
    pub dense_sets: &'build DenseBitSliceArray<BasePosition>,
    /// `types + 1` fenceposts delimiting [`parent_ids`](Self::parent_ids).
    pub parent_posts: &'build [u64],
    /// The direct parent rows, type-major.
    pub parent_ids: &'build [OntologyRowId],
    /// `points + 1` fenceposts delimiting [`direct_ids`](Self::direct_ids).
    pub direct_posts: &'build [u64],
    /// The direct type rows, position-major, ascending per position.
    pub direct_ids: &'build [OntologyRowId],
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
/// This panics when the regions contradict each other. Each fencepost region holds one post per
/// type plus the closing post, so an empty one describes no type domain at all. Fencepost regions
/// of differing lengths, a direct fencepost region not covering the point domain plus its closing
/// post, a flags set whose domain is not the type count, a flag population differing from the
/// dense set count, a dense region whose domain is not the point domain, and a final fencepost
/// differing from its array's length are the remaining contradictions. No file geometry
/// represents any of them.
///
/// `salt::postings` owns the membership and parent list rules (ascent, domains, empty list runs
/// for dense types) as its construction contract and asserts them where it builds the lists.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; contradictory regions are a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_regions(
    Regions {
        points,
        flags,
        list_posts,
        list_entries,
        dense_sets,
        parent_posts,
        parent_ids,
        direct_posts,
        direct_ids,
    }: Regions<'_>,
    mut write: impl io::Write,
) -> io::Result<()> {
    assert_eq!(
        list_posts.len(),
        parent_posts.len(),
        "both fencepost regions cover the one type domain",
    );
    assert!(
        !list_posts.is_empty(),
        "a fencepost region holds one post per type plus the closing post",
    );

    let types = (list_posts.len() - 1) as u64;
    assert_eq!(
        flags.domain_size(),
        types,
        "the flags set covers the type domain",
    );
    assert_eq!(
        flags.count(),
        dense_sets.len() as u64,
        "the flags set marks one type per dense set",
    );
    assert_eq!(
        dense_sets.domain_size(),
        points,
        "every dense set covers the point domain",
    );
    assert_eq!(
        list_posts.last().copied(),
        Some(list_entries.len() as u64),
        "the final list fencepost closes the list entry array",
    );
    assert_eq!(
        parent_posts.last().copied(),
        Some(parent_ids.len() as u64),
        "the final parent fencepost closes the parent id array",
    );
    assert_eq!(
        direct_posts.len() as u64,
        points + 1,
        "the direct fencepost region covers the point domain plus its closing post",
    );
    assert_eq!(
        direct_posts.last().copied(),
        Some(direct_ids.len() as u64),
        "the final direct fencepost closes the direct id array",
    );

    let header = FileHeader::new(
        types,
        points,
        list_entries.len() as u64,
        dense_sets.len() as u64,
        parent_ids.len() as u64,
        direct_ids.len() as u64,
    );

    let posts_bytes = list_posts.len() as u64 * size_of::<U64<LE>>() as u64;

    write.write_all(PaddedFileHeader::new(header).as_bytes())?;

    // The flags set, the parent ids, and the dense sets already carry their persisted
    // little-endian form, so their bytes are their regions.
    write_region(&mut write, flags.as_bytes())?;

    write_words(&mut write, list_posts)?;
    write_padding(&mut write, posts_bytes)?;

    write_words(&mut write, parent_posts)?;
    write_padding(&mut write, posts_bytes)?;

    write_region(&mut write, parent_ids.as_bytes())?;

    write_words(&mut write, direct_posts)?;
    write_padding(
        &mut write,
        direct_posts.len() as u64 * size_of::<U64<LE>>() as u64,
    )?;

    write_region(&mut write, direct_ids.as_bytes())?;

    write_region(&mut write, dense_sets.as_bytes())?;

    write.write_all(list_entries.as_bytes())?;

    Ok(())
}

/// Writes one `u64` region in canonical little-endian bytes.
fn write_words(mut write: impl io::Write, words: &[u64]) -> io::Result<()> {
    for &word in words {
        write.write_all(U64::<LE>::new(word).as_bytes())?;
    }

    Ok(())
}
