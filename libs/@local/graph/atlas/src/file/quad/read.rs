//! Opened quad files.

use core::{error::Error, fmt};
use std::path::Path;

#[cfg(test)]
use zerocopy::U32;
use zerocopy::{FromBytes as _, LE, U64};

use super::{FileHeader, Node};
use crate::{
    file::region::{
        PAGE,
        header::{HeaderError, HeaderMap},
    },
    morton::MortonCell,
};

/// Opening a quad file failed.
#[derive(Debug)]
pub enum OpenQuadError {
    /// Reading the header page failed.
    Header(HeaderError),
    /// The node count leaves no room for the absent-child sentinel.
    Nodes { nodes: u64 },
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes.
        ///
        /// [`None`] when the shape's byte length overflows `u64`, in which case it matches no real
        /// file.
        expected: Option<u64>,
        actual: u64,
    },
    /// A type-set fencepost breaks a structural rule.
    ///
    /// Posts anchor at zero, never decrease, and close at the header's entry count.
    Posts { index: u64 },
    /// A child index escapes the table or fails to point deeper in the pre-order.
    Child { node: u64, child: u32 },
}

impl fmt::Display for OpenQuadError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the quad file's header page: {error}"),
            Self::Nodes { nodes } => write!(
                fmt,
                "{nodes} nodes leave no room for the u32 absent-child sentinel",
            ),
            Self::Length {
                expected: Some(expected),
                actual,
            } => write!(
                fmt,
                "the file holds {actual} bytes where the header describes {expected}",
            ),
            Self::Length {
                expected: None,
                actual,
            } => write!(
                fmt,
                "the file holds {actual} bytes where the header's byte length overflows",
            ),
            Self::Posts { index } => write!(
                fmt,
                "type-set fencepost {index} breaks the anchoring, ordering, or closing rule",
            ),
            Self::Child { node, child } => write!(
                fmt,
                "node {node}'s child {child} escapes the table or fails to point deeper",
            ),
        }
    }
}

impl Error for OpenQuadError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Nodes { .. } | Self::Length { .. } | Self::Posts { .. } | Self::Child { .. } => {
                None
            }
        }
    }
}

/// A quad file mapped read-only into memory.
///
/// Opening parses the header and checks the length equation, then validates the structural rules.
/// Fenceposts anchor at zero, never decrease, and close at the header's entry count. Every child
/// index stays inside the table and points deeper in the pre-order. Traversals and set slices
/// therefore never re-check. Within-set ascending order is the writer's contract, assumed the way
/// every merge assumes its sorted inputs.
///
/// [`locate`](Self::locate) is the serving query: the node owning one tile cell, found by walking
/// the two-bit digits of the cell's key prefix from the root.
#[derive(Debug)]
pub(crate) struct QuadFile {
    map: HeaderMap<FileHeader>,
}

impl QuadFile {
    /// Opens and maps the quad file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenQuadError::Header`] when the header page cannot be read,
    /// [`OpenQuadError::Nodes`] when the node count collides with the child sentinel,
    /// [`OpenQuadError::Length`] when the file length contradicts the header's geometry,
    /// [`OpenQuadError::Posts`] when a type-set fencepost breaks a structural rule, and
    /// [`OpenQuadError::Child`] when a child index escapes the table or fails to point deeper.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenQuadError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenQuadError::Header)?;
        let header = map.header();

        if header.nodes() >= u64::from(Node::NO_CHILD) {
            return Err(OpenQuadError::Nodes {
                nodes: header.nodes(),
            });
        }

        let expected = header.expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenQuadError::Length { expected, actual });
        }

        let this = Self { map };

        let posts = this.posts();
        if posts[0].get() != 0 {
            return Err(OpenQuadError::Posts { index: 0 });
        }
        for (index, [left, right]) in posts.array_windows::<2>().enumerate() {
            if right.get() < left.get() {
                return Err(OpenQuadError::Posts {
                    index: index as u64 + 1,
                });
            }
        }
        if posts[posts.len() - 1].get() != this.header().type_ids() {
            return Err(OpenQuadError::Posts {
                index: posts.len() as u64 - 1,
            });
        }

        let nodes = this.nodes();
        for (index, node) in nodes.iter().enumerate() {
            for child in node.children().into_iter().flatten() {
                if u64::from(child) >= nodes.len() as u64 || u64::from(child) <= index as u64 {
                    return Err(OpenQuadError::Child {
                        node: index as u64,
                        child,
                    });
                }
            }
        }

        Ok(this)
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Views the node table with the root at index 0.
    #[must_use]
    pub(crate) fn nodes(&self) -> &[Node] {
        // The offsets and products in the region reads repeat checked
        // computations open already accepted, so none of them can
        // overflow here.
        let bytes = self
            .map
            .map()
            .region(PAGE, self.header().nodes() * size_of::<Node>() as u64);
        <[Node]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of node records, which tolerate any alignment"
            )
        })
    }

    /// Views the type-set fenceposts, one entry count per node plus the closing count.
    ///
    /// Unlike the morton file's 34 header posts, these are `N + 1` entries, so they stay a raw view
    /// (validated once at open, read through `.get()` twice per set lookup) rather than a copied
    /// validated type that would double the region's memory.
    #[must_use]
    fn posts(&self) -> &[U64<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .posts_offset()
                .expect("open validated the geometry"),
            (self.header().nodes() + 1) * size_of::<u64>() as u64,
        );
        <[U64<LE>]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of byte-order integers, which tolerate any alignment"
            )
        })
    }

    /// Views the shared type-id array.
    #[cfg(test)] // `type_set` composes it for the open-tamper and lod tests.
    #[must_use]
    fn ids(&self) -> &[U32<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .ids_offset()
                .expect("open validated the geometry"),
            self.header().type_ids() * size_of::<u32>() as u64,
        );
        <[U32<LE>]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of byte-order integers, which tolerate any alignment"
            )
        })
    }

    /// Views one node's direct-type set, ascending.
    ///
    /// # Panics
    ///
    /// This panics when `node` is at or beyond the node count.
    #[cfg(test)] // The open-tamper and lod tests read direct-type sets cross-module.
    #[must_use]
    pub(crate) fn type_set(&self, node: u32) -> &[U32<LE>] {
        let posts = self.posts();
        let node = node as usize;
        let start =
            usize::try_from(posts[node].get()).expect("a mapped region fits the address space");
        let end =
            usize::try_from(posts[node + 1].get()).expect("a mapped region fits the address space");
        &self.ids()[start..end]
    }

    /// Returns the node owning `cell`.
    ///
    /// [`None`] when the schedule delivers nothing new below the cell's deepest ancestor node.
    ///
    /// The walk consumes the two-bit digits of the cell's key prefix from the root: digit `d` names
    /// the Morton child quadrant at depth `d + 1`. An empty table locates nothing.
    #[must_use]
    pub(crate) fn locate(&self, cell: MortonCell) -> Option<u32> {
        let nodes = self.nodes();
        if nodes.is_empty() {
            return None;
        }

        let mut node = 0_u32;
        let prefix = cell.min_key().prefix(cell.depth());
        for step in (0..cell.depth().get()).rev() {
            let quadrant = (prefix >> (2 * u64::from(step))) & 0b11;
            let record = &nodes[node as usize];
            node = record.child(quadrant as usize)?;
        }

        Some(node)
    }
}
