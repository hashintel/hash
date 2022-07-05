//! Iterators over [`Frame`]s.

use alloc::{borrow::Cow, vec::Vec};
use core::{fmt, fmt::Formatter, iter::FusedIterator, marker::PhantomData};

use crate::{Frame, Report};

/// Iterator over the [`Frame`] stack of a [`Report`].
///
/// This uses an implementation of the Pre-Order,
/// NLR Depth-First Search algorithm to resolve the tree.
/// The example below shows in numbers the index of the different depths,
/// using this we're able to linearize all frames and sort topologically, meaning that
/// this ensures no child ever is before it's parent.
///
/// ```text
///      1
///     / \
///    2   6
///  / | \  \
/// 3  4  5  7
/// ```
///
///
/// Use [`Report::frames()`] to create this iterator.
#[must_use]
#[derive(Clone)]
pub struct Frames<'r> {
    stack: Vec<&'r Frame>,

    #[cfg(not(feature = "small"))]
    source: Option<&'r Vec<Frame>>,
    #[cfg(feature = "small")]
    source: Option<&'r smallvec::SmallVec<[Frame; 1]>>,
}

impl<'r> Frames<'r> {
    pub(crate) const fn new<C>(report: &'r Report<C>) -> Self {
        // we cannot use .frames.iter().rev().collect() here, due to the const context

        Self {
            stack: Vec::new(),
            source: Some(&report.frames),
        }
    }
}

impl<'r> Iterator for Frames<'r> {
    type Item = &'r Frame;

    /// We use a reversed stack of the implementation, considering the following tree:
    ///
    /// ```text
    ///     A     G
    ///    / \    |
    ///   B   C   H
    ///  / \  |
    /// D   E F
    /// ```
    ///
    /// The algorithm will create the following through iteration:
    ///
    /// ```text
    /// 1) Out: - Stack: GA
    /// 2) Out: A Stack: GCB
    /// 3) Out: B Stack: GCED
    /// 4) Out: D Stack: GCE
    /// 4) Out: E Stack: GC
    /// 5) Out: C Stack: GF
    /// 6) Out: F Stack: G
    /// 7) Out: G Stack: H
    /// 8) Out: H Stack: -
    /// ```
    fn next(&mut self) -> Option<Self::Item> {
        // this delays the conversion from slice to Vec, we cannot do this in new, due to the fact
        // that Vec::push() is not const, nor are iter methods.
        if let Some(source) = self.source.take() {
            self.stack.extend(source.iter().rev());
        }

        if let Some(frame) = self.stack.pop() {
            self.stack.extend(frame.sources().iter().rev());

            Some(frame)
        } else {
            None
        }
    }
}

impl<'r> FusedIterator for Frames<'r> {}

impl fmt::Debug for Frames<'_> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}

/// Iterator over the mutable [`Frame`] stack of a [`Report`].
///
/// Use [`Report::frames_mut()`] to create this iterator.
#[must_use]
pub struct FramesMut<'r> {
    current: Vec<*mut Frame>,
    _marker: PhantomData<&'r mut Frame>,
}

impl<'r> FramesMut<'r> {
    pub(crate) fn new<C>(report: &'r mut Report<C>) -> Self {
        Self {
            current: report
                .frames
                .iter_mut()
                .map(|frame| frame as *mut Frame)
                .rev()
                .collect(),
            _marker: PhantomData,
        }
    }
}

impl<'r> Iterator for FramesMut<'r> {
    type Item = &'r mut Frame;

    fn next(&mut self) -> Option<Self::Item> {
        if let Some(frame) = self.current.pop() {
            // SAFETY: We require a mutable reference to `Report` to create `FramesMut` to get a
            // mutable reference to `Frame`.
            // The borrow checker is unable to prove that subsequent calls to `next()`
            // won't access the same data.
            // NB: It's almost never possible to implement a mutable iterator without `unsafe`.
            unsafe {
                self.current.extend(
                    (*frame)
                        .sources_mut()
                        .iter_mut()
                        .map(|frame| frame as *mut Frame)
                        .rev(),
                );
                Some(&mut *frame)
            }
        } else {
            None
        }
    }
}

impl<'r> FusedIterator for FramesMut<'r> {}

/// Iterator over requested references in the [`Frame`] stack of a [`Report`].
///
/// Use [`Report::request_ref()`] to create this iterator.
#[must_use]
#[cfg(nightly)]
pub struct RequestRef<'r, T: ?Sized> {
    frames: Frames<'r>,
    _marker: PhantomData<&'r T>,
}

#[cfg(nightly)]
impl<'r, T: ?Sized> RequestRef<'r, T> {
    pub(super) const fn new<Context>(report: &'r Report<Context>) -> Self {
        Self {
            frames: report.frames(),
            _marker: PhantomData,
        }
    }
}

#[cfg(nightly)]
impl<'r, T> Iterator for RequestRef<'r, T>
where
    T: ?Sized + 'static,
{
    type Item = &'r T;

    fn next(&mut self) -> Option<Self::Item> {
        self.frames.by_ref().find_map(Frame::request_ref)
    }
}

#[cfg(nightly)]
impl<'r, T> FusedIterator for RequestRef<'r, T> where T: ?Sized + 'static {}

#[cfg(nightly)]
impl<T: ?Sized> Clone for RequestRef<'_, T> {
    fn clone(&self) -> Self {
        Self {
            frames: self.frames.clone(),
            _marker: PhantomData,
        }
    }
}

#[cfg(nightly)]
impl<'r, T> fmt::Debug for RequestRef<'r, T>
where
    T: ?Sized + fmt::Debug + 'static,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}

/// Iterator over requested values in the [`Frame`] stack of a [`Report`].
///
/// Use [`Report::request_value()`] to create this iterator.
#[must_use]
#[cfg(nightly)]
pub struct RequestValue<'r, T> {
    frames: Frames<'r>,
    _marker: PhantomData<T>,
}

#[cfg(nightly)]
impl<'r, T> RequestValue<'r, T> {
    pub(super) const fn new<Context>(report: &'r Report<Context>) -> Self {
        Self {
            frames: report.frames(),
            _marker: PhantomData,
        }
    }
}

#[cfg(nightly)]
impl<'r, T> Iterator for RequestValue<'r, T>
where
    T: 'static,
{
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        self.frames.find_map(Frame::request_value)
    }
}

#[cfg(nightly)]
impl<'r, T> FusedIterator for RequestValue<'r, T> where T: 'static {}

#[cfg(nightly)]
impl<T> Clone for RequestValue<'_, T> {
    fn clone(&self) -> Self {
        Self {
            frames: self.frames.clone(),
            _marker: PhantomData,
        }
    }
}

#[cfg(nightly)]
impl<'r, T> fmt::Debug for RequestValue<'r, T>
where
    T: fmt::Debug + 'static,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}
