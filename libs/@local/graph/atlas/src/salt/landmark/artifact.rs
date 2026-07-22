//! The landmark skeleton's published form: one combined file and its mapped reader.
//!
//! A fitted skeleton - selection, assignment, and layout coordinates - publishes as one
//! [`crate::file::landmark`] file, so the three parts that share the ordinal vocabulary cannot fall
//! out of sync. [`LandmarkSkeletonArchive`] reopens the file over a whole-file mapping and
//! validates the skeleton invariants once, so training and serving read landmark data from the page
//! cache without holding it on the heap.

use core::{error::Error, fmt};
use std::io;

use zerocopy::{FromBytes as _, IntoBytes as _, LE, U32, U64};

use super::{
    assignment::LandmarkAssignment,
    select::{LandmarkOrdinal, LandmarkSelection},
};
use crate::{
    dataset::NodeRowId,
    file::{
        WriteInto,
        landmark::{read::LandmarkFile, write::write_regions},
    },
    integrity::{Sha256, Sha256Digest, Writer},
    math::Vec2,
};

/// An opened landmark file does not hold a valid skeleton.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum InvalidLandmarkFile {
    /// The selected rows break the strictly ascending order.
    UnorderedRows { ordinal: usize },
    /// An assignment entry lies outside the landmark domain.
    OrdinalOutOfDomain {
        row: usize,
        ordinal: u32,
        landmarks: u64,
    },
    /// A coordinate is NaN or infinite.
    NonFiniteCoordinate { ordinal: usize },
}

impl fmt::Display for InvalidLandmarkFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::UnorderedRows { ordinal } => write!(
                fmt,
                "the selected row at ordinal {ordinal} breaks the strictly ascending order",
            ),
            Self::OrdinalOutOfDomain {
                row,
                ordinal,
                landmarks,
            } => write!(
                fmt,
                "the assignment maps row {row} to ordinal {ordinal}, outside {landmarks} landmarks",
            ),
            Self::NonFiniteCoordinate { ordinal } => {
                write!(fmt, "the coordinate at ordinal {ordinal} is not finite")
            }
        }
    }
}

impl Error for InvalidLandmarkFile {}

/// A fitted landmark skeleton, assembled for publication.
///
/// The three parts share one ordinal vocabulary by construction: the assignment was built against
/// the selection (its ordinal domain is the selection's length), and the constructor pins the
/// coordinates to the same domain.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LandmarkSkeleton {
    selection: LandmarkSelection,
    assignment: LandmarkAssignment,
    coordinates: Box<[Vec2]>,
}

impl LandmarkSkeleton {
    /// Assembles a skeleton from one fit's stage outputs.
    ///
    /// # Panics
    ///
    /// Panics when the parts disagree on the landmark count or a coordinate is not finite; both
    /// violate the contracts of the stages that produced them.
    #[must_use]
    pub(crate) fn new(
        selection: LandmarkSelection,
        assignment: LandmarkAssignment,
        coordinates: Box<[Vec2]>,
    ) -> Self {
        assert_eq!(
            assignment.landmarks(),
            selection.len(),
            "the assignment's ordinal domain is the selection",
        );
        assert_eq!(
            coordinates.len(),
            selection.len(),
            "one coordinate per landmark",
        );
        assert!(
            coordinates
                .iter()
                .all(|point| point.x().is_finite() && point.y().is_finite()),
            "layout coordinates are finite",
        );

        Self {
            selection,
            assignment,
            coordinates,
        }
    }
}

impl WriteInto for LandmarkSkeleton {
    type Error = io::Error;

    /// Writes the skeleton as a landmark file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        let expect = "the persisted encodings are transparent over their byteorder types";
        let rows = <[U64<LE>]>::ref_from_bytes(self.selection.rows().as_bytes()).expect(expect);
        let assignment =
            <[U32<LE>]>::ref_from_bytes(self.assignment.as_slice().as_bytes()).expect(expect);
        write_regions(rows, assignment, &self.coordinates, &mut writer)?;

        Ok(writer.accumulator.finalize())
    }
}

/// A published landmark skeleton opened over its mapped file.
///
/// Construction checks the skeleton invariants once - node rows strictly ascending, every
/// assignment ordinal inside the landmark domain, every coordinate finite - so an open skeleton
/// only serves valid views and consumers re-validate nothing. The regions stay in the page cache
/// under memory pressure and off the heap.
#[derive(Debug)]
pub(crate) struct LandmarkSkeletonArchive {
    file: LandmarkFile,
}

impl LandmarkSkeletonArchive {
    /// Opens the skeleton over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file violates a skeleton invariant.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: LandmarkFile) -> Result<Self, InvalidLandmarkFile> {
        let landmarks = file.landmarks();

        let rows = file.selected_rows();
        if let Some(position) = rows
            .array_windows::<2>()
            .position(|[left, right]| left.get() >= right.get())
        {
            return Err(InvalidLandmarkFile::UnorderedRows {
                ordinal: position + 1,
            });
        }

        for (row, ordinal) in file.assignment().iter().enumerate() {
            if u64::from(ordinal.get()) >= landmarks {
                return Err(InvalidLandmarkFile::OrdinalOutOfDomain {
                    row,
                    ordinal: ordinal.get(),
                    landmarks,
                });
            }
        }

        for (ordinal, point) in file.coordinates().iter().enumerate() {
            if !(point.x().is_finite() && point.y().is_finite()) {
                return Err(InvalidLandmarkFile::NonFiniteCoordinate { ordinal });
            }
        }

        Ok(Self { file })
    }

    /// Returns the landmark count `M`.
    #[inline]
    #[must_use]
    pub(crate) fn landmarks(&self) -> u64 {
        self.file.landmarks()
    }

    /// Returns the corpus row count `N` the assignment covers.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.file.rows()
    }

    /// Views the selected node rows, strictly ascending: position `i` is landmark ordinal `i`.
    #[must_use]
    pub(crate) fn selected_rows(&self) -> &[NodeRowId] {
        <[NodeRowId]>::ref_from_bytes(self.file.selected_rows().as_bytes())
            .expect("the persisted encoding is transparent over its byteorder type")
    }

    /// Views the assignment.
    ///
    /// Entry `i` is node row `i`'s landmark ordinal, inside the landmark domain.
    #[must_use]
    pub(crate) fn assignment(&self) -> &[LandmarkOrdinal] {
        <[LandmarkOrdinal]>::ref_from_bytes(self.file.assignment().as_bytes())
            .expect("the persisted encoding is transparent over its byteorder type")
    }

    /// Views the layout coordinates, finite, in ordinal order.
    #[must_use]
    pub(crate) fn coordinates(&self) -> &[Vec2] {
        self.file.coordinates()
    }
}
