//! Validated column views over array artifacts.

use core::{error::Error, fmt, marker::PhantomData};
use std::path::Path;

use hashql_core::id::{Id, IdSlice};
use zerocopy::{FromBytes, KnownLayout};

use crate::file::{
    ArtifactFile,
    array::{ArrayFile, ColumnScalar, InvalidColumnError, OpenArrayError},
};

/// Opening a typed column over an array artifact failed.
#[derive(Debug)]
pub(crate) enum OpenColumnError {
    /// The array file failed to open.
    Open(OpenArrayError),
    /// The file's element stamp is not the column's.
    Invalid(InvalidColumnError),
}

const impl From<OpenArrayError> for OpenColumnError {
    fn from(error: OpenArrayError) -> Self {
        Self::Open(error)
    }
}

const impl From<InvalidColumnError> for OpenColumnError {
    fn from(error: InvalidColumnError) -> Self {
        Self::Invalid(error)
    }
}

impl fmt::Display for OpenColumnError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open(error) => write!(fmt, "the array file failed to open: {error}"),
            Self::Invalid(error) => {
                write!(
                    fmt,
                    "the array's element stamp is not the column's: {error}"
                )
            }
        }
    }
}

impl Error for OpenColumnError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Open(error) => Some(error),
            Self::Invalid(error) => Some(error),
        }
    }
}

/// One array artifact proven to hold elements of type `T`, indexed by the id domain `I`.
///
/// Construction validates the recorded element stamp once through [`ArrayFile::column`]. Views
/// are then infallible for the value's lifetime: the file is immutable after open and the shape
/// cannot change under it. The index domain is the column's position vocabulary, the id a caller
/// must hold to read an element. A call site cannot mix a column over one domain with a column
/// over another.
#[derive(Debug)]
pub(crate) struct Column<I, T> {
    file: ArrayFile,
    domain: PhantomData<fn(I) -> T>,
}

impl<I, T> ArtifactFile for Column<I, T>
where
    I: Id,
    T: ColumnScalar + FromBytes + KnownLayout,
{
    type Error = OpenColumnError;

    fn open(path: impl AsRef<Path>) -> Result<Self, Self::Error>
    where
        Self: Sized,
    {
        let file = ArrayFile::open(path)?;
        Self::new(file).map_err(From::from)
    }
}

impl<I, T> Column<I, T>
where
    I: Id,
    T: ColumnScalar + FromBytes + KnownLayout,
{
    /// Proves `file` holds elements of type `T`.
    ///
    /// # Errors
    ///
    /// Returns the [`InvalidColumnError`] when the file's element stamp is not `T`'s.
    pub(crate) fn new(file: ArrayFile) -> Result<Self, InvalidColumnError> {
        let _: &IdSlice<I, T> = file.column()?;

        Ok(Self {
            file,
            domain: PhantomData,
        })
    }

    /// Views the elements, indexed by the column's id domain.
    pub(crate) fn view(&self) -> &IdSlice<I, T> {
        self.file
            .column()
            .expect("construction validated the element stamp")
    }

    /// Counts the elements.
    pub(crate) fn len(&self) -> usize {
        self.view().len()
    }
}
