use std::{collections::HashMap, sync::Arc};

use libp2p::futures::future::BoxFuture;

use crate::{
    rpc::{
        Context, Handler, ProcedureCall, ProcedureId, RemoteProcedure, Request, Response,
        ServiceSpecification,
    },
    types::{Empty, HStack, Includes, Stack, SupersetOf},
};

pub struct ServiceBuilder<S, C, P> {
    _service: core::marker::PhantomData<S>,

    _context: core::marker::PhantomData<C>,
    procedures: P,
}

impl<S, C> ServiceBuilder<S, C, Empty>
where
    S: ServiceSpecification,
    C: Context,
{
    pub fn new() -> Self {
        Self {
            _service: core::marker::PhantomData,
            _context: core::marker::PhantomData,

            procedures: Empty,
        }
    }
}

impl<S, C, P> ServiceBuilder<S, C, P>
where
    S: ServiceSpecification,
    C: Context,
    P: HStack,
{
    pub fn add_procedure<P2, H>(
        self,
        handler: H,
    ) -> ServiceBuilder<S, C, Stack<Handler<H, P2, C>, P>>
    where
        Handler<H, P2, C>: ProcedureCall<C>,
        S::Procedures: Includes<P2>,
    {
        ServiceBuilder {
            _service: core::marker::PhantomData,
            _context: core::marker::PhantomData,

            procedures: self.procedures.push(Handler::new(handler)),
        }
    }
}

impl<S, C, P> ServiceBuilder<S, C, P>
where
    S: ServiceSpecification,
    C: Context,
    P: CollectProcedureCalls<C>,
{
    pub fn build(self) -> Service<S, C>
    where
        P::Procedures: SupersetOf<S::Procedures>,
    {
        let mut procedures = HashMap::new();
        self.procedures.collect(&mut procedures);

        Service {
            _service: core::marker::PhantomData,
            procedures,
        }
    }
}

trait CollectProcedureCalls<C> {
    type Procedures;

    fn collect(self, map: &mut HashMap<ProcedureId, BoxedProcedureCall<C>>);
}

impl<Next, Tail, C> CollectProcedureCalls<C> for Stack<Next, Tail>
where
    Next: ProcedureCall<C> + Clone + Send + 'static,
    Tail: CollectProcedureCalls<C>,
    C: Context,
{
    type Procedures = Stack<Next::Procedure, Tail::Procedures>;

    fn collect(self, map: &mut HashMap<ProcedureId, BoxedProcedureCall<C>>) {
        let Self { next, tail } = self;

        map.insert(Next::Procedure::ID, BoxedProcedureCall::new(next));
        tail.collect(map);
    }
}

impl<C> CollectProcedureCalls<C> for Empty {
    type Procedures = Self;

    fn collect(self, _map: &mut HashMap<ProcedureId, BoxedProcedureCall<C>>) {}
}

#[derive(Clone)]
struct ErasedProcedureCall<P>(P);

impl<P, C> ProcedureCall<C> for ErasedProcedureCall<P>
where
    P: ProcedureCall<C>,
    C: Context,
{
    type Future = BoxFuture<'static, Response>;
    type Procedure = ErasedRemoteProcedure;

    fn call(self, request: Request, context: C) -> Self::Future {
        let future = self.0.call(request, context);

        Box::pin(future)
    }
}

struct ErasedRemoteProcedure;
impl RemoteProcedure for ErasedRemoteProcedure {
    type Response = Response;

    const ID: ProcedureId = ProcedureId::new(0);
}

type BoxedProcedure<C> = Box<
    dyn CloneProcedureCall<
            C,
            Future = BoxFuture<'static, Response>,
            Procedure = ErasedRemoteProcedure,
        > + Send,
>;

pub struct BoxedProcedureCall<C>(BoxedProcedure<C>);

impl<C> BoxedProcedureCall<C>
where
    C: Context,
{
    fn new<P>(procedure: P) -> Self
    where
        P: ProcedureCall<C> + Clone + Send + 'static,
    {
        Self(Box::new(ErasedProcedureCall(procedure)))
    }

    pub(crate) fn call(&self, request: Request, context: C) -> BoxFuture<'static, Response> {
        self.0.call_ref(request, context)
    }
}

trait ProcedureCallRef<C>: ProcedureCall<C>
where
    C: Context,
{
    fn call_ref(&self, request: Request, context: C) -> Self::Future;
}

impl<T, C> ProcedureCallRef<C> for T
where
    T: ProcedureCall<C> + Clone,
    C: Context,
{
    fn call_ref(&self, request: Request, context: C) -> Self::Future {
        self.clone().call(request, context)
    }
}

impl<C> Clone for BoxedProcedureCall<C>
where
    C: Context,
{
    fn clone(&self) -> Self {
        BoxedProcedureCall(self.0.clone_box())
    }
}

trait CloneProcedureCall<C>: ProcedureCallRef<C>
where
    C: Context,
{
    fn clone_box(
        &self,
    ) -> Box<dyn CloneProcedureCall<C, Future = Self::Future, Procedure = Self::Procedure> + Send>;
}

impl<P, C> CloneProcedureCall<C> for P
where
    P: ProcedureCallRef<C> + Clone + Send + 'static,
    C: Context,
{
    fn clone_box(
        &self,
    ) -> Box<dyn CloneProcedureCall<C, Future = P::Future, Procedure = P::Procedure> + Send> {
        Box::new(self.clone())
    }
}

pub struct Service<S, C> {
    _service: core::marker::PhantomData<S>,
    procedures: HashMap<ProcedureId, BoxedProcedureCall<C>>,
}

impl<S, C> Service<S, C> {
    pub(crate) fn erase(self) -> ErasedService<C> {
        ErasedService {
            procedures: self.procedures,
        }
    }
}

pub struct ErasedService<C> {
    pub(crate) procedures: HashMap<ProcedureId, BoxedProcedureCall<C>>,
}

impl<C> Clone for ErasedService<C>
where
    C: Context,
{
    fn clone(&self) -> Self {
        Self {
            procedures: self.procedures.clone(),
        }
    }
}
