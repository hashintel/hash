mod serde_compat;

pub(crate) mod transport;

use std::future::Future;

use bytes::Bytes;
use const_fnv1a_hash::fnv1a_hash_str_64;
use uuid::Uuid;

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ServiceId(u64);

impl ServiceId {
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn derive(value: &str) -> Self {
        Self(fnv1a_hash_str_64(value))
    }
}

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

    #[must_use]
    pub const fn len(value: &[u8]) -> Self {
        Self(value.len() as u64)
    }

    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
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
/// The minimum header size is 19 bytes.
///
/// ### Extensions
///
/// In the future to support more features, the header may be extended with additional fields.
/// Planned are:
/// * `Version (Transport)`
/// * `Version (Protocol)`
/// * `Flags`
// (TODO: already add them)
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
    ($($variant:ident <=> $value:tt),*) => {
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
    ConnectionClosed,
    UnknownService,
    UnknownProcedure,
    InvalidPayloadSize,
    InvalidPayload,
}

impl Error {
    primitive_enum! {
        DeadlineExceeded <=> 0x00,
        ConnectionClosed <=> 0x01,
        UnknownService <=> 0x02,
        UnknownProcedure <=> 0x03,
        InvalidPayloadSize <=> 0x04,
        InvalidPayload <=> 0x05
    }

    pub(crate) const fn into_tag(self) -> u8 {
        self.into_u8() + 1
    }

    pub(crate) const fn try_from_tag(tag: u8) -> Option<Self> {
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
///
/// ### Extensions
///
/// In the future to support more features, the header may be extended with additional fields.
///
/// These include:
/// * `Version`
/// * `Flags`
///
/// Another extension that is planned (through flags) is to allow for an alternative streaming
/// implementation, where the items of the response are streamed as they are produced, instead of
/// being buffered and sent all at once.
///
/// The header of a streaming response would include the current item index as well as a size hint,
/// if an item (that is successful) has a payload length of 0x00 it indicates the end of the stream.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Response {
    header: ResponseHeader,
    pub(crate) body: ResponsePayload,
}

impl Response {
    pub fn new(body: impl Into<ResponsePayload>) -> Self {
        let payload = body.into();

        let size = match &payload {
            ResponsePayload::Success(bytes) => PayloadSize::len(bytes),
            ResponsePayload::Error(_) => PayloadSize::new(0),
        };

        Self {
            header: ResponseHeader { size },
            body: payload,
        }
    }

    #[must_use]
    pub fn error(error: Error) -> Self {
        Self {
            header: ResponseHeader {
                size: PayloadSize::new(0),
            },
            body: error.into(),
        }
    }
}

pub trait Stateful: Send + Sync {
    type State: Send + Sync;

    fn state(&self) -> &Self::State;
}

pub trait Encode<T>: Stateful {
    fn encode(&self, value: T) -> Bytes;
}

pub trait Decode<T>: Stateful {
    fn decode(&self, bytes: Bytes) -> T;
}

pub trait Context: Clone + Stateful + 'static {
    fn finish<T>(&self, response: T) -> Response
    where
        Self: Encode<T>;
}

pub trait ProcedureCall<C>
where
    C: Context,
{
    type Future: Future<Output = Response> + Send + 'static;

    type Procedure: RemoteProcedure;

    fn call(self, request: Request, context: C) -> Self::Future;
}

pub struct Handler<F, P, C> {
    handler: F,
    _context: core::marker::PhantomData<(P, C)>,
}

impl<F, P, C> Clone for Handler<F, P, C>
where
    F: Clone,
{
    fn clone(&self) -> Self {
        Self {
            handler: self.handler.clone(),
            _context: core::marker::PhantomData,
        }
    }
}

impl<F, P, C> Handler<F, P, C> {
    pub(crate) const fn new(handler: F) -> Self {
        Self {
            handler,
            _context: core::marker::PhantomData,
        }
    }
}

impl<F, P, C, Fut> ProcedureCall<C> for Handler<F, P, C>
where
    F: FnOnce(P, &C::State) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = P::Response> + Send,
    P: RemoteProcedure,
    C: Context + Encode<P::Response> + Decode<P>,
{
    type Procedure = P;

    type Future = impl Future<Output = Response> + Send + 'static;

    fn call(self, request: Request, context: C) -> Self::Future {
        async move {
            let body = request.body;
            let state = context.state();

            let body = context.decode(body);
            let input = body;

            let output = (self.handler)(input, state).await;

            context.finish(output)
        }
    }
}

pub trait RemoteProcedure: Send + Sync {
    type Response;

    const ID: ProcedureId;
}

pub trait ServiceSpecification: Send + Sync {
    type Procedures;

    const ID: ServiceId;
}
