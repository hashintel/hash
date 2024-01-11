use std::collections::HashMap;

use crate::{
    harpc::{
        procedure::{Handler, ProcedureCall, ProcedureHandler, ProcedureId, RemoteProcedure},
        server::erase::BoxedProcedureCall,
        service, Context,
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
    S: service::Service,
    C: Context,
{
    #[must_use]
    pub const fn new() -> Self {
        Self {
            _service: core::marker::PhantomData,
            _context: core::marker::PhantomData,

            procedures: Empty,
        }
    }
}

impl<S, C, P> ServiceBuilder<S, C, P>
where
    S: service::Service,
    C: Context,
    P: HStack,
{
    pub fn add_procedure<H, T>(
        self,
        handler: H,
    ) -> ServiceBuilder<S, C, Stack<ProcedureHandler<H, T, C>, P>>
    where
        H: Handler<T, C>,
        S::Procedures: Includes<H::Procedure>,
    {
        ServiceBuilder {
            _service: core::marker::PhantomData,
            _context: core::marker::PhantomData,

            procedures: self.procedures.push(ProcedureHandler::new(handler)),
        }
    }
}

impl<S, C, P> ServiceBuilder<S, C, P>
where
    S: service::Service,
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

pub trait CollectProcedureCalls<C> {
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

pub struct Service<S, C> {
    _service: core::marker::PhantomData<S>,
    pub(crate) procedures: HashMap<ProcedureId, BoxedProcedureCall<C>>,
}

impl<S, C> Service<S, C> {
    pub const fn builder() -> ServiceBuilder<S, C, Empty>
    where
        S: service::Service,
        C: Context,
    {
        ServiceBuilder::new()
    }
}
