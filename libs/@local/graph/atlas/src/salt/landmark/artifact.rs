//! The landmark skeleton's published form, one combined file and its mapped reader.
//!
//! A fitted skeleton - selection, assignment, and layout coordinates - publishes as one
//! [`crate::file::landmark`] file, so the three parts that share the ordinal vocabulary cannot fall
//! out of sync. [`LandmarkSkeletonArchive`] reopens the file over a whole-file mapping and
//! validates the skeleton invariants once, so training and serving read landmark data from the page
//! cache without holding it on the heap.

use core::{error::Error, fmt};
use std::io;

use hashql_core::id::{Id, IdSlice};
use zerocopy::{FromBytes as _, IntoBytes as _, LE, U32, U64};

use super::{
    assignment::LandmarkAssignment,
    select::{LandmarkOrdinal, LandmarkSelection},
};
use crate::{
    file::{
        WriteAs, WriteInto,
        landmark::{read::LandmarkFile, write::write_regions},
        region::ByteStable,
    },
    identity::NodeRowId,
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
/// Selection, assignment, and coordinates share one ordinal vocabulary by construction. The
/// assignment stage works from the selection, so the assignment's ordinal domain is the selection's
/// length, and the constructor pins the coordinates to the same domain.
#[derive(PartialEq)]
pub(crate) struct LandmarkSkeleton<N> {
    selection: LandmarkSelection<N>,
    assignment: LandmarkAssignment<N>,
    coordinates: Box<IdSlice<LandmarkOrdinal, Vec2>>,
}

impl<N> LandmarkSkeleton<N>
where
    N: Id,
{
    /// Assembles a skeleton from one fit's stage outputs.
    ///
    /// # Panics
    ///
    /// This panics when the parts disagree on the landmark count or a coordinate is not finite.
    /// Both cases violate the contracts of the stages that produced them.
    #[must_use]
    pub(crate) fn new(
        selection: LandmarkSelection<N>,
        assignment: LandmarkAssignment<N>,
        coordinates: Box<IdSlice<LandmarkOrdinal, Vec2>>,
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

    /// Views the selected node rows, strictly ascending, keyed by landmark ordinal.
    #[must_use]
    pub(crate) fn selected_rows(&self) -> &IdSlice<LandmarkOrdinal, N> {
        self.selection.rows()
    }

    /// Views the assignment: every node row's landmark ordinal, inside the landmark domain.
    #[must_use]
    pub(crate) fn assignment(&self) -> &IdSlice<N, LandmarkOrdinal> {
        self.assignment.as_slice()
    }

    /// Views the layout coordinates, finite, keyed by landmark ordinal.
    #[must_use]
    pub(crate) fn coordinates(&self) -> &IdSlice<LandmarkOrdinal, Vec2> {
        &self.coordinates
    }
}

impl<N: Id> fmt::Debug for LandmarkSkeleton<N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("LandmarkSkeleton")
            .field("selection", &self.selection)
            .field("assignment", &self.assignment)
            .field("coordinates", &self.coordinates)
            .finish()
    }
}

impl<N> WriteInto for LandmarkSkeleton<N>
where
    N: Id + ByteStable,
{
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
        let rows =
            <[U64<LE>]>::ref_from_bytes(self.selection.rows().as_raw().as_bytes()).expect(expect);
        let assignment =
            <[U32<LE>]>::ref_from_bytes(self.assignment.as_slice().as_raw().as_bytes())
                .expect(expect);
        write_regions(rows, assignment, self.coordinates.as_raw(), &mut writer)?;

        Ok(writer.accumulator.finalize())
    }
}

// The skeleton publishes over the corpus row domain alone: the constructor mapped selection and
// assignment onto first corpus rows before any write.
impl WriteAs<crate::file::salt::artifact::Landmarks> for LandmarkSkeleton<NodeRowId> {}

/// A published landmark skeleton opened over its mapped file.
///
/// Construction checks the skeleton invariants once. Node rows are strictly ascending, every
/// assignment ordinal lies inside the landmark domain, and every coordinate is finite. An open
/// skeleton therefore serves only valid views, and consumers re-validate nothing. The regions stay
/// in the page cache under memory pressure and off the heap.
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
    #[cfg(test)] // The landmark, file, and fit tests read the archive cross-module.
    pub(crate) fn landmarks(&self) -> u64 {
        self.file.landmarks()
    }

    /// Returns the corpus row count `N` the assignment covers.
    #[inline]
    #[must_use]
    #[cfg(test)] // The landmark, file, and fit tests read the archive cross-module.
    pub(crate) fn rows(&self) -> u64 {
        self.file.rows()
    }

    /// Views the selected node rows, strictly ascending, keyed by landmark ordinal.
    #[must_use]
    pub(crate) fn selected_rows(&self) -> &IdSlice<LandmarkOrdinal, NodeRowId> {
        IdSlice::from_raw(
            <[NodeRowId]>::ref_from_bytes(self.file.selected_rows().as_bytes())
                .expect("the persisted encoding is transparent over its byteorder type"),
        )
    }

    /// Views the assignment: every node row's landmark ordinal, inside the landmark domain.
    #[must_use]
    #[cfg(test)] // The landmark, file, and fit tests read the archive cross-module.
    pub(crate) fn assignment(&self) -> &IdSlice<NodeRowId, LandmarkOrdinal> {
        IdSlice::from_raw(
            <[LandmarkOrdinal]>::ref_from_bytes(self.file.assignment().as_bytes())
                .expect("the persisted encoding is transparent over its byteorder type"),
        )
    }

    /// Views the layout coordinates, finite, keyed by landmark ordinal.
    #[cfg(test)] // The landmark, file, and fit tests read the archive cross-module.
    #[must_use]
    pub(crate) fn coordinates(&self) -> &IdSlice<LandmarkOrdinal, Vec2> {
        IdSlice::from_raw(self.file.coordinates())
    }
}
