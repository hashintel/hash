mod erase;
mod service;

use std::{
    collections::HashMap,
    future::{ready, Future},
    net::SocketAddrV4,
};

use error_stack::ResultExt;
use libp2p::{futures::future::Either, multiaddr::Protocol, Multiaddr};
use thiserror::Error;

pub use self::service::{Service, ServiceBuilder};
use crate::{
    harpc::{
        server::erase::BoxedProcedureCall,
        service::ServiceId,
        transport::{
            message::{
                request::Request,
                response::{Response, ResponseError},
            },
            server::{ServerTransportConfig, ServerTransportLayer},
            RequestRouter, TransportConfig,
        },
        Context, ProcedureId, ServiceVersion,
    },
    types::{Empty, HStack, Stack},
};

#[derive(Debug, Copy, Clone, Error)]
pub enum ServerError {
    #[error("internal transport error")]
    Internal,
}

pub struct ServerBuilder<C, S> {
    _context: core::marker::PhantomData<C>,
    services: S,
}

impl<C> ServerBuilder<C, Empty>
where
    C: Context,
{
    #[must_use]
    pub const fn new() -> Self {
        Self {
            _context: core::marker::PhantomData,
            services: Empty,
        }
    }
}

impl<C, S> ServerBuilder<C, S>
where
    C: Context,
    S: HStack,
{
    pub fn add_service<S2>(
        self,
        service: Service<S2, C>,
    ) -> ServerBuilder<C, Stack<Service<S2, C>, S>> {
        ServerBuilder {
            _context: core::marker::PhantomData,
            services: self.services.push(service),
        }
    }
}

impl<C, S> ServerBuilder<C, S>
where
    C: Context,
    S: CollectServices<C>,
{
    pub fn build(self, context: C) -> Server<C> {
        let mut services = HashMap::new();
        let mut loaded = HashMap::new();

        self.services.collect(&mut services, &mut loaded);

        Server {
            context,
            services,
            loaded,
        }
    }
}

pub trait CollectServices<C> {
    fn collect(
        self,
        services: &mut HashMap<(ServiceId, ServiceVersion, ProcedureId), BoxedProcedureCall<C>>,
        loaded: &mut HashMap<ServiceId, Vec<ServiceVersion>>,
    );
}

impl<Next, Tail, C> CollectServices<C> for Stack<Service<Next, C>, Tail>
where
    Next: crate::harpc::service::Service,
    Tail: CollectServices<C>,
{
    fn collect(
        self,
        services: &mut HashMap<(ServiceId, ServiceVersion, ProcedureId), BoxedProcedureCall<C>>,
        loaded: &mut HashMap<ServiceId, Vec<ServiceVersion>>,
    ) {
        let Self { next, tail } = self;

        let loaded_versions = loaded.entry(Next::ID).or_default();
        loaded_versions.push(Next::VERSION);

        services.extend(
            next.procedures
                .into_iter()
                .map(|(id, procedure)| ((Next::ID, Next::VERSION, id), procedure)),
        );

        tail.collect(services, loaded);
    }
}

impl<C> CollectServices<C> for Empty {
    fn collect(
        self,
        _: &mut HashMap<(ServiceId, ServiceVersion, ProcedureId), BoxedProcedureCall<C>>,
        _: &mut HashMap<ServiceId, Vec<ServiceVersion>>,
    ) {
    }
}

pub struct Server<C>
where
    C: Context,
{
    context: C,
    services: HashMap<(ServiceId, ServiceVersion, ProcedureId), BoxedProcedureCall<C>>,

    // used during error recovery to tell users what's wrong
    loaded: HashMap<ServiceId, Vec<ServiceVersion>>,
}

impl<C> RequestRouter for Server<C>
where
    C: Context,
{
    fn route(&self, request: Request) -> impl Future<Output = Response> + Send + 'static {
        let Some(procedure) = self
            .services
            .get(&(
                request.header.service,
                request.header.version.service,
                request.header.procedure,
            ))
            .cloned()
        else {
            let Some(versions) = self.loaded.get(&request.header.service) else {
                return Either::Right(ready(Response::error(ResponseError::UnknownService)));
            };

            if versions.contains(&request.header.version.service) {
                return Either::Right(ready(Response::error(ResponseError::UnknownProcedure)));
            }

            return Either::Right(ready(Response::error(ResponseError::UnknownServiceVersion)));
        };

        let context = self.context.clone();

        Either::Left(procedure.call(request, context))
    }
}

impl<C> Server<C>
where
    C: Context,
{
    /// Serve the server on the given address.
    ///
    /// This returns a future that will never resolve.
    ///
    /// # Errors
    ///
    /// Returns an error if the transport layer cannot be started.
    pub fn serve(
        self,
        listen_on: SocketAddrV4,
        config: TransportConfig,
    ) -> error_stack::Result<impl Future<Output = !> + Send, ServerError> {
        let config = ServerTransportConfig {
            transport: config,
            listen_on: Multiaddr::from(*listen_on.ip()).with(Protocol::Tcp(listen_on.port())),
        };

        let service =
            ServerTransportLayer::new(self, config).change_context(ServerError::Internal)?;

        service.serve().change_context(ServerError::Internal)
    }
}
