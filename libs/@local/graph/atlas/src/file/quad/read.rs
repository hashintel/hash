//! Opened quad files.

use core::{error::Error, fmt};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use zerocopy::{
    FromBytes as _, LE, TryFromBytes as _, U32, U64,
    error::{ConvertError, ValidityError},
};

use super::{FileHeader, Node};
use crate::morton::MortonCell;

/// Opening a quad file failed.
#[derive(Debug)]
pub(crate) enum OpenQuadError {
    /// The file could not be opened or mapped.
    Io(io::Error),
    /// The file is shorter than one header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header(ValidityError<(), FileHeader>),
    /// The node count leaves no room for the absent-child sentinel.
    Nodes { nodes: u64 },
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes; [`None`] when the shape's
        /// byte length overflows `u64`, in which case it matches no
        /// real file.
        expected: Option<u64>,
        actual: u64,
    },
    /// A type-set fencepost breaks a structural rule: posts anchor at
    /// zero, never decrease, and close at the header's entry count.
    Posts { index: u64 },
    /// A child index escapes the table or fails to point deeper in the
    /// pre-order.
    Child { node: u64, child: u32 },
}

impl fmt::Display for OpenQuadError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the quad file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => {
                write!(fmt, "the leading bytes are not a quad-file header: {error}")
            }
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
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Undersized { .. }
            | Self::Nodes { .. }
            | Self::Length { .. }
            | Self::Posts { .. }
            | Self::Child { .. } => None,
        }
    }
}

/// A quad file mapped read-only into memory.
///
/// Opening parses the header, checks the length equation, and
/// validates the structural rules - fenceposts anchored, non-decreasing
/// and closing at the header's entry count; children inside the table
/// and pointing deeper - so traversals and set slices never re-check.
/// Within-set ascending order is the writer's contract, assumed the way
/// every merge assumes its sorted inputs.
///
/// [`locate`](Self::locate) is the serving query: the node owning one
/// tile cell, found by walking the two-bit digits of the cell's key
/// prefix from the root.
#[derive(Debug)]
pub(crate) struct QuadFile {
    map: Mmap,
}

impl QuadFile {
    /// Opens and maps the quad file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenQuadError::Io`] when the file cannot be opened or
    /// mapped, [`OpenQuadError::Header`] when its leading bytes are not
    /// a header this module speaks, [`OpenQuadError::Nodes`] when the
    /// node count collides with the child sentinel,
    /// [`OpenQuadError::Length`] when the file length contradicts the
    /// header's geometry, [`OpenQuadError::Posts`] when a type-set
    /// fencepost breaks a structural rule, and [`OpenQuadError::Child`]
    /// when a child index escapes the table or fails to point deeper.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenQuadError> {
        let file = File::open(path).map_err(OpenQuadError::Io)?;
        // SAFETY: published artifact files are immutable (the `crate::file`
        // publish contract: temporary path, rename into place, never
        // rewritten), so the mapped bytes cannot change beneath the borrow.
        let map = unsafe { Mmap::map(&file) }.map_err(OpenQuadError::Io)?;

        let Some(bytes) = map.get(..FileHeader::SIZE) else {
            return Err(OpenQuadError::Undersized {
                actual: map.len() as u64,
            });
        };
        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenQuadError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        if header.nodes() >= u64::from(Node::NO_CHILD) {
            return Err(OpenQuadError::Nodes {
                nodes: header.nodes(),
            });
        }

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenQuadError::Length { expected, actual });
        }

        let this = Self { map };

        let posts = this.posts();
        if posts[0].get() != 0 {
            return Err(OpenQuadError::Posts { index: 0 });
        }
        for (index, pair) in posts.windows(2).enumerate() {
            if pair[1].get() < pair[0].get() {
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
        let ptr = self.map.as_ptr().cast::<FileHeader>();

        // SAFETY: The map is valid for the lifetime of the file, immutable, and the constructor
        // validated that the map is large enough to contain the header and that its bytes parse
        // as one, so the deref target is a valid `FileHeader`.
        unsafe { &*ptr }
    }

    /// Carves one region out of the mapping.
    fn region(&self, offset: u64, len: u64) -> &[u8] {
        // The offsets and products repeat checked computations open
        // already accepted, so none of them can overflow here.
        let offset = usize::try_from(offset).expect("a mapped offset fits the address space");
        let len = usize::try_from(len).expect("a mapped region fits the address space");
        &self.map[offset..offset + len]
    }

    /// Views the node table with the root at index 0.
    #[must_use]
    pub(crate) fn nodes(&self) -> &[Node] {
        let bytes = self.region(
            FileHeader::SIZE as u64,
            self.header().nodes() * size_of::<Node>() as u64,
        );
        <[Node]>::ref_from_bytes(bytes).expect("node records tolerate any alignment")
    }

    /// Views the type-set fenceposts: one entry count per node plus the
    /// closing count.
    ///
    /// Unlike the morton file's 34 header posts, these are `N + 1`
    /// entries, so they stay a raw view - validated once at open, read
    /// through `.get()` twice per set lookup - rather than a copied
    /// validated type that would double the region's memory.
    #[must_use]
    fn posts(&self) -> &[U64<LE>] {
        let bytes = self.region(
            self.header()
                .posts_offset()
                .expect("open validated the geometry"),
            (self.header().nodes() + 1) * size_of::<u64>() as u64,
        );
        <[U64<LE>]>::ref_from_bytes(bytes).expect("byte-order integers tolerate any alignment")
    }

    /// Views the shared type-id array.
    #[must_use]
    fn ids(&self) -> &[U32<LE>] {
        let bytes = self.region(
            self.header()
                .ids_offset()
                .expect("open validated the geometry"),
            self.header().type_ids() * size_of::<u32>() as u64,
        );
        <[U32<LE>]>::ref_from_bytes(bytes).expect("byte-order integers tolerate any alignment")
    }

    /// Views one node's direct-type set, ascending.
    ///
    /// # Panics
    ///
    /// Panics when `node` is at or beyond the node count.
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

    /// Returns the node owning `cell`, [`None`] when the schedule
    /// delivers nothing new below the cell's deepest ancestor node.
    ///
    /// The walk consumes the two-bit digits of the cell's key prefix
    /// from the root: digit `d` names the Morton child quadrant at
    /// depth `d + 1`. An empty table locates nothing.
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
