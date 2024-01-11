use std::{future::Future, io, marker::PhantomData};

use const_fnv1a_hash::fnv1a_hash_str_64;

use crate::harpc::{
    transport::{
        codec::{decode, decode::DecodeBinary, encode::EncodeBinary},
        message::{
            request::Request,
            response::{Response, ResponseError},
        },
    },
    Context, Decode, Encode, RequestMeta,
};

/// Unique identifier for a procedure.
///
/// The value `u64::MAX` is reserved for internal use.
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ProcedureId(u64);

impl ProcedureId {
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub(crate) const fn erased() -> Self {
        Self(u64::MAX)
    }

    #[must_use]
    pub const fn derive(value: &str) -> Self {
        Self(fnv1a_hash_str_64(value))
    }

    pub(crate) const fn value(self) -> u64 {
        self.0
    }
}

impl From<u64> for ProcedureId {
    fn from(value: u64) -> Self {
        Self(value)
    }
}

impl EncodeBinary for ProcedureId {
    async fn encode_binary<T>(&self, io: &mut T) -> io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        crate::harpc::transport::codec::encode::write_varint(self.0, io).await
    }
}

impl DecodeBinary for ProcedureId {
    async fn decode_binary<T>(
        io: &mut T,
        _: crate::harpc::transport::codec::Limit,
    ) -> io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let value = decode::read_varint(io).await?;
        let value = Self::new(value);

        Ok(value)
    }
}

pub trait ProcedureCall<C>
where
    C: Context,
{
    type Procedure: RemoteProcedure;

    type Future: Future<Output = Response> + Send + 'static;

    fn call(self, request: Request, context: C) -> Self::Future;
}

pub trait Handler<T, C> {
    type Procedure: RemoteProcedure;

    fn call(self, request: Request, context: C) -> impl Future<Output = Response> + Send + 'static;
}

macro_rules! process {
    (decode: $context:ident, $body:ident) => {
        match $context.decode($body).await {
            Err(error) => {
                tracing::error!(?error, "Failed to decode request");
                return Response::error(ResponseError::DecodingError);
            }
            Ok(body) => body,
        }
    };

    (encode: $context:ident, $output:ident) => {
        match $context.encode($output).await {
            Err(error) => {
                tracing::error!(?error, "Failed to encode response");
                return Response::error(ResponseError::EncodingError);
            }
            Ok(buffer) => Response::success(buffer),
        }
    };
}

impl<F, P, C, Fut> Handler<(P,), C> for F
where
    F: FnOnce(P) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = P::Response> + Send,
    P: RemoteProcedure,
    C: Context + Encode<P::Response> + Decode<P>,
{
    type Procedure = P;

    fn call(self, request: Request, context: C) -> impl Future<Output = Response> + Send + 'static {
        async move {
            let body = request.body;

            let input = process!(decode: context, body);

            let output = self(input).await;

            process!(encode: context, output)
        }
    }
}

impl<F, P, C, Fut> Handler<(P, C::State), C> for F
where
    F: FnOnce(P, C::State) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = P::Response> + Send,
    P: RemoteProcedure,
    C: Context + Encode<P::Response> + Decode<P>,
{
    type Procedure = P;

    fn call(self, request: Request, context: C) -> impl Future<Output = Response> + Send + 'static {
        async move {
            let body = request.body;
            let state = context.state();

            let input = process!(decode: context, body);

            let output = self(input, state).await;

            process!(encode: context, output)
        }
    }
}

impl<F, P, C, Fut> Handler<(P, RequestMeta, C::State), C> for F
where
    F: FnOnce(P, RequestMeta, C::State) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = P::Response> + Send,
    P: RemoteProcedure,
    C: Context + Encode<P::Response> + Decode<P>,
{
    type Procedure = P;

    fn call(self, request: Request, context: C) -> impl Future<Output = Response> + Send + 'static {
        async move {
            let body = request.body;
            let state = context.state();

            let input = process!(decode: context, body);
            let meta = RequestMeta {
                actor: request.header.actor,
            };

            let output = self(input, meta, state).await;

            process!(encode: context, output)
        }
    }
}

pub struct ProcedureHandler<H, T, C> {
    handler: H,
    _marker: PhantomData<fn() -> *const (T, C)>,
}

impl<H, T, C> ProcedureHandler<H, T, C> {
    #[must_use]
    pub(crate) fn new(handler: H) -> Self {
        Self {
            handler,
            _marker: PhantomData,
        }
    }
}

impl<H, T, C> Clone for ProcedureHandler<H, T, C>
where
    H: Clone,
{
    fn clone(&self) -> Self {
        Self {
            handler: self.handler.clone(),
            _marker: PhantomData,
        }
    }
}

impl<H, T, C> ProcedureCall<C> for ProcedureHandler<H, T, C>
where
    H: Handler<T, C>,
    C: Context,
{
    type Procedure = H::Procedure;

    type Future = impl Future<Output = Response> + Send + 'static;

    fn call(self, request: Request, context: C) -> Self::Future {
        self.handler.call(request, context)
    }
}

pub trait RemoteProcedure: Send + Sync {
    type Response;

    const ID: ProcedureId;
    const NAME: &'static str;
}

#[cfg(test)]
mod test {
    use crate::harpc::{procedure::ProcedureId, transport::codec::test::assert_binary};

    assert_binary![
        binary_procedure_id_zero(ProcedureId::new(0x00), &[0x00]),
        binary_procedure_id_varint(ProcedureId::new(0x80), &[0x80, 0x01]),
    ];
}
