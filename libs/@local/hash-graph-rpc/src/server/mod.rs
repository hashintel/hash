mod service;

use std::{
    collections::HashMap,
    future::{ready, Future},
    net::SocketAddrV4,
};

use libp2p::{futures::future::Either, multiaddr::Protocol, Multiaddr};

pub use self::service::{Service, ServiceBuilder};
use crate::{
    rpc::{
        transport::{
            server::{ServerTransportConfig, ServerTransportLayer},
            RequestRouter, TransportConfig,
        },
        Context, Error, Request, Response, ServiceId, ServiceSpecification,
    },
    server::service::ErasedService,
    types::{Empty, HStack, Stack},
};

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
        self.services.collect(&mut services);

        Server { context, services }
    }
}

pub trait CollectServices<C> {
    fn collect(self, map: &mut HashMap<ServiceId, ErasedService<C>>);
}

impl<Next, Tail, C> CollectServices<C> for Stack<Service<Next, C>, Tail>
where
    Next: ServiceSpecification,
    Tail: CollectServices<C>,
{
    fn collect(self, map: &mut HashMap<ServiceId, ErasedService<C>>) {
        let Self { next, tail } = self;

        let erased = next.erase();
        map.insert(Next::ID, erased);

        tail.collect(map);
    }
}

impl<C> CollectServices<C> for Empty {
    fn collect(self, _map: &mut HashMap<ServiceId, ErasedService<C>>) {}
}

pub struct Server<C>
where
    C: Context,
{
    context: C,
    services: HashMap<ServiceId, ErasedService<C>>,
}

impl<C> RequestRouter for Server<C>
where
    C: Context,
{
    fn route(&self, request: Request) -> impl Future<Output = Response> + Send + 'static {
        let Some(service) = self.services.get(&request.header.service) else {
            return Either::Right(ready(Response::error(Error::UnknownService)));
        };

        let Some(procedure) = service.procedures.get(&request.header.procedure).cloned() else {
            return Either::Right(ready(Response::error(Error::UnknownProcedure)));
        };

        let context = self.context.clone();

        Either::Left(procedure.call(request, context))
    }
}

impl<C> Server<C>
where
    C: Context,
{
    pub async fn serve(self, listen_on: SocketAddrV4, config: TransportConfig) -> ! {
        let config = ServerTransportConfig {
            transport: config,
            listen_on: Multiaddr::from(*listen_on.ip()).with(Protocol::Tcp(listen_on.port())),
        };

        let service = ServerTransportLayer::new(self, config).unwrap();
        service.serve().unwrap().await
    }
}
