mod codec;
mod serde_compat;
mod transport;

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

    pub fn len(value: &[u8]) -> Self {
        Self(value.len() as u64)
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

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct RequestHeader {
    pub(crate) service: ServiceId,
    pub(crate) procedure: ProcedureId,
    pub(crate) actor: ActorId,
    pub(crate) size: PayloadSize,
}

/// # Request
///
/// ## Binary Packet Layout
///
/// (The binary packet layout assumes worst case scenario for the header).
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                            Header                             |
/// +                           +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                           |                                   |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+                                   +
/// |                             Body                              |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Header (46 bytes)
/// * Body (50 bytes)
/// total 96 bytes
/// ```
///
/// The length of the packet is encoded in the header as the last field.
///
/// ### Header
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |     ServiceID     |    ProcedureID    |        ActorID        |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |       |       Size        |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * ServiceID (10 bytes)
/// * ProcedureID (10 bytes)
/// * ActorID (16 bytes)
/// * Size (10 bytes)
/// total 46 bytes
/// ```
///
/// `ServiceID`, `ProcedureID`, `Size` utilize variable integer encoding, with a maximum size of 10
/// bytes.
/// The mimum header size is 19 bytes.
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

macro_rules! primitive_enum {
    ($($variant:ident <=> $value:literal),*) => {
        const fn try_from_u8(value: u8) -> Option<Self> {
            match value {
                $( $value => Some(Self::$variant), )*
                _ => None,
            }
        }

        const fn into_u8(self) -> u8 {
            match self {
                $( Self::$variant => $value, )*
            }
        }
    };
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum Error {
    DeadlineExceeded,
    UnknownService,
    UnknownProcedure,
    InvalidPayloadSize,
    InvalidPayload,
}

impl Error {
    primitive_enum! {
        DeadlineExceeded <=> 0x00,
        UnknownService <=> 0x01,
        UnknownProcedure <=> 0x02,
        InvalidPayloadSize <=> 0x03,
        InvalidPayload <=> 0x04
    }

    pub(crate) const fn into_tag(self) -> u8 {
        self.into_u8() + 1
    }

    pub(crate) fn try_from_tag(tag: u8) -> Option<Self> {
        if tag == 0 {
            return None;
        }

        Self::try_from_u8(tag - 1)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "tag", content = "payload")]
pub enum ResponsePayload {
    Success(#[serde(with = "serde_compat::bytes")] Bytes),
    Error(Error),
}

impl<T> From<T> for ResponsePayload
where
    T: Into<Bytes>,
{
    fn from(value: T) -> Self {
        Self::Success(value.into())
    }
}

impl From<Error> for ResponsePayload {
    fn from(value: Error) -> Self {
        Self::Error(value)
    }
}

/// # Response
///
/// ## Binary Packet Layout
///
/// (The binary packet layout assumes worst case scenario for the header).
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |       Header        |                  Body                   |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Header (11 bytes)
/// * Body (21 bytes)
/// total 32 bytes
/// ```
///
/// The length of the packet is encoded in the header as the last field.
///
/// ### Header
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |S|       Size        |
/// +-+-+-+-+-+-+-+-+-+-+-+
///
/// * Status (1 byte)
/// * Size (10 bytes)
/// total 11 bytes
/// ```
///
/// If the status is `0x00` then the response is [`ResponsePayload::Success`], otherwise the status
/// is [`Error`], **and no length or body are present**.
///
/// `Length` utilizes variable integer encoding, with a maximum size of 10 bytes.
///
/// The minimum size of the header on errorneous response is 1 byte, and on successful response is 2
/// bytes.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Response {
    header: ResponseHeader,
    body: ResponsePayload,
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
