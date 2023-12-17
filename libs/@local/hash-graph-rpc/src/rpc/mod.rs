use std::future::Future;

use bytes::Bytes;
use const_fnv1a_hash::fnv1a_hash_str_64;
use uuid::Uuid;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ServiceId(u64);

impl ServiceId {
    pub const fn derive(value: &str) -> Self {
        Self(fnv1a_hash_str_64(value))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ProcedureId(u64);

impl ProcedureId {
    pub const fn derive(value: &str) -> Self {
        Self(fnv1a_hash_str_64(value))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ActorId(Uuid);

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RequestHeader {
    service: ServiceId,
    method: ProcedureId,
}

#[derive(Debug, Clone)]
pub struct Request {
    header: RequestHeader,
    body: Bytes,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ResponseHeader;

#[derive(Debug, Clone)]
pub struct Response {
    header: ResponseHeader,
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

pub trait ProcedureCall<I, C, S> {
    type Response;

    type Future<'a>: Future<Output = Response> + Send + 'a
    where
        Self: 'a,
        C: 'a,
        S: 'a;

    fn call(self, request: Request, context: &C) -> Self::Future<'_>;
}

impl<F, I, C, S, O, Fut> ProcedureCall<I, C, S> for F
where
    F: FnOnce(I, &S) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = O> + Send,
    I: Send,
    C: Context<S> + Encode<O, S> + Decode<I, S> + Sync,
    S: Sync,
{
    type Response = O;

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
pub trait ProcedureSpecification {
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
