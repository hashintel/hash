pub mod boxed;
pub mod controlled;
pub mod empty;
pub mod full;
pub mod limited;
pub mod map;
pub mod server;
pub mod size_hint;
pub mod stream;
pub mod timeout;

use core::{
    ops::DerefMut,
    pin::Pin,
    task::{Context, Poll},
};

use bytes::Buf;

pub use self::size_hint::SizeHint;
use self::{
    boxed::{BoxBody, UnsyncBoxBody},
    map::{MapControl, MapData, MapError},
    stream::BodyStream,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum BodyState {
    Complete,
    Incomplete,
}

pub trait Body {
    type Control;
    type Data: Buf;

    type Error;

    fn poll_frame(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Option<BodyFrameResult<Self>>>;

    /// Signal if the body has been is complete.
    ///
    /// `Some` indicates that the body is complete, and no more items are to be expected, the
    /// boolean indicates if the stream is either incomplete or complete, meaning it might have been
    /// interrupted or truncated during transmission.
    fn state(&self) -> Option<BodyState>;

    fn size_hint(&self) -> SizeHint {
        SizeHint::default()
    }
}

impl<B> Body for &mut B
where
    B: Body + Unpin + ?Sized,
{
    type Control = B::Control;
    type Data = B::Data;
    type Error = B::Error;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<BodyFrameResult<Self>>> {
        Pin::new(&mut **self).poll_frame(cx)
    }

    fn state(&self) -> Option<BodyState> {
        Pin::new(&**self).state()
    }

    fn size_hint(&self) -> SizeHint {
        Pin::new(&**self).size_hint()
    }
}

impl<P> Body for Pin<P>
where
    P: Unpin + DerefMut<Target: Body>,
{
    type Control = <P::Target as Body>::Control;
    type Data = <P::Target as Body>::Data;
    type Error = <P::Target as Body>::Error;

    fn poll_frame(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Option<BodyFrameResult<Self>>> {
        Pin::get_mut(self).as_mut().poll_frame(cx)
    }

    fn state(&self) -> Option<BodyState> {
        self.as_ref().state()
    }

    fn size_hint(&self) -> SizeHint {
        self.as_ref().size_hint()
    }
}

impl<B> Body for Box<B>
where
    B: Body + Unpin + ?Sized,
{
    type Control = B::Control;
    type Data = B::Data;
    type Error = B::Error;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context,
    ) -> Poll<Option<BodyFrameResult<Self>>> {
        Pin::new(&mut **self).poll_frame(cx)
    }

    fn state(&self) -> Option<BodyState> {
        self.as_ref().state()
    }

    fn size_hint(&self) -> SizeHint {
        self.as_ref().size_hint()
    }
}

pub trait BodyExt: Body {
    fn poll_frame_unpin(&mut self, cx: &mut Context) -> Poll<Option<BodyFrameResult<Self>>>
    where
        Self: Unpin,
    {
        Pin::new(self).poll_frame(cx)
    }

    fn frame(
        &mut self,
    ) -> impl Future<Output = Option<Result<Frame<Self::Data, Self::Control>, Self::Error>>>
    where
        Self: Unpin,
    {
        struct FrameFuture<'a, T: ?Sized>(&'a mut T);

        impl<'a, T: Body + Unpin + ?Sized> Future for FrameFuture<'a, T> {
            type Output = Option<Result<Frame<T::Data, T::Control>, T::Error>>;

            fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
                Pin::new(&mut self.0).poll_frame(cx)
            }
        }

        FrameFuture(self)
    }

    fn map_data<F, B>(self, f: F) -> MapData<Self, F>
    where
        Self: Sized,
        F: FnMut(Self::Data) -> B,
        B: Buf,
    {
        MapData::new(self, f)
    }

    fn map_control<F, C>(self, f: F) -> MapControl<Self, F>
    where
        Self: Sized,
        F: FnMut(Self::Control) -> C,
    {
        MapControl::new(self, f)
    }

    fn map_err<F, E>(self, f: F) -> MapError<Self, F>
    where
        Self: Sized,
        F: FnMut(Self::Error) -> E,
    {
        MapError::new(self, f)
    }

    fn boxed(self) -> BoxBody<Self::Data, Self::Control, Self::Error>
    where
        Self: Sized + Send + Sync + 'static,
    {
        BoxBody::new(self)
    }

    fn boxed_unsync(self) -> UnsyncBoxBody<Self::Data, Self::Control, Self::Error>
    where
        Self: Sized + Send + 'static,
    {
        UnsyncBoxBody::new(self)
    }

    fn into_stream(self) -> BodyStream<Self>
    where
        Self: Sized,
    {
        BodyStream::new(self)
    }
}

impl<B> BodyExt for B where B: Body {}

#[cfg(test)]
pub(crate) mod test {
    use core::{
        pin::Pin,
        task::{Context, Poll, Waker},
    };

    use futures::Stream;

    use super::{Body, Frame};

    #[expect(
        clippy::type_complexity,
        reason = "polling code always results in complex types"
    )]
    pub(crate) fn poll_frame_unpin<B>(
        body: &mut B,
    ) -> Poll<Option<Result<Frame<B::Data, B::Control>, B::Error>>>
    where
        B: Body + Unpin,
    {
        let mut cx = Context::from_waker(Waker::noop());

        let body = Pin::new(body);
        body.poll_frame(&mut cx)
    }

    pub(crate) fn poll_stream_unpin<S>(stream: &mut S) -> Poll<Option<S::Item>>
    where
        S: Stream + Unpin,
    {
        let mut cx = Context::from_waker(Waker::noop());

        let body = Pin::new(stream);
        body.poll_next(&mut cx)
    }
}
