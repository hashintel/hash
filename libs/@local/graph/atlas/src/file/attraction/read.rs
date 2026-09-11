//! Opened attraction files.

use core::{error::Error, fmt, marker::PhantomData};
use std::path::Path;

use zerocopy::TryFromBytes as _;

use super::{EdgeKind, EdgeRecord, EdgeRow, FileHeader, GroupRecord, NodeKind, NodeRow};
use crate::file::region::{
    PAGE,
    header::{HeaderError, HeaderMap},
    machine::Architecture,
};

/// Opening an attraction file failed.
#[derive(Debug)]
pub(crate) enum OpenAttractionError {
    /// Reading the header page failed.
    Header(HeaderError),
    /// The file's row domains are not the requested ones.
    Domain {
        /// The endpoint row domain the file persists.
        node: NodeKind,
        /// The edge row domain the file persists.
        edge: EdgeKind,
    },
    /// The records are stored in the other byte order.
    Architecture {
        /// The order the file's writer stamped.
        found: Architecture,
    },
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes.
        ///
        /// [`None`] when the header's geometry overflows `u64`, in which case it matches no real
        /// file.
        expected: Option<u64>,
        actual: u64,
    },
    /// A stored record holds a value outside its field's domain.
    Value {
        /// The region holding the record.
        region: Region,
    },
}

/// A record region of an attraction file.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Region {
    /// The relation group records.
    Groups,
    /// The edge records.
    Edges,
}

impl fmt::Display for Region {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::Groups => "groups",
            Self::Edges => "edges",
        })
    }
}

impl fmt::Display for OpenAttractionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the attraction file's header page: {error}"),
            Self::Domain { node, edge } => write!(
                fmt,
                "the file holds {node} nodes and {edge} edges, which are not the requested row \
                 domains",
            ),
            Self::Architecture { found } => write!(
                fmt,
                "the file stores {found} records where this machine reads {native}",
                native = Architecture::HOST,
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
                "the file holds {actual} bytes where the header describes no index",
            ),
            Self::Value { region } => write!(
                fmt,
                "the file's {region} region holds a value outside its field's domain",
            ),
        }
    }
}

impl Error for OpenAttractionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Domain { .. }
            | Self::Architecture { .. }
            | Self::Length { .. }
            | Self::Value { .. } => None,
        }
    }
}

/// An attraction file mapped read-only into memory.
///
/// Opening checks the requested row domains against the persisted kind fields, the writer's
/// byte order against this host's, and the file length against the header's geometry, then
/// parses both record regions once. An open file therefore always describes its own regions
/// exactly, and its records read back under the row types that wrote them with every stored
/// value inside its field's domain. The regions borrow straight from the
/// whole-file mapping and start 4096-byte aligned: aligned for every scalar and SIMD width. The
/// accessors expose geometry alone. The index's ordering invariants and score-provenance bits
/// are `salt::relation`'s artifact contract.
#[derive(Debug)]
pub(crate) struct AttractionFile<N, E> {
    map: HeaderMap<FileHeader>,
    _marker: PhantomData<fn(&(N, E))>,
}

impl<N, E> AttractionFile<N, E>
where
    N: NodeRow,
    E: EdgeRow,
{
    /// Opens and maps the attraction file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAttractionError::Header`] when the header page cannot be read,
    /// [`OpenAttractionError::Domain`] when the file's row domains are not `N` and `E`,
    /// [`OpenAttractionError::Architecture`] when the file was written on the other byte order,
    /// [`OpenAttractionError::Length`] when the file length contradicts the header's geometry,
    /// and [`OpenAttractionError::Value`] when a stored record holds a value outside its field's
    /// domain.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenAttractionError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenAttractionError::Header)?;

        let node = map.header().node_kind();
        let edge = map.header().edge_kind();
        if (node, edge) != (N::KIND, E::KIND) {
            return Err(OpenAttractionError::Domain { node, edge });
        }

        let found = map.header().machine.architecture();
        if found != Architecture::HOST {
            return Err(OpenAttractionError::Architecture { found });
        }

        let expected = map
            .header()
            .expected_file_len(size_of::<EdgeRecord<N, E>>() as u64);
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenAttractionError::Length { expected, actual });
        }

        let file = Self {
            map,
            _marker: PhantomData,
        };

        // The regions are exactly the sizes the header describes, so the only way a parse can
        // fail from here on is a stored value outside its field's domain.
        // The cast error borrows the mapped bytes and names no record, so the region is the
        // whole report.
        <[GroupRecord]>::try_ref_from_bytes(file.group_bytes()).map_err(|_error| {
            OpenAttractionError::Value {
                region: Region::Groups,
            }
        })?;
        <[EdgeRecord<N, E>]>::try_ref_from_bytes(file.edge_bytes()).map_err(|_error| {
            OpenAttractionError::Value {
                region: Region::Edges,
            }
        })?;

        Ok(file)
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Returns the corpus row count `N` the edges index into.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.header().rows()
    }

    /// Borrows the group region's bytes.
    ///
    /// The offsets and products repeat checked computations open already accepted, so none of
    /// them can overflow here.
    fn group_bytes(&self) -> &[u8] {
        self.map.map().region(
            PAGE,
            self.header().groups() * size_of::<GroupRecord>() as u64,
        )
    }

    /// Borrows the edge region's bytes.
    fn edge_bytes(&self) -> &[u8] {
        self.map.map().region(
            self.header()
                .edges_offset()
                .expect("open validated the geometry"),
            self.header().edges() * size_of::<EdgeRecord<N, E>>() as u64,
        )
    }

    /// Views the relation groups, in file order.
    #[must_use]
    pub(crate) fn groups(&self) -> &[GroupRecord] {
        <[GroupRecord]>::try_ref_from_bytes(self.group_bytes())
            .expect("open validated every record in the region")
    }

    /// Views the edge records, in group-major order.
    #[must_use]
    pub(crate) fn edges(&self) -> &[EdgeRecord<N, E>] {
        <[EdgeRecord<N, E>]>::try_ref_from_bytes(self.edge_bytes())
            .expect("open validated every record in the region")
    }
}
