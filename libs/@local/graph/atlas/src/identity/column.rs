//! Validated column views over array artifacts.

use core::marker::PhantomData;

use hashql_core::id::{Id, IdSlice};
use zerocopy::{FromBytes, KnownLayout};

use crate::file::array::{ArrayFile, ColumnScalar};

/// One array artifact proven to hold elements of type `T`, indexed by the id domain `I`.
///
/// Construction validates the recorded element stamp once through [`ArrayFile::column`], so views
/// are infallible for the value's lifetime: the file is immutable after open and the shape cannot
/// change under it. The index domain is the column's position vocabulary, the id a caller must
/// hold to read an element. A call site therefore cannot mix a column over one domain with a
/// column over another.
#[derive(Debug)]
pub(crate) struct Column<I, T> {
    file: ArrayFile,
    domain: PhantomData<fn(I) -> T>,
}

impl<I, T> Column<I, T>
where
    I: Id,
    T: ColumnScalar + FromBytes + KnownLayout,
{
    /// Proves `file` holds elements of type `T`.
    ///
    /// Returns [`None`] when the recorded element type or shape differs.
    pub(crate) fn new(file: ArrayFile) -> Option<Self> {
        let _: &IdSlice<I, T> = file.column()?;

        Some(Self {
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
