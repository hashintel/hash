//! Opened postings files.

use core::{error::Error, fmt};
use std::path::Path;

use zerocopy::{FromBytes as _, LE, U64};

use super::FileHeader;
use crate::{
    bitset::{
        DenseBitSlice, DenseBitSliceArray, ParseDenseBitSliceArrayError, ParseDenseBitSliceError,
    },
    file::region::{
        PAGE_BYTES,
        header::{HeaderError, HeaderMap},
    },
    identity::{BasePosition, OntologyRowId},
};

/// Opening a postings file failed.
#[derive(Debug)]
pub enum OpenPostingsError {
    /// Reading the header page failed.
    Header(HeaderError),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes.
        ///
        /// [`None`] when the header's geometry overflows `u64`, in which case it matches no real
        /// file.
        expected: Option<u64>,
        actual: u64,
    },
    /// The flags region does not hold a valid bit set frame.
    Flags(ParseDenseBitSliceError),
    /// The flags frame's domain contradicts the header's type count.
    FlagsDomain {
        /// The type count the header claims.
        types: u64,
        /// The domain the flags frame claims.
        domain: u64,
    },
    /// The flag population contradicts the header's dense set count.
    DenseCount {
        /// The dense set count the header claims.
        header: u64,
        /// The number of set flag bits.
        flagged: u64,
    },
    /// The dense region does not hold exactly the frames the header describes.
    DenseSets(ParseDenseBitSliceArrayError),
}

impl fmt::Display for OpenPostingsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the postings file's header page: {error}"),
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
                "the file holds {actual} bytes where the header describes no postings",
            ),
            Self::Flags(error) => write!(fmt, "the postings file's flags region: {error}"),
            Self::FlagsDomain { types, domain } => write!(
                fmt,
                "the flags frame covers {domain} types where the header claims {types}",
            ),
            Self::DenseCount { header, flagged } => write!(
                fmt,
                "the flags set {flagged} types dense where the header claims {header} dense sets",
            ),
            Self::DenseSets(error) => {
                write!(fmt, "the postings file's dense region: {error}")
            }
        }
    }
}

impl Error for OpenPostingsError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Flags(error) => Some(error),
            Self::DenseSets(error) => Some(error),
            Self::Length { .. } | Self::FlagsDomain { .. } | Self::DenseCount { .. } => None,
        }
    }
}

/// A postings file mapped read-only into memory.
///
/// Opening parses the header and checks the file length equation, then validates every bit set
/// frame - the flags against the header's type count and flag population, each dense set against
/// the point count. An open file therefore always describes its own regions exactly. Each
/// accessor borrows its region straight from the whole-file mapping, and every region starts on
/// a 4096-byte boundary, which aligns it for every scalar and SIMD width. The accessors expose
/// geometry alone. The membership, direct map, and parent contracts are `salt::postings`'s
/// artifact contract.
#[derive(Debug)]
pub(crate) struct PostingsFile {
    map: HeaderMap<FileHeader>,
}

impl PostingsFile {
    /// Opens and maps the postings file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenPostingsError::Header`] when the header page cannot be read,
    /// [`OpenPostingsError::Length`] when the file length contradicts the header's geometry, and
    /// one of the frame variants when a bit set region does not hold exactly the frames the header
    /// describes.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenPostingsError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenPostingsError::Header)?;

        let expected = map.header().expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenPostingsError::Length { expected, actual });
        }

        // The frames' own domain counts restate header fields. Unchecked, a flags frame claiming
        // a smaller domain parses cleanly and answers false for every real type beyond it, and one
        // claiming a larger domain reads fencepost bytes as set words. A dense frame disagreeing
        // with `N` breaks the region's stride equation.
        let (flags, _) =
            DenseBitSlice::<OntologyRowId>::try_from_prefix(&map.map().bytes()[PAGE_BYTES..])
                .map_err(OpenPostingsError::Flags)?;
        let types = map.header().types();
        let domain = flags.domain_size();
        if domain != types {
            return Err(OpenPostingsError::FlagsDomain { types, domain });
        }

        let header = map.header();
        let flagged = flags.count();
        if flagged != header.dense_types() {
            return Err(OpenPostingsError::DenseCount {
                header: header.dense_types(),
                flagged,
            });
        }

        let bytes = map.map().region(
            header
                .dense_sets_offset()
                .expect("the length equation validated the geometry"),
            header
                .dense_sets_len()
                .expect("the length equation validated the geometry"),
        );
        DenseBitSliceArray::<BasePosition>::try_from_bytes(
            bytes,
            header.points(),
            header.dense_types(),
        )
        .map_err(OpenPostingsError::DenseSets)?;

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Returns the type count `T`.
    #[inline]
    #[must_use]
    pub(crate) fn types(&self) -> u64 {
        self.header().types()
    }

    /// Returns the point count `N`.
    #[inline]
    #[must_use]
    pub(crate) fn points(&self) -> u64 {
        self.header().points()
    }

    /// Views the representation flags: the set of types whose membership is a dense set.
    #[must_use]
    pub(crate) fn flags(&self) -> &DenseBitSlice<OntologyRowId> {
        let bytes = &self.map.map().bytes()[PAGE_BYTES..];
        DenseBitSlice::try_from_prefix(bytes)
            .expect("open validated the frame")
            .0
    }

    /// Views the `T + 1` list fenceposts, in entry counts.
    #[must_use]
    pub(crate) fn list_posts(&self) -> &[U64<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .list_posts_offset()
                .expect("open validated the geometry"),
            self.posts_bytes(),
        );

        <[U64<LE>]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of byte-order integers, which tolerate any alignment"
            )
        })
    }

    /// Views the `T + 1` parent fenceposts, in id counts.
    #[must_use]
    pub(crate) fn parent_posts(&self) -> &[U64<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .parent_posts_offset()
                .expect("open validated the geometry"),
            self.posts_bytes(),
        );

        <[U64<LE>]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of byte-order integers, which tolerate any alignment"
            )
        })
    }

    /// Views the `P` parent ids, type-major.
    #[must_use]
    pub(crate) fn parent_ids(&self) -> &[OntologyRowId] {
        let bytes = self.map.map().region(
            self.header()
                .parent_ids_offset()
                .expect("open validated the geometry"),
            self.header().parent_edges() * size_of::<OntologyRowId>() as u64,
        );

        <[OntologyRowId]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of little-endian ids, which tolerate any alignment"
            )
        })
    }

    /// Views the `N + 1` direct fenceposts, in id counts.
    #[must_use]
    pub(crate) fn direct_posts(&self) -> &[U64<LE>] {
        let header = self.header();
        let bytes = self.map.map().region(
            header
                .direct_posts_offset()
                .expect("open validated the geometry"),
            header
                .direct_fencepost_count()
                .expect("open validated the geometry")
                * size_of::<u64>() as u64,
        );

        <[U64<LE>]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of byte-order integers, which tolerate any alignment"
            )
        })
    }

    /// Views the `M` direct ids, position-major.
    #[must_use]
    pub(crate) fn direct_ids(&self) -> &[OntologyRowId] {
        let bytes = self.map.map().region(
            self.header()
                .direct_ids_offset()
                .expect("open validated the geometry"),
            self.header().direct_entries() * size_of::<OntologyRowId>() as u64,
        );

        <[OntologyRowId]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of little-endian ids, which tolerate any alignment"
            )
        })
    }

    /// Views the dense region: one membership frame per dense type, ascending type order.
    #[must_use]
    pub(crate) fn dense_sets(&self) -> &DenseBitSliceArray<BasePosition> {
        let header = self.header();
        let bytes = self.map.map().region(
            header
                .dense_sets_offset()
                .expect("open validated the geometry"),
            header
                .dense_sets_len()
                .expect("open validated the geometry"),
        );

        // SAFETY: Open validated this exact region against the header's domain and count, so the
        // re-borrow walks no frame.
        unsafe { DenseBitSliceArray::from_bytes_unchecked(bytes) }
    }

    /// Views the `L` list entries, type-major.
    #[must_use]
    pub(crate) fn list_entries(&self) -> &[BasePosition] {
        let bytes = self.map.map().region(
            self.header()
                .list_entries_offset()
                .expect("open validated the geometry"),
            self.header().list_entries() * size_of::<BasePosition>() as u64,
        );

        <[BasePosition]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of little-endian positions, which tolerate any \
                 alignment"
            )
        })
    }

    /// Returns the byte size of one fencepost region.
    fn posts_bytes(&self) -> u64 {
        self.header()
            .fencepost_count()
            .expect("open validated the geometry")
            * size_of::<u64>() as u64
    }
}
