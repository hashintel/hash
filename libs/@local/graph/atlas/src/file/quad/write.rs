//! Streaming quad-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U32, U64};

use super::{FileHeader, Node, TypeSets};
use crate::file::region::{write_padding, write_region};

/// Streams the node table, the type-set fenceposts, and the type ids
/// as a quad file.
///
/// `nodes` is the node table in depth-first pre-order with the root at
/// index 0, so every child index points deeper in the table; `sets`
/// holds one direct-type set per node. Every region streams in file
/// order behind the header; wrap a raw [`File`](std::fs::File) in a
/// [`BufWriter`](io::BufWriter).
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// Panics when the node count does not leave room for the
/// absent-child sentinel, when a child index escapes the table or
/// fails to point deeper, or when `sets` covers a different node
/// count - each a producer bug the file format cannot represent,
/// caught before the bytes exist. [`TypeSets`] carries the fencepost
/// and set-order rules by construction.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries write failures; a malformed table is a caller contract \
              violation, documented under Panics"
)]
pub(crate) fn write_regions(
    nodes: &[Node],
    sets: &TypeSets,
    mut write: impl io::Write,
) -> io::Result<()> {
    assert!(
        (nodes.len() as u64) < u64::from(Node::NO_CHILD),
        "node indexes and the absent-child sentinel share u32",
    );
    assert_eq!(
        sets.node_count(),
        nodes.len(),
        "one type set per node record",
    );
    for (index, node) in nodes.iter().enumerate() {
        for child in node.children().into_iter().flatten() {
            assert!(
                u64::from(child) < nodes.len() as u64,
                "node {index}'s child {child} escapes the table",
            );
            assert!(
                u64::from(child) > index as u64,
                "node {index}'s child {child} must point deeper in the pre-order table",
            );
        }
    }

    let header = FileHeader::new(nodes.len() as u64, sets.ids().len() as u64);
    let posts_bytes = (nodes.len() as u64 + 1) * size_of::<u64>() as u64;

    write.write_all(header.as_bytes())?;
    write_region(&mut write, nodes.as_bytes())?;
    for &post in sets.posts() {
        write.write_all(U64::<LE>::new(post).as_bytes())?;
    }
    write_padding(&mut write, posts_bytes)?;
    for &id in sets.ids() {
        write.write_all(U32::<LE>::new(id).as_bytes())?;
    }

    Ok(())
}
