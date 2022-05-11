use core::{fmt, fmt::Formatter, iter::FusedIterator, marker::PhantomData};

use super::Frame;
use crate::{Frames, Report, RequestRef, RequestValue};

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

impl<'r, T: ?Sized> RequestRef<'r, T> {
    pub(super) const fn new<Context>(report: &'r Report<Context>) -> Self {
        Self {
            frames: report.frames(),
            _marker: PhantomData,
        }
    }
}

impl<'r, T> Iterator for RequestRef<'r, T>
where
    T: ?Sized + 'static,
{
    type Item = &'r T;

    fn next(&mut self) -> Option<Self::Item> {
        self.frames.by_ref().find_map(Frame::request_ref)
    }
}

impl<'r, T> FusedIterator for RequestRef<'r, T> where T: ?Sized + 'static {}

impl<T: ?Sized> Clone for RequestRef<'_, T> {
    fn clone(&self) -> Self {
        Self {
            frames: self.frames.clone(),
            _marker: PhantomData,
        }
    }
}

impl<'r, T> fmt::Debug for RequestRef<'r, T>
where
    T: ?Sized + fmt::Debug + 'static,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}

impl<'r, T> RequestValue<'r, T> {
    pub(super) const fn new<Context>(report: &'r Report<Context>) -> Self {
        Self {
            frames: report.frames(),
            _marker: PhantomData,
        }
    }
}

impl<'r, T> Iterator for RequestValue<'r, T>
where
    T: 'static,
{
    type Item = T;

    fn next(&mut self) -> Option<Self::Item> {
        self.frames.by_ref().find_map(Frame::request_value)
    }
}

impl<'r, T> FusedIterator for RequestValue<'r, T> where T: 'static {}

impl<T> Clone for RequestValue<'_, T> {
    fn clone(&self) -> Self {
        Self {
            frames: self.frames.clone(),
            _marker: PhantomData,
        }
    }
}

impl<'r, T> fmt::Debug for RequestValue<'r, T>
where
    T: fmt::Debug + 'static,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}
