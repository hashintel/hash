//! The classifier file: the fitted relation-policy model in one file.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what the pipeline needs and
//! increment [`Version`] when you do. The pinned parse rejects bytes of other versions, which is
//! the intended failure mode; no migration or compatibility machinery exists on purpose until the
//! format stabilizes.
//!
//! This is a combined file: the coefficient rows, the applicability moments, and the training
//! distances are fitted together, meaningless apart, and always read together, so the whole model
//! lives in one file and cannot fall out of sync. The scalar parameters - temperature and
//! intercepts - ride in the header. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTCLSF`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 4    | padding; writers emit zero, readers ignore      |
//! | 16     | 8    | embedding dimension `D`, `u64`                  |
//! | 24     | 8    | training-distance count `T`, `u64`              |
//! | 32     | 8    | calibration temperature, `f64`                  |
//! | 40     | 24   | intercepts, `f64[3]` in class order             |
//! | 64     | 4032 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | coefficients: `f64[3, D]` rows in class order;  |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | mean: `f64[D]` applicability training mean;     |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | inverse scales: `f64[D]` applicability inverse  |
//! |        |      | scales; zero padding to the next 4096-byte      |
//! |        |      | boundary                                        |
//! | ...    |      | distances: `f64[T]` sorted training distances   |
//! ```
//!
//! The class count 3 is pinned by the layout version: the class schema is versioned with the model,
//! and a new schema is a new layout, never a runtime extension. All region offsets derive from `D`
//! and `T` with checked arithmetic ([`FileHeader::expected_file_len`]); a header whose geometry
//! overflows matches no real file. Every region starts on a 4096-byte boundary, so the
//! whole-file-mapping alignment guarantee of the array format applies unchanged: map the whole file
//! and slice, never mmap at a file offset.
//!
//! [`read::ClassifierFile`] opens a file under these rules and hands out the raw typed regions;
//! [`write::write_regions`] streams them into place. The format owns geometry alone - the model's
//! domain invariants (finite parameters, positive temperature, positive inverse scales, sorted
//! nonnegative distances) are `salt::policy::classifier`'s artifact contract, validated where the
//! domain types live.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use zerocopy::{F64, LE, U32, U64, Unalign};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

use crate::file::region::{PAGE, padded_size};

// The shared page is the header's size; the offset chain and the
// write path both count regions from one header page.
const _: () = assert!(FileHeader::SIZE as u64 == PAGE);

/// Geometry classes per model: pinned by the layout version.
pub(crate) const CLASSES: usize = 3;

// A single-variant enum: the derive validates the discriminant, so parsing admits exactly the
// pinned magic value.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(u64)]
enum FileHeaderMagicInner {
    Classifier = u64::from_le_bytes(*b"SALTCLSF"),
}

/// The `SALTCLSF` magic. Byte-level construction admits no other value.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct FileHeaderMagic(FileHeaderMagicInner);

impl FileHeaderMagic {
    /// The only value.
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Classifier);
}

/// A layout version this module implements.
///
/// Byte-level construction admits no other value; increment on any layout change.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(u32)]
pub(crate) enum Version {
    V0 = 0,
}

/// The 4096-byte header of a classifier file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct FileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    /// Alignment filler so the counts sit on natural boundaries.
    reserved: U32<LE>,
    dimension: U64<LE>,
    distances: U64<LE>,
    temperature: F64<LE>,
    intercepts: [F64<LE>; CLASSES],
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4032;
    /// Size of the header, and the offset of the coefficients region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for a `D = dimension` model whose applicability evidence holds `distances`
    /// training distances, with the scalar parameters verbatim.
    #[must_use]
    pub(crate) const fn new(
        dimension: u64,
        distances: u64,
        temperature: f64,
        intercepts: [f64; CLASSES],
    ) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            reserved: U32::new(0),
            dimension: U64::new(dimension),
            distances: U64::new(distances),
            temperature: F64::new(temperature),
            intercepts: [
                F64::new(intercepts[0]),
                F64::new(intercepts[1]),
                F64::new(intercepts[2]),
            ],
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the embedding dimension `D`.
    #[inline]
    #[must_use]
    pub(crate) const fn dimension(&self) -> u64 {
        self.dimension.get()
    }

    /// Returns the training-distance count `T`.
    #[inline]
    #[must_use]
    pub(crate) const fn distance_count(&self) -> u64 {
        self.distances.get()
    }

    /// Returns the calibration temperature verbatim.
    #[inline]
    #[must_use]
    pub(crate) const fn temperature(&self) -> f64 {
        self.temperature.get()
    }

    /// Returns the intercepts verbatim, in class order.
    #[inline]
    #[must_use]
    pub(crate) const fn intercepts(&self) -> [f64; CLASSES] {
        [
            self.intercepts[0].get(),
            self.intercepts[1].get(),
            self.intercepts[2].get(),
        ]
    }

    /// Returns the byte size of one `f64[D]` region.
    const fn vector_bytes(&self) -> Option<u64> {
        self.dimension().checked_mul(size_of::<f64>() as u64)
    }

    /// Returns the offset of the mean region.
    ///
    /// The coefficients region sits between the header and this offset, zero padded to the
    /// boundary. Returns `None` when the geometry overflows `u64`, in which case no real file
    /// matches the header.
    #[must_use]
    pub(crate) fn mean_offset(&self) -> Option<u64> {
        PAGE.checked_add(padded_size(CLASSES as u64, self.vector_bytes()?)?)
    }

    /// Returns the offset of the inverse-scales region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) fn inverse_scales_offset(&self) -> Option<u64> {
        self.mean_offset()?
            .checked_add(padded_size(1, self.vector_bytes()?)?)
    }

    /// Returns the offset of the distances region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) fn distances_offset(&self) -> Option<u64> {
        self.inverse_scales_offset()?
            .checked_add(padded_size(1, self.vector_bytes()?)?)
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns `None` when the geometry
    /// overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let distance_bytes = self.distance_count().checked_mul(size_of::<f64>() as u64)?;
        self.distances_offset()?.checked_add(distance_bytes)
    }
}

// Manual impl instead of a derive: `Unalign`'s `Debug` goes through
// `Deref` and would demand `Unaligned` of the pinned enums; `get` only
// needs `Copy`. No equality on purpose: callers compare the observable
// they mean.
impl fmt::Debug for FileHeader {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("FileHeader")
            .field("magic", &self.magic.get())
            .field("version", &self.version.get())
            .field("dimension", &self.dimension)
            .field("distances", &self.distances)
            .field("temperature", &self.temperature)
            .field("intercepts", &self.intercepts)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);
