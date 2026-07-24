//! Validated column views over array artifacts.
//!
//! A generation's array artifacts share one container format, and each serving role reads its
//! artifact as one element type: wire coordinates as [`Vec2`] points, row and rank columns as
//! `u32` elements, the endpoint column as `[u64; 2]` pairs. [`Column`] pins that element type at
//! open: construction proves the artifact holds the role's shape, and every later
//! [`view`](Column::view) is a direct slice of the mapped bytes.

use core::marker::PhantomData;

use super::error::{ArrayKind, OpenAtlasError};
use crate::{dataset::NodeRowId, file::array::ArrayFile, math::Vec2};

/// An element type an array artifact can be viewed as.
///
/// Implementations name the container's typed accessors; [`Column`] turns their per-call
/// [`Option`] into a construction-time proof.
pub(super) trait Element: Sized {
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

impl Element for [u64; 2] {
    fn view(file: &ArrayFile) -> Option<&[Self]> {
        file.u64_pairs()
    }
}

impl Element for [NodeRowId; 2] {
    fn view(file: &ArrayFile) -> Option<&[Self]> {
        let pairs = file.u64_pairs()?;
        Some(zerocopy::transmute_ref!(pairs)) // NOTE: is this correct? LE vs. NE vs. etc.
    }
}

/// One array artifact proven to hold elements of type `T`.
///
/// Construction validates the recorded element shape once, so views are infallible for the value's
/// lifetime: the file is immutable after open and the shape cannot change under it.
#[derive(Debug)]
pub(super) struct Column<T> {
    file: ArrayFile,
    element: PhantomData<T>,
}

impl<T: Element> Column<T> {
    /// Proves `file` holds elements of type `T`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAtlasError::Shape`] naming `kind` when the recorded element type or shape
    /// differs.
    pub(super) fn new(file: ArrayFile, kind: ArrayKind) -> Result<Self, OpenAtlasError> {
        if T::view(&file).is_none() {
            return Err(OpenAtlasError::Shape { kind });
        }

        Ok(Self {
            file,
            element: PhantomData,
        })
    }

    /// Views the elements.
    pub(super) fn view(&self) -> &[T] {
        T::view(&self.file).expect("construction validated the element shape")
    }

    /// Counts the elements.
    pub(super) fn len(&self) -> usize {
        self.view().len()
    }
}
