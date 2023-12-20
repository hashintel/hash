use libp2p::futures::future::BoxFuture;

use crate::harpc::{
    procedure::{ProcedureCall, ProcedureId, RemoteProcedure},
    transport::message::{request::Request, response::Response},
    Context,
};

struct ErasedRemoteProcedure;
impl RemoteProcedure for ErasedRemoteProcedure {
    type Response = Response;

    const ID: ProcedureId = ProcedureId::erased();
}

#[derive(Clone)]
struct AnonymousProcedureCall<P>(P);

impl<P, C> ProcedureCall<C> for AnonymousProcedureCall<P>
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

type BoxedProcedure<C> = Box<
    dyn ErasedProcedureCall<
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
    pub(crate) fn new<P>(procedure: P) -> Self
    where
        P: ProcedureCall<C> + Clone + Send + 'static,
    {
        Self(Box::new(AnonymousProcedureCall(procedure)))
    }

    pub(crate) fn call(&self, request: Request, context: C) -> BoxFuture<'static, Response> {
        self.0.call_ref(request, context)
    }
}

impl<C> Clone for BoxedProcedureCall<C>
where
    C: Context,
{
    fn clone(&self) -> Self {
        Self(self.0.clone_box())
    }
}

trait ErasedProcedureCall<C>: ProcedureCall<C>
where
    C: Context,
{
    fn call_ref(&self, request: Request, context: C) -> Self::Future;

    fn clone_box(
        &self,
    ) -> Box<dyn ErasedProcedureCall<C, Future = Self::Future, Procedure = Self::Procedure> + Send>;
}

impl<P, C> ErasedProcedureCall<C> for P
where
    P: ProcedureCall<C> + Clone + Send + 'static,
    C: Context,
{
    fn call_ref(&self, request: Request, context: C) -> Self::Future {
        self.clone().call(request, context)
    }

    fn clone_box(
        &self,
    ) -> Box<dyn ErasedProcedureCall<C, Future = P::Future, Procedure = P::Procedure> + Send> {
        Box::new(self.clone())
    }
}
