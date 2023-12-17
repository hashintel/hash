mod codec;
mod serde_compat;
mod wire;

use std::future::Future;

use bytes::Bytes;
use const_fnv1a_hash::fnv1a_hash_str_64;
use uuid::Uuid;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ServiceId(u64);

impl ServiceId {
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    pub const fn derive(value: &str) -> Self {
        Self(fnv1a_hash_str_64(value))
    }
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ProcedureId(u64);

impl ProcedureId {
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    pub const fn derive(value: &str) -> Self {
        Self(fnv1a_hash_str_64(value))
    }
}

impl From<u64> for ProcedureId {
    fn from(value: u64) -> Self {
        Self(value)
    }
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ActorId(Uuid);

impl From<Uuid> for ActorId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct PayloadSize(u64);

impl PayloadSize {
    pub(crate) const fn new(value: u64) -> Self {
        Self(value)
    }

    pub const fn into_usize(self) -> usize {
        self.0 as usize
    }
}

impl PayloadSize {
    pub(crate) const fn exceeds(self, limit: u64) -> bool {
        self.0 > limit
    }
}

impl From<u64> for PayloadSize {
    fn from(value: u64) -> Self {
        Self(value)
    }
}

impl From<PayloadSize> for u64 {
    fn from(value: PayloadSize) -> Self {
        value.0
    }
}

impl From<PayloadSize> for usize {
    fn from(value: PayloadSize) -> Self {
        value.0 as usize
    }
}

/// The binary message layout of Request Header is:
///
/// ```text
/// | Service ID (var int) | Procedure ID (var int) | Actor ID (u128) | Body Size (var int) |
/// ```
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct RequestHeader {
    pub(crate) service: ServiceId,
    pub(crate) procedure: ProcedureId,
    pub(crate) actor: ActorId,
    pub(crate) size: PayloadSize,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Request {
    pub(crate) header: RequestHeader,
    #[serde(with = "serde_compat::bytes")]
    pub(crate) body: Bytes,
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ResponseHeader {
    pub(crate) size: PayloadSize,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Response {
    header: ResponseHeader,
    #[serde(with = "serde_compat::bytes")]
    body: Bytes,
}

pub trait Encode<T, S> {
    fn encode(&self, value: T, state: &S) -> Bytes;
}

pub trait Decode<T, S> {
    fn decode(&self, bytes: Bytes, state: &S) -> T;
}

pub trait Context<S> {
    fn state(&self) -> &S;

    fn finish<T>(&self, response: T) -> Response
    where
        Self: Encode<T, S>;
}

pub trait ProcedureCall<P, C, S> {
    type Procedure: RemoteProcedure;

    type Future<'a>: Future<Output = Response> + Send + 'a
    where
        Self: 'a,
        C: 'a,
        S: 'a;

    fn call(self, request: Request, context: &C) -> Self::Future<'_>;
}

impl<F, P, C, S, Fut> ProcedureCall<P, C, S> for F
where
    F: FnOnce(P, &S) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = P::Response> + Send,
    P: RemoteProcedure + Send,
    C: Context<S> + Encode<P::Response, S> + Decode<P, S> + Sync,
    S: Sync,
{
    type Procedure = P;

    type Future<'a> = impl Future<Output = Response> + Send + 'a where
        Self: 'a,
        C: 'a,
        S: 'a;

    fn call(self, request: Request, context: &C) -> Self::Future<'_> {
        let body = request.body;
        let state = context.state();

        async move {
            let body = context.decode(body, state);
            let input = body;

            let output = self(input, state).await;

            context.finish(output)
        }
    }
}

// The request is the type that implements this!
// TODO: name is not the best to describe this!
pub trait RemoteProcedure {
    const ID: ProcedureId;

    type Response;

    // TODO: client that implements those over transport!
}

pub struct Procedure<S, T>
// where
//     S: ProcedureSpecification,
//     T: ProcedureCall<S, C, Response=S::Response>,
{
    specification: S,
    call: T,
}

pub trait ServiceSpecification {
    const ID: ServiceId;

    type Procedures;
}

pub struct Service<T> {
    id: ServiceId,
    procedures: T,
}
