use core::{fmt, fmt::Formatter, iter::FusedIterator, marker::PhantomData};

use provider::TypeTag;

use super::Frame;
use crate::{tags::FrameSource, FrameStack, Report, RequestStack};

impl<'r> FrameStack<'r> {
    pub(super) const fn new<S>(report: &'r Report<S>) -> Self {
        Self {
            current: Some(&report.inner.frame),
        }
    }
}

impl<'r> Iterator for FrameStack<'r> {
    type Item = &'r Frame;

    fn next(&mut self) -> Option<Self::Item> {
        self.current.take().map(|current| {
            self.current = current.request::<FrameSource>();
            current
        })
    }
}

impl<'r> FusedIterator for FrameStack<'r> {}

impl fmt::Debug for FrameStack<'_> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}

impl<'r, I> RequestStack<'r, I> {
    pub(super) const fn new<S>(report: &'r Report<S>) -> Self {
        Self {
            chain: report.frames(),
            _marker: PhantomData,
        }
    }
}

impl<'r, I: TypeTag<'r>> Iterator for RequestStack<'r, I> {
    type Item = I::Type;

    fn next(&mut self) -> Option<Self::Item> {
        self.chain.by_ref().find_map(Frame::request::<I>)
    }
}

impl<'r, I: TypeTag<'r>> FusedIterator for RequestStack<'r, I> {}

impl<I> Clone for RequestStack<'_, I> {
    fn clone(&self) -> Self {
        Self {
            chain: self.chain.clone(),
            _marker: PhantomData,
        }
    }
}

impl<'r, I: TypeTag<'r>> fmt::Debug for RequestStack<'r, I>
where
    I::Type: fmt::Debug,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}
