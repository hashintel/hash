//! Page-aligned region infrastructure shared by the artifact file formats.
//!
//! Every artifact file in [`crate::file`] follows one shape. A header page comes first, then data
//! regions in a fixed order, each starting on a [`PAGE`] boundary and zero padded up to the next.
//! This module carries the pieces of that shape every format otherwise restates:
//!
//! - [`padded_size`] is the checked arithmetic step of a header's offset chain - one region's byte
//!   size rounded to the boundary its successor starts on.
//! - [`write_region`] and [`write_padding`] produce a region's bytes and the zero padding that
//!   closes it, so a writer states its regions in order and never derives padding from offsets.
//! - [`PageMap`] is the read-side mapping, which states the safety argument for mapping published
//!   files once and provides the header-page slice and the region carving every reader repeats.
//!
//! Each format keeps its own header type, geometry validation, and error vocabulary. This module
//! never inspects what a region holds.

use std::{
    fs::{self, File},
    io,
    path::Path,
};

use memmap2::Mmap;
use zerocopy::{FromBytes, Immutable, IntoBytes, KnownLayout, Unaligned};

/// A byte-level stable element of a persisted region.
///
/// One whose value is exactly its bytes, at any alignment.
///
/// Identity columns and other opaque records persist as raw bytes and read back as typed slices
/// straight from a mapping. This alias names the capability stack that contract needs in one place.
/// The blanket implementation makes the alias free to adopt: any type with the constituent traits
/// already is one.
pub(crate) trait ByteStable:
    Copy + Sync + IntoBytes + FromBytes + Immutable + Unaligned + KnownLayout
{
}

impl<T: Copy + Sync + IntoBytes + FromBytes + Immutable + Unaligned + KnownLayout> ByteStable
    for T
{
}

/// One page, the size of every format's header and the boundary every data region starts on.
pub(crate) const PAGE: u64 = 4096;

/// [`PAGE`] as a slice length.
pub(crate) const PAGE_BYTES: usize = match usize::try_from(PAGE) {
    Ok(bytes) => bytes,
    Err(_) => panic!("PAGE overflow"),
};

/// The padded byte size of a region of `count` elements `width` bytes wide.
///
/// The exact size rounded up to the next [`PAGE`] boundary.
///
/// A region's successor starts this many bytes after it in the file, which makes the sum of a
/// header page and the padded sizes of the preceding regions an offset chain. Returns `None` when
/// the size overflows `u64`.
pub(crate) const fn padded_size(count: u64, width: u64) -> Option<u64> {
    count.checked_mul(width)?.checked_next_multiple_of(PAGE)
}

/// Writes one page-aligned region: `bytes`, then the zero padding up to the next [`PAGE`] boundary.
///
/// # Errors
///
/// Returns the error of the underlying writes.
pub(crate) fn write_region(mut write: impl io::Write, bytes: &[u8]) -> io::Result<()> {
    write.write_all(bytes)?;
    write_padding(write, bytes.len() as u64)
}

/// Writes the zero padding that closes a region of `len` bytes at the next [`PAGE`] boundary.
///
/// A region whose size already sits on the boundary closes with no padding at all. This is the
/// streaming counterpart of [`write_region`] for regions produced element by element rather than as
/// one slice.
///
/// # Errors
///
/// Returns the error of the underlying write.
pub(crate) fn write_padding(mut write: impl io::Write, len: u64) -> io::Result<()> {
    let zeros = [0_u8; PAGE_BYTES];
    let padding = len.next_multiple_of(PAGE) - len;
    write.write_all(&zeros[..usize::try_from(padding).expect("padding stays below one page")])
}

/// A memory-mapped artifact file.
///
/// Published artifact files are immutable under the publish contract of [`crate::file`], so the
/// borrowed bytes cannot change beneath a reader. The map holds the file and a shared advisory lock
/// for its whole lifetime, so a cooperating writer that takes an exclusive lock cannot truncate or
/// rewrite the inode beneath a live mapping. [`Self::region`] carves the page-aligned data regions
/// out of the mapping once a format's own validation has accepted the geometry they come from.
#[derive(Debug)]
pub(crate) struct PageMap {
    map: Mmap,
    /// Holds the shared advisory lock; dropped after `map`, releasing the lock at close.
    _file: File,
}

impl PageMap {
    /// Opens, locks, and maps the file at `path`.
    ///
    /// # Errors
    ///
    /// Returns the error when opening, locking, or mapping the file fails. A published file never
    /// carries an exclusive lock, so a lock that would block reports [`io::ErrorKind::WouldBlock`]
    /// instead of waiting.
    pub(crate) fn open(path: impl AsRef<Path>) -> io::Result<Self> {
        let file = File::open(path)?;
        file.try_lock_shared().map_err(|error| match error {
            fs::TryLockError::Error(error) => error,
            fs::TryLockError::WouldBlock => io::Error::new(
                io::ErrorKind::WouldBlock,
                "the artifact file is exclusively locked",
            ),
        })?;
        // SAFETY: published artifact files are immutable. The `crate::file` publish contract writes
        // to a temporary path and renames it into place without ever rewriting the file. The mapped
        // bytes therefore cannot change beneath the borrow. The shared advisory lock held for the
        // mapping's lifetime makes a cooperating in-place writer's exclusive lock fail instead of
        // invalidating the borrow.
        let map = unsafe { Mmap::map(&file) }?;
        Ok(Self { map, _file: file })
    }

    /// The full mapping.
    pub(crate) fn bytes(&self) -> &[u8] {
        &self.map
    }

    /// The mapped length in bytes.
    pub(crate) fn len(&self) -> u64 {
        self.map.len() as u64
    }

    /// The leading header page, when the mapping holds one.
    pub(crate) fn header_page(&self) -> Option<&[u8]> {
        self.map.get(..PAGE_BYTES)
    }

    /// Slices `len` bytes of the mapping at `offset`.
    ///
    /// # Panics
    ///
    /// This panics when the region escapes the mapping. Offsets and lengths repeat checked
    /// computations the format's open already accepted against the file length, so a validated
    /// caller never reaches the panic.
    pub(crate) fn region(&self, offset: u64, len: u64) -> &[u8] {
        let offset = usize::try_from(offset).expect("a mapped offset fits the address space");
        let len = usize::try_from(len).expect("a mapped region fits the address space");
        &self.map[offset..offset + len]
    }
}

pub(crate) mod header;
#[cfg(test)]
mod tests;
