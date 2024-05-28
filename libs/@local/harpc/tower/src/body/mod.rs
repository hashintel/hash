pub mod either;
pub mod full;
pub mod limited;
pub mod map;
mod size_hint;
pub mod timeout;

use core::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

pub use self::size_hint::SizeHint;

enum FrameInner<D, C> {
    Data(D),
    Control(C),
}

pub struct Frame<D, C> {
    inner: FrameInner<D, C>,
}

impl<D, C> Frame<D, C> {
    pub const fn new_data(data: D) -> Self {
        Self {
            inner: FrameInner::Data(data),
        }
    }

    pub const fn new_control(control: C) -> Self {
        Self {
            inner: FrameInner::Control(control),
        }
    }

    pub const fn data(&self) -> Option<&D> {
        match &self.inner {
            FrameInner::Data(data) => Some(data),
            FrameInner::Control(_) => None,
        }
    }

    pub fn data_mut(&mut self) -> Option<&mut D> {
        match &mut self.inner {
            FrameInner::Data(data) => Some(data),
            FrameInner::Control(_) => None,
        }
    }

    pub fn map_data<D2>(self, func: impl FnOnce(D) -> D2) -> Frame<D2, C> {
        match self.inner {
            FrameInner::Data(data) => Frame::new_data(func(data)),
            FrameInner::Control(control) => Frame::new_control(control),
        }
    }

    pub fn into_data(self) -> Result<D, Self> {
        match self.inner {
            FrameInner::Data(data) => Ok(data),
            FrameInner::Control(control) => Err(Self::new_control(control)),
        }
    }

    pub const fn control(&self) -> Option<&C> {
        match &self.inner {
            FrameInner::Data(_) => None,
            FrameInner::Control(control) => Some(control),
        }
    }

    pub fn control_mut(&mut self) -> Option<&mut C> {
        match &mut self.inner {
            FrameInner::Data(_) => None,
            FrameInner::Control(control) => Some(control),
        }
    }

    pub fn map_control<C2>(self, func: impl FnOnce(C) -> C2) -> Frame<D, C2> {
        match self.inner {
            FrameInner::Data(data) => Frame::new_data(data),
            FrameInner::Control(control) => Frame::new_control(func(control)),
        }
    }

    pub fn into_control(self) -> Result<C, Self> {
        match self.inner {
            FrameInner::Data(data) => Err(Self::new_data(data)),
            FrameInner::Control(control) => Ok(control),
        }
    }
}

pub trait Body {
    type Data: Buf;
    type Control;

    type Error;

    fn poll_frame(
        self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>>;

    fn is_complete(&self) -> Option<bool>;
    // we can model is_incomplete through an error instead

    fn size_hint(&self) -> SizeHint {
        SizeHint::default()
    }
}
