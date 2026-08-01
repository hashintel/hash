//! Opened policy files.

use core::{error::Error, fmt};
use std::{io, path::Path};

use zerocopy::{
    FromBytes as _, TryFromBytes as _,
    error::{ConvertError, ValidityError},
};

use super::{FileHeader, PolicyRow};
use crate::file::region::PageMap;

/// Opening a policy file failed.
#[derive(Debug)]
pub enum OpenPolicyError {
    /// Opening or mapping the file failed.
    Io(io::Error),
    /// The file ends before one full header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header(ValidityError<(), FileHeader>),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes.
        ///
        /// [`None`] when the header's geometry overflows `u64`, in which case it matches no real
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
/// Opening parses the header and checks the format's single structural rule, so an open file always
/// describes its own region exactly. Row views borrow straight from the whole-file mapping.
/// The accessor exposes geometry alone; the table's domain invariants are `salt::policy`'s artifact
/// contract.
#[derive(Debug)]
pub(crate) struct PolicyFile {
    map: PageMap,
}

impl PolicyFile {
    /// Opens and maps the policy file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenPolicyError::Io`] when opening or mapping the file fails,
    /// [`OpenPolicyError::Header`] when its leading bytes are not a header this module speaks, and
    /// [`OpenPolicyError::Length`] when the file length contradicts the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenPolicyError> {
        let map = PageMap::open(path).map_err(OpenPolicyError::Io)?;

        let Some(bytes) = map.header_page() else {
            return Err(OpenPolicyError::Undersized { actual: map.len() });
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
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenPolicyError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Views the policy rows.
    #[must_use]
    pub(crate) fn rows(&self) -> &[PolicyRow] {
        <[PolicyRow]>::ref_from_bytes(&self.map.bytes()[FileHeader::SIZE..])
            .expect("open validated the region size against the header's count")
    }
}
