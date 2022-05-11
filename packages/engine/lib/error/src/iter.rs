use core::{fmt, fmt::Formatter, iter::FusedIterator, marker::PhantomData};

use super::Frame;
use crate::{Frames, Report, Requests};

impl<'r> Frames<'r> {
    pub(super) const fn new<C>(report: &'r Report<C>) -> Self {
        Self {
            current: Some(&report.inner.frame),
        }
    }
}

impl<'r> Iterator for Frames<'r> {
    type Item = &'r Frame;

    fn next(&mut self) -> Option<Self::Item> {
        self.current.take().map(|current| {
            self.current = current.request_ref::<Frame>();
            current
        })
    }
}

impl<'r> FusedIterator for Frames<'r> {}

impl fmt::Debug for Frames<'_> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}

impl<'r, T: ?Sized> Requests<'r, T> {
    pub(super) const fn new<Context>(report: &'r Report<Context>) -> Self {
        Self {
            frames: report.frames(),
            _marker: PhantomData,
        }
    }
}

impl<'r, T> Iterator for Requests<'r, T>
where
    T: ?Sized + 'static,
{
    type Item = &'r T;

    fn next(&mut self) -> Option<Self::Item> {
        self.frames.by_ref().find_map(Frame::request_ref)
    }
}

impl<'r, T> FusedIterator for Requests<'r, T> where T: ?Sized + 'static {}

impl<T: ?Sized> Clone for Requests<'_, T> {
    fn clone(&self) -> Self {
        Self {
            frames: self.frames.clone(),
            _marker: PhantomData,
        }
    }
}

impl<'r, T> fmt::Debug for Requests<'r, T>
where
    T: ?Sized + fmt::Debug + 'static,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}
