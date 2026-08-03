//! Opened policy files.

use core::{error::Error, fmt};
use std::path::Path;

use zerocopy::FromBytes as _;

use super::{FileHeader, PolicyRow};
use crate::file::region::{
    PAGE_BYTES,
    header::{HeaderError, HeaderMap},
};

/// Opening a policy file failed.
#[derive(Debug)]
pub enum OpenPolicyError {
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
}

impl fmt::Display for OpenPolicyError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the policy file's header page: {error}"),
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
            Self::Header(error) => Some(error),
            Self::Length { .. } => None,
        }
    }
}

/// A policy file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural rule, so an open file always
/// describes its own region exactly. Row views borrow straight from the whole-file mapping. The
/// accessor exposes geometry alone; the table's domain invariants are `salt::policy`'s artifact
/// contract.
#[derive(Debug)]
pub(crate) struct PolicyFile {
    map: HeaderMap<FileHeader>,
}

impl PolicyFile {
    /// Opens and maps the policy file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenPolicyError::Header`] when the header page cannot be read, and
    /// [`OpenPolicyError::Length`] when the file length contradicts the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenPolicyError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenPolicyError::Header)?;

        let expected = map.header().expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenPolicyError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Views the policy rows.
    #[must_use]
    pub(crate) fn rows(&self) -> &[PolicyRow] {
        <[PolicyRow]>::ref_from_bytes(&self.map.map().bytes()[PAGE_BYTES..])
            .expect("open validated the region size against the header's count")
    }
}
