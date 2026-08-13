//! The classifier file format for the fitted relation-policy model.
//!
//! Layout version 1 is mutable. Change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of every other version, which is the
//! intended failure mode. A fresh generation replaces the files a layout change strands.
//!
//! One fit produces the coefficient rows, the applicability moments, and the training distances
//! together. They have no meaning apart and every read takes them together, so the whole model
//! lives in one file and cannot fall out of sync. The header stores the scalar parameters, the
//! temperature and the intercepts. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTCLSF`                                |
//! | 8      | 4    | layout version, `u32` = 1                       |
//! | 12     | 4    | machine information, [`Machine`]                |
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
//! The layout version pins the class count to 3 and fixes the class schema with it, so a new schema
//! means a new layout rather than a runtime extension. All region offsets derive from `D` and `T`
//! with checked arithmetic ([`FileHeader::expected_file_len`]); a header whose geometry overflows
//! matches no real file. Every region starts on a 4096-byte boundary, so the whole-file-mapping
//! alignment guarantee of the array format applies unchanged. Map the whole file and slice, never
//! mmap at a file offset.
//!
//! The header's scalar parameters pin little-endian, while the regions store the writer's native
//! byte order. The header's machine information ([`Machine`]) records which order that is, and
//! opening refuses a mismatch, so a cross-endian file fails by name instead of being
//! reinterpreted.
//!
//! [`read::ClassifierFile`] opens a file under these rules and hands out the raw typed regions;
//! [`write::write_regions`] streams them into place. The format owns geometry alone - the model's
//! domain invariants (finite parameters, positive temperature, positive inverse scales, sorted
//! nonnegative distances) are `salt::policy::classifier`'s artifact contract, validated where the
//! domain types live.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the fields are little endian, while the magic discriminant stores native endian, so \
              a cross-endian reader fails loudly at the magic instead of misreading fields"
)]

use core::fmt;

use zerocopy::{F64, LE, U64, Unalign};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

use crate::file::region::{
    PAGE,
    header::header,
    machine::{Architecture, Machine},
    padded_size,
};

/// Geometry classes per model: pinned by the layout version.
pub(crate) const CLASSES: usize = 3;

// The single variant makes the derive validate the discriminant, so parsing admits exactly the
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
/// Byte-level construction admits no other value. Increment this on any layout change.
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
    V1 = 1,
}

/// The header of a classifier file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(C)]
pub(crate) struct FileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    machine: Machine,
    dimension: U64<LE>,
    distances: U64<LE>,
    temperature: F64<LE>,
    intercepts: [F64<LE>; CLASSES],
}

header!(FileHeader);

impl FileHeader {
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
            version: Unalign::new(Version::V1),
            machine: Machine::current(),
            dimension: U64::new(dimension),
            distances: U64::new(distances),
            temperature: F64::new(temperature),
            intercepts: [
                F64::new(intercepts[0]),
                F64::new(intercepts[1]),
                F64::new(intercepts[2]),
            ],
        }
    }

    /// Returns the byte order the file's writer stamped.
    #[inline]
    #[must_use]
    pub(crate) const fn architecture(&self) -> Architecture {
        self.machine.architecture()
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
    pub(crate) const fn mean_offset(&self) -> Option<u64> {
        PAGE.checked_add(padded_size(CLASSES as u64, self.vector_bytes()?)?)
    }

    /// Returns the offset of the inverse-scales region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn inverse_scales_offset(&self) -> Option<u64> {
        self.mean_offset()?
            .checked_add(padded_size(1, self.vector_bytes()?)?)
    }

    /// Returns the offset of the distances region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn distances_offset(&self) -> Option<u64> {
        self.inverse_scales_offset()?
            .checked_add(padded_size(1, self.vector_bytes()?)?)
    }

    /// Returns the exact file length the header describes.
    ///
    /// The open path rejects a file whose length differs from this value. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) const fn expected_file_len(&self) -> Option<u64> {
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
            .field("machine", &self.machine)
            .field("dimension", &self.dimension)
            .field("distances", &self.distances)
            .field("temperature", &self.temperature)
            .field("intercepts", &self.intercepts)
            .finish_non_exhaustive()
    }
}
