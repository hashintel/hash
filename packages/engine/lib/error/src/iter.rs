use alloc::boxed::Box;
use core::{fmt, fmt::Formatter, iter::FusedIterator, marker::PhantomData};

use provider::TypeTag;

use super::Frame;
use crate::{Chain, Report, Request};

impl<'r> Chain<'r> {
    pub(super) const fn new<S>(report: &'r Report<S>) -> Self {
        Self {
            current: Some(&report.inner.error),
        }
    }
}

impl<'r> Iterator for Chain<'r> {
    type Item = &'r Frame;

    fn next(&mut self) -> Option<Self::Item> {
        self.current.take().map(|current| {
            self.current = current.source.as_ref().map(Box::as_ref);
            current
        })
    }
}

impl<'r> FusedIterator for Chain<'r> {}

impl fmt::Debug for Chain<'_> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}

impl<'r, I> Request<'r, I> {
    pub(super) const fn new<S>(report: &'r Report<S>) -> Self {
        Self {
            chain: report.chain(),
            _marker: PhantomData,
        }
    }
}

impl<'r, I: TypeTag<'r>> Iterator for Request<'r, I> {
    type Item = I::Type;

    fn next(&mut self) -> Option<Self::Item> {
        self.chain.by_ref().find_map(Frame::request::<I>)
    }
}

impl<'r, I: TypeTag<'r>> FusedIterator for Request<'r, I> {}

impl<I> Clone for Request<'_, I> {
    fn clone(&self) -> Self {
        Self {
            chain: self.chain.clone(),
            _marker: PhantomData,
        }
    }
}

impl<'r, I: TypeTag<'r>> fmt::Debug for Request<'r, I>
where
    I::Type: fmt::Debug,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}
