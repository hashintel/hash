//! Opened policy files.

use core::{error::Error, fmt};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use zerocopy::{
    FromBytes as _, TryFromBytes as _,
    error::{ConvertError, ValidityError},
};

use super::{FileHeader, PolicyRow};

/// Opening a policy file failed.
#[derive(Debug)]
pub(crate) enum OpenPolicyError {
    /// The file could not be opened or mapped.
    Io(io::Error),
    /// The file is shorter than one header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header(ValidityError<(), FileHeader>),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes; [`None`] when the header's
        /// geometry overflows `u64`, in which case it matches no real
        /// file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenPolicyError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the policy file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => write!(
                fmt,
                "the leading bytes are not a policy file header: {error}",
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
                "the file holds {actual} bytes where the header describes no table",
            ),
        }
    }
}

impl Error for OpenPolicyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// A policy file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own region exactly. The
/// rows are borrowed straight from the whole-file mapping. The accessor
/// exposes geometry alone; the table's domain invariants are
/// `salt::policy`'s artifact contract.
#[derive(Debug)]
pub(crate) struct PolicyFile {
    map: Mmap,
}

impl PolicyFile {
    /// Opens and maps the policy file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenPolicyError::Io`] when the file cannot be opened
    /// or mapped, [`OpenPolicyError::Header`] when its leading bytes
    /// are not a header this module speaks, and
    /// [`OpenPolicyError::Length`] when the file length contradicts the
    /// header's geometry.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenPolicyError> {
        let file = File::open(path).map_err(OpenPolicyError::Io)?;
        // SAFETY: published artifact files are immutable (the `crate::file`
        // publish contract: temporary path, rename into place, never
        // rewritten), so the mapped bytes cannot change beneath the borrow.
        let map = unsafe { Mmap::map(&file) }.map_err(OpenPolicyError::Io)?;

        let Some(bytes) = map.get(..FileHeader::SIZE) else {
            return Err(OpenPolicyError::Undersized {
                actual: map.len() as u64,
            });
        };
        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenPolicyError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenPolicyError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Views the policy rows.
    #[must_use]
    pub(crate) fn rows(&self) -> &[PolicyRow] {
        <[PolicyRow]>::ref_from_bytes(&self.map[FileHeader::SIZE..])
            .expect("open validated the region size against the header's count")
    }
}
