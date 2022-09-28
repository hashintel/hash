//! Iterators over [`Frame`]s.

use alloc::{vec, vec::Vec};
#[cfg(nightly)]
use core::marker::PhantomData;
use core::{
    fmt,
    fmt::Formatter,
    iter::FusedIterator,
    slice::{Iter, IterMut},
};

use crate::Frame;

/// Helper function, which is used in both [`Frames`] and [`FramesMut`].
///
/// To traverse the frames, the following algorithm is used:
/// Given a list of iterators, take the last iterator, and use items from it until the iterator has
/// been exhausted. If that is the case (it returned `None`), remove the iterator from the list,
/// and continue with the next iterator until all iterators are exhausted.
///
/// # Example
///
/// ```text
/// 1) Out: - Stack: [A, G]
/// 2) Out: A Stack: [G] [B, C]
/// 3) Out: B Stack: [G] [E] [C, D]
/// 4) Out: C Stack: [G] [E] [D]
/// 4) Out: D Stack: [G] [E]
/// 5) Out: E Stack: [G] [F]
/// 6) Out: F Stack: [G]
/// 7) Out: G Stack: [H]
/// 8) Out: H Stack: -
/// ```
fn next<I: Iterator<Item = T>, T>(iter: &mut Vec<I>) -> Option<T> {
    let out;
    loop {
        let last = iter.last_mut()?;

        if let Some(next) = last.next() {
            out = next;
            break;
        }

        // exhausted, therefore cannot be used anymore.
        iter.pop();
    }

    Some(out)
}

/// Iterator over the [`Frame`] stack of a [`Report`].
///
/// This uses an implementation of the Pre-Order, NLR Depth-First Search algorithm to resolve the
/// tree.
///
/// Use [`Report::frames()`] to create this iterator.
///
/// # Example
///
/// This shows in numbers the index of the different depths, using this it's possible to linearize
/// all frames and sort topologically, meaning that this ensures no child ever is before its parent.
///
/// Iterating the following report will return the frames in alphabetical order:
///
/// ```text
/// A
/// ╰┬▶ B
///  │  ╰┬▶ C
///  │   ╰▶ D
///  ╰▶ E
///     ╰─▶ F
/// G
/// ╰─▶ H
/// ```
///
/// [`Report`]: crate::Report
/// [`Report::frames()`]: crate::Report::frames
#[must_use]
#[derive(Clone)]
pub struct Frames<'r> {
    stack: Vec<Iter<'r, Frame>>,
}

impl<'r> Frames<'r> {
    pub(crate) fn new(frames: &'r [Frame]) -> Self {
        Self {
            stack: vec![frames.iter()],
        }
    }
}

impl<'r> Iterator for Frames<'r> {
    type Item = &'r Frame;

    fn next(&mut self) -> Option<Self::Item> {
        let frame = next(&mut self.stack)?;

        self.stack.push(frame.sources().iter());
        Some(frame)
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
///
/// [`Report`]: crate::Report
/// [`Report::frames_mut()`]: crate::Report::frames_mut
#[must_use]
pub struct FramesMut<'r> {
    stack: Vec<IterMut<'r, Frame>>,
}

impl<'r> FramesMut<'r> {
    pub(crate) fn new(frames: &'r mut [Frame]) -> Self {
        Self {
            stack: vec![frames.iter_mut()],
        }
    }
}

impl<'r> Iterator for FramesMut<'r> {
    type Item = &'r mut Frame;

    fn next(&mut self) -> Option<Self::Item> {
        let frame = next(&mut self.stack)?;
        let frame: *mut Frame = frame;

        // SAFETY:
        // We require both mutable access to the frame for all sources (as a mutable iterator) and
        // we need to return the mutable frame itself. We will never access the same value twice,
        // and only store their mutable iterator until the next `next()` call. This function acts
        // like a dynamic chain of multiple `IterMut`. The borrow checker is unable to prove that
        // subsequent calls to `next()` won't access the same data.
        // NB: It's almost never possible to implement a mutable iterator without `unsafe`.
        unsafe {
            self.stack.push((*frame).sources_mut().iter_mut());

            Some(&mut *frame)
        }
    }
}

impl<'r> FusedIterator for FramesMut<'r> {}

/// Iterator over requested references in the [`Frame`] stack of a [`Report`].
///
/// Use [`Report::request_ref()`] to create this iterator.
///
/// [`Report`]: crate::Report
/// [`Report::request_ref()`]: crate::Report::request_ref
#[must_use]
#[cfg(nightly)]
pub struct RequestRef<'r, T: ?Sized> {
    frames: Frames<'r>,
    _marker: PhantomData<&'r T>,
}

#[cfg(nightly)]
impl<'r, T: ?Sized> RequestRef<'r, T> {
    pub(super) fn new(frames: &'r [Frame]) -> Self {
        Self {
            frames: Frames::new(frames),
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
///
/// [`Report`]: crate::Report
/// [`Report::request_value()`]: crate::Report::request_value
#[must_use]
#[cfg(nightly)]
pub struct RequestValue<'r, T> {
    frames: Frames<'r>,
    _marker: PhantomData<T>,
}

#[cfg(nightly)]
impl<'r, T> RequestValue<'r, T> {
    pub(super) fn new(frames: &'r [Frame]) -> Self {
        Self {
            frames: Frames::new(frames),
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
