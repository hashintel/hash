use core::{fmt, fmt::Formatter, iter::FusedIterator, marker::PhantomData};

use provider::TypeTag;

use super::Frame;
use crate::{tags::FrameSource, Frames, Report, Requests};

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
            self.current = current.request::<FrameSource>();
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

impl<'r, I> Requests<'r, I> {
    pub(super) const fn new<Context>(report: &'r Report<Context>) -> Self {
        Self {
            frames: report.frames(),
            _marker: PhantomData,
        }
    }
}

impl<'r, I: TypeTag<'r>> Iterator for Requests<'r, I> {
    type Item = I::Type;

    fn next(&mut self) -> Option<Self::Item> {
        self.frames.by_ref().find_map(Frame::request::<I>)
    }
}

impl<'r, I: TypeTag<'r>> FusedIterator for Requests<'r, I> {}

impl<I> Clone for Requests<'_, I> {
    fn clone(&self) -> Self {
        Self {
            frames: self.frames.clone(),
            _marker: PhantomData,
        }
    }
}

impl<'r, I: TypeTag<'r>> fmt::Debug for Requests<'r, I>
where
    I::Type: fmt::Debug,
{
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_list().entries(self.clone()).finish()
    }
}
