//! Streaming postings-file writer.

use std::io;

use zerocopy::IntoBytes as _;

use super::{FileHeader, PaddedFileHeader};
use crate::{
    bitset::{DenseBitSlice, DenseBitSliceArray},
    file::region::write_region,
    identity::{BasePosition, OntologyRowId},
    runs::Runs,
};

/// The regions of one postings file, borrowed from a finished build.
///
/// The run structures arrive as [`Runs`], so every fencepost column already obeys the fencepost
/// law and carries its persisted little-endian width; the writer streams each column's bytes as
/// its region.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Regions<'build> {
    /// The types whose membership is a dense set.
    pub flags: &'build DenseBitSlice<OntologyRowId>,
    /// Each list type's membership positions, ascending per type. A dense type's run is empty.
    pub lists: &'build Runs<OntologyRowId, BasePosition>,
    /// The dense region holds one frame per dense type in ascending type order, behind the
    /// region's own point-domain header.
    pub dense_sets: &'build DenseBitSliceArray<BasePosition>,
    /// Each type's direct parent rows.
    pub parents: &'build Runs<OntologyRowId, OntologyRowId>,
    /// Each position's direct type rows, ascending per position. Its run count is the point
    /// domain the header records.
    pub direct: &'build Runs<BasePosition, OntologyRowId>,
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
/// This panics when the regions contradict each other. Each run structure upholds the fencepost
/// law by construction. The remaining contradictions live between regions. One check compares
/// the fencepost-region lengths. Another checks that the flags cover the type domain and agree with
/// the dense-set population. A final check compares the dense-region domain with the direct-map
/// point domain. No file geometry represents any of them.
///
/// `salt::postings` owns the membership and parent list rules (ascent, domains, empty list runs
/// for dense types) as its construction contract. Its build asserts the streams' ascent where it
/// gathers them and refuses out-of-domain ids as build errors, and the list runs inherit ascent
/// from position order.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; contradictory regions are a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_regions(
    Regions {
        flags,
        lists,
        dense_sets,
        parents,
        direct,
    }: Regions<'_>,
    mut write: impl io::Write,
) -> io::Result<()> {
    let (list_posts, list_entries) = lists.as_raw_parts();
    let (parent_posts, parent_ids) = parents.as_raw_parts();
    let (direct_posts, direct_ids) = direct.as_raw_parts();

    assert_eq!(
        list_posts.len(),
        parent_posts.len(),
        "both fencepost regions cover the one type domain",
    );

    let types = (list_posts.len() - 1) as u64;
    let points = direct.runs() as u64;
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

    let header = FileHeader::new(
        types,
        points,
        list_entries.len() as u64,
        dense_sets.len() as u64,
        parent_ids.len() as u64,
        direct_ids.len() as u64,
    );

    write.write_all(PaddedFileHeader::new(header).as_bytes())?;

    // Every region already carries its persisted little-endian form, so its bytes are its
    // region.
    write_region(&mut write, flags.as_bytes())?;
    write_region(&mut write, list_posts.as_raw().as_bytes())?;
    write_region(&mut write, parent_posts.as_raw().as_bytes())?;
    write_region(&mut write, parent_ids.as_bytes())?;
    write_region(&mut write, direct_posts.as_raw().as_bytes())?;
    write_region(&mut write, direct_ids.as_bytes())?;
    write_region(&mut write, dense_sets.as_bytes())?;
    write.write_all(list_entries.as_bytes())?;

    Ok(())
}
