//! Streaming quad-file writer.

use std::io;

use zerocopy::{IntoBytes as _, LE, U32, U64};

use super::{FileHeader, Node, TypeSets};

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

    // A resident table's geometry fits u64; the checked equations exist
    // for parsing foreign headers.
    let posts_offset = header
        .posts_offset()
        .expect("a resident table's geometry fits u64");
    let ids_offset = header
        .ids_offset()
        .expect("a resident table's geometry fits u64");

    let table_bytes = nodes.len() as u64 * size_of::<Node>() as u64;
    let posts_bytes = (nodes.len() as u64 + 1) * size_of::<u64>() as u64;
    let table_padding = posts_offset - FileHeader::SIZE as u64 - table_bytes;
    let posts_padding = ids_offset - posts_offset - posts_bytes;
    let zeros = [0_u8; FileHeader::SIZE];

    write.write_all(header.as_bytes())?;
    write.write_all(nodes.as_bytes())?;
    write.write_all(&zeros[..usize::try_from(table_padding).expect("padding stays below 4096")])?;
    for &post in sets.posts() {
        write.write_all(U64::<LE>::new(post).as_bytes())?;
    }
    write.write_all(&zeros[..usize::try_from(posts_padding).expect("padding stays below 4096")])?;
    for &id in sets.ids() {
        write.write_all(U32::<LE>::new(id).as_bytes())?;
    }

    Ok(())
}
