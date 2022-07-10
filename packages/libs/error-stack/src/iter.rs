//! Iterators over [`Frame`]s.

use alloc::{vec, vec::Vec};
use core::{
    fmt,
    fmt::Formatter,
    iter::FusedIterator,
    marker::PhantomData,
    slice::{Iter, IterMut},
};

use crate::{Frame, Report};

fn next<T: Iterator<Item = U>, U>(iter: &mut Vec<T>) -> Option<U> {
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
    stack: Vec<Iter<'r, Frame>>,
}

impl<'r> Frames<'r> {
    pub(crate) fn new<C>(report: &'r Report<C>) -> Self {
        // we cannot use .frames.iter().rev().collect() here, due to the const context

        Self {
            stack: vec![report.frames.iter()],
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
    /// 1) Out: - Stack: [A, G]
    /// 2) Out: A Stack: [G] [B, C]
    /// 3) Out: B Stack: [G] [C] [D, E]
    /// 4) Out: D Stack: [G] [C] [E]
    /// 4) Out: E Stack: [G] [C]
    /// 5) Out: C Stack: [G] [F]
    /// 6) Out: F Stack: [G]
    /// 7) Out: G Stack: [H]
    /// 8) Out: H Stack: -
    /// ```
    fn next(&mut self) -> Option<Self::Item> {
        // this delays the conversion from slice to Vec, we cannot do this in new, due to the fact
        // that Vec::push() is not const, nor are iter methods.

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
#[must_use]
pub struct FramesMut<'r> {
    stack: Vec<IterMut<'r, Frame>>,
    _marker: PhantomData<&'r mut Frame>,
}

impl<'r> FramesMut<'r> {
    pub(crate) fn new<C>(report: &'r mut Report<C>) -> Self {
        Self {
            stack: vec![report.frames.iter_mut()],
            _marker: PhantomData,
        }
    }
}

impl<'r> Iterator for FramesMut<'r> {
    type Item = &'r mut Frame;

    fn next(&mut self) -> Option<Self::Item> {
        let frame: *mut Frame = next(&mut self.stack)?;

        // SAFETY: We require a mutable reference to `Report` to create `FramesMut` to get a
        // mutable reference to `Frame`.
        // The borrow checker is unable to prove that subsequent calls to `next()`
        // won't access the same data.
        // NB: It's almost never possible to implement a mutable iterator without `unsafe`.
        unsafe {
            self.stack.push((&mut *frame).sources_mut().iter_mut());

            Some(&mut *frame)
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
    pub(super) fn new<Context>(report: &'r Report<Context>) -> Self {
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
    pub(super) fn new<Context>(report: &'r Report<Context>) -> Self {
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

#[cfg(test)]
mod tests {
    use alloc::boxed::Box;
    use core::{iter::zip, panic::Location};

    use crate::{Frame, Report};

    #[allow(clippy::many_single_char_names)]
    fn build() -> Report<()> {
        let d = Frame::from_attachment('D', Location::caller(), Box::new([]));
        let e = Frame::from_attachment('E', Location::caller(), Box::new([]));
        let b = Frame::from_attachment('B', Location::caller(), Box::new([d, e]));
        let f = Frame::from_attachment('F', Location::caller(), Box::new([]));
        let c = Frame::from_attachment('C', Location::caller(), Box::new([f]));
        let a = Frame::from_attachment('A', Location::caller(), Box::new([b, c]));
        let h = Frame::from_attachment('H', Location::caller(), Box::new([]));
        let g = Frame::from_attachment('G', Location::caller(), Box::new([h]));

        let mut report: Report<()> = Report::from_frame(a);
        report.frames.push(g);

        report
    }

    /// Try to verify if the topological sorting is working, by trying to verify that
    /// ```text
    ///     A     G
    ///    / \    |
    ///   B   C   H
    ///  / \  |
    /// D   E F
    /// ```
    ///
    /// results in `ABDECFGH`
    #[test]
    fn iter() {
        let report = build();

        for (frame, &letter) in zip(
            report.frames(),
            ['A', 'B', 'D', 'E', 'C', 'F', 'G', 'H'].iter(),
        ) {
            let lhs = *frame.downcast_ref::<char>().unwrap();

            assert_eq!(lhs, letter);
        }
    }

    #[test]
    fn iter_mut() {
        let mut report = build();

        for (frame, &letter) in zip(
            report.frames_mut(),
            ['A', 'B', 'D', 'E', 'C', 'F', 'G', 'H'].iter(),
        ) {
            let lhs = *frame.downcast_ref::<char>().unwrap();

            assert_eq!(lhs, letter);
        }
    }
}
