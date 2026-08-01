//! Validated column views over array artifacts.

use core::marker::PhantomData;

use hashql_core::id::{Id, IdSlice};

use super::{BasePosition, ImportanceRank, NodeRowId};
use crate::{file::array::ArrayFile, math::Vec2};

/// An element type an array artifact can yield.
///
/// Implementations name the container's typed accessors; [`Column`] turns their per-call [`Option`]
/// into a construction-time proof.
pub(crate) trait Element: Sized {
    /// Views the file's elements, [`None`] when the recorded element type or shape differs.
    fn view(file: &ArrayFile) -> Option<&[Self]>;
}

impl Element for Vec2 {
    fn view(file: &ArrayFile) -> Option<&[Self]> {
        file.points()
    }
}

impl Element for u32 {
    fn view(file: &ArrayFile) -> Option<&[Self]> {
        file.u32_elements()
    }
}

impl Element for BasePosition {
    fn view(file: &ArrayFile) -> Option<&[Self]> {
        let positions = file.u32_le_elements()?;
        // A position is its little-endian encoding: the transmute relabels equal layouts, element
        // by element.
        Some(zerocopy::transmute_ref!(positions))
    }
}

impl Element for ImportanceRank {
    fn view(file: &ArrayFile) -> Option<&[Self]> {
        let ranks = file.u32_le_elements()?;
        // A rank is its little-endian encoding: the transmute relabels equal layouts, element by
        // element.
        Some(zerocopy::transmute_ref!(ranks))
    }
}

impl Element for NodeRowId {
    fn view(file: &ArrayFile) -> Option<&[Self]> {
        let rows = file.u64_le_elements()?;
        // A row id is its little-endian encoding: the transmute relabels equal layouts, element by
        // element.
        Some(zerocopy::transmute_ref!(rows))
    }
}

impl Element for [NodeRowId; 2] {
    fn view(file: &ArrayFile) -> Option<&[Self]> {
        // A row id is its little-endian encoding: the transmute
        // relabels equal layouts, element by element.
        let pairs = file.u64_le_pairs()?;
        Some(zerocopy::transmute_ref!(pairs))
    }
}

/// One array artifact proven to hold elements of type `T`, indexed by the id domain `I`.
///
/// Construction validates the recorded element shape once, so views are infallible for the value's
/// lifetime: the file is immutable after open and the shape cannot change under it. The index
/// domain is the column's position vocabulary, the id a caller must hold to read an element. A call
/// site therefore cannot mix a column over one domain with a column over another.
#[derive(Debug)]
pub(crate) struct Column<I, T> {
    file: ArrayFile,
    domain: PhantomData<fn(I) -> T>,
}

impl<I: Id, T: Element> Column<I, T> {
    /// Proves `file` holds elements of type `T`.
    ///
    /// Returns [`None`] when the recorded element type or shape differs.
    pub(crate) fn new(file: ArrayFile) -> Option<Self> {
        T::view(&file)?;

        Some(Self {
            file,
            domain: PhantomData,
        })
    }

    /// Views the elements, indexed by the column's id domain.
    pub(crate) fn view(&self) -> &IdSlice<I, T> {
        IdSlice::from_raw(T::view(&self.file).expect("construction validated the element shape"))
    }

    /// Counts the elements.
    pub(crate) fn len(&self) -> usize {
        self.view().len()
    }
}
