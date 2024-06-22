pub mod control;
pub mod full;
pub mod limited;
pub mod map;
pub mod server;
pub mod size_hint;
pub mod timeout;

use core::{
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

pub use self::size_hint::SizeHint;

pub enum Frame<D, C> {
    Data(D),
    Control(C),
}

impl<D, C> Frame<D, C> {
    pub const fn new_data(data: D) -> Self {
        Self::Data(data)
    }

    pub const fn new_control(control: C) -> Self {
        Self::Control(control)
    }

    pub const fn data(&self) -> Option<&D> {
        match self {
            Self::Data(data) => Some(data),
            Self::Control(_) => None,
        }
    }

    pub fn data_mut(&mut self) -> Option<&mut D> {
        match self {
            Self::Data(data) => Some(data),
            Self::Control(_) => None,
        }
    }

    pub fn map_data<D2>(self, func: impl FnOnce(D) -> D2) -> Frame<D2, C> {
        match self {
            Self::Data(data) => Frame::new_data(func(data)),
            Self::Control(control) => Frame::new_control(control),
        }
    }

    pub fn into_data(self) -> Result<D, Self> {
        match self {
            Self::Data(data) => Ok(data),
            Self::Control(control) => Err(Self::new_control(control)),
        }
    }

    pub const fn control(&self) -> Option<&C> {
        match self {
            Self::Data(_) => None,
            Self::Control(control) => Some(control),
        }
    }

    pub fn control_mut(&mut self) -> Option<&mut C> {
        match self {
            Self::Data(_) => None,
            Self::Control(control) => Some(control),
        }
    }

    pub fn map_control<C2>(self, func: impl FnOnce(C) -> C2) -> Frame<D, C2> {
        match self {
            Self::Data(data) => Frame::new_data(data),
            Self::Control(control) => Frame::new_control(func(control)),
        }
    }

    pub fn into_control(self) -> Result<C, Self> {
        match self {
            Self::Data(data) => Err(Self::new_data(data)),
            Self::Control(control) => Ok(control),
        }
    }
}

pub(crate) type BodyFrame<B> = Frame<<B as Body>::Data, <B as Body>::Control>;
pub(crate) type BodyFrameResult<B> = Result<BodyFrame<B>, <B as Body>::Error>;

pub trait Body {
    type Data: Buf;
    type Control;

    type Error;

    fn poll_frame(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Option<BodyFrameResult<Self>>>;

    fn is_complete(&self) -> Option<bool>;

    fn size_hint(&self) -> SizeHint {
        SizeHint::default()
    }
}
