//! Trait aliases used for services and codecs, to simplify the trait bounds.

use alloc::vec;
use core::error::Error;

use bytes::Buf;
use error_stack::Report;
use futures::stream;
use harpc_codec::{decode::Decoder, encode::Encoder};
use harpc_tower::{request::Request, response::Response};

pub type ConnectionRequestStream<C> = stream::Iter<vec::IntoIter<<C as Encoder>::Buf>>;

pub trait ConnectionService<C>:
    tower::Service<
        Request<stream::Iter<vec::IntoIter<C::Buf>>>,
        Response = Response<Self::ResponseStream>,
        Error = Report<Self::ServiceError>,
        Future: Send,
    > + Clone
    + Send
    + Sync
where
    C: Encoder,
{
    type ResponseData: Buf;
    type ResponseError;

    type ServiceError: Error + Send + Sync + 'static;
    type ResponseStream: futures::Stream<Item = Result<Self::ResponseData, Self::ResponseError>>
        + Send
        + Sync;
}

impl<C, St, ResData, ResError, ServiceError, T> ConnectionService<C> for T
where
    T: tower::Service<
            Request<ConnectionRequestStream<C>>,
            Response = Response<St>,
            Error = Report<ServiceError>,
            Future: Send,
        > + Clone
        + Send
        + Sync,
    C: Encoder,
    St: futures::Stream<Item = Result<ResData, ResError>> + Send + Sync,
    ResData: Buf,
    ServiceError: Error + Send + Sync + 'static,
{
    type ResponseData = ResData;
    type ResponseError = ResError;
    type ResponseStream = St;
    type ServiceError = ServiceError;
}

pub trait ConnectionCodec:
    Encoder<Error = Report<Self::EncoderError>, Buf: Send>
    + Decoder<Error = Report<Self::DecoderError>>
    + Clone
    + Send
    + Sync
{
    type EncoderError: Error + Send + Sync + 'static;
    type DecoderError: Error + Send + Sync + 'static;
}

impl<C, EncoderError, DecoderError> ConnectionCodec for C
where
    C: Encoder<Error = Report<EncoderError>, Buf: Send>
        + Decoder<Error = Report<DecoderError>>
        + Clone
        + Send
        + Sync,
    EncoderError: Error + Send + Sync + 'static,
    DecoderError: Error + Send + Sync + 'static,
{
    type DecoderError = DecoderError;
    type EncoderError = EncoderError;
}
