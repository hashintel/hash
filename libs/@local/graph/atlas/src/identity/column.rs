//! Validated column views over array artifacts.

use core::marker::PhantomData;

use super::NodeRowId;
use crate::{file::array::ArrayFile, math::Vec2};

/// An element type an array artifact can be viewed as.
///
/// Implementations name the container's typed accessors; [`Column`] turns their per-call
/// [`Option`] into a construction-time proof.
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

impl Element for [NodeRowId; 2] {
    fn view(file: &ArrayFile) -> Option<&[Self]> {
        // A row id is its little-endian encoding: the transmute
        // relabels equal layouts, element by element.
        let pairs = file.u64_le_pairs()?;
        Some(zerocopy::transmute_ref!(pairs))
    }
}

/// One array artifact proven to hold elements of type `T`.
///
/// Construction validates the recorded element shape once, so views are infallible for the value's
/// lifetime: the file is immutable after open and the shape cannot change under it.
#[derive(Debug)]
pub(crate) struct Column<T> {
    file: ArrayFile,
    element: PhantomData<T>,
}

impl<T: Element> Column<T> {
    /// Proves `file` holds elements of type `T`.
    ///
    /// Returns [`None`] when the recorded element type or shape differs.
    pub(crate) fn new(file: ArrayFile) -> Option<Self> {
        T::view(&file)?;

        Some(Self {
            file,
            element: PhantomData,
        })
    }

    /// Views the elements.
    pub(crate) fn view(&self) -> &[T] {
        T::view(&self.file).expect("construction validated the element shape")
    }

    /// Counts the elements.
    pub(crate) fn len(&self) -> usize {
        self.view().len()
    }
}
