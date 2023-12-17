use std::collections::HashMap;
use libp2p::request_response::Behaviour;
use libp2p::Swarm;

use crate::{
    rpc::{ProcedureId, Request, Response, ServiceId, ServiceSpecification},
    types::{stack, Empty, Includes, Stack, SupersetOf},
};

pub struct ServiceBuilder<S, P> {
    _service: core::marker::PhantomData<S>,
    _procedures: core::marker::PhantomData<P>,
}

impl<S> ServiceBuilder<S, Empty>
where
    S: ServiceSpecification,
{
    pub fn new() -> Self {
        Self {
            _service: core::marker::PhantomData,
            _procedures: core::marker::PhantomData,
        }
    }
}

impl<S, P> ServiceBuilder<S, P>
where
    S: ServiceSpecification,
{
    pub fn add_procedure<P2>(self) -> ServiceBuilder<S, Stack<P2, P>>
    where
        S::Procedures: Includes<P2>,
    {
        ServiceBuilder {
            _service: core::marker::PhantomData,
            _procedures: core::marker::PhantomData,
        }
    }

    pub fn build(self) -> Service<S>
    where
        P: SupersetOf<S::Procedures>,
    {
        Service {
            _service: core::marker::PhantomData,
            procedures: HashMap::new(),
        }
    }
}

// TODO
pub struct BoxedProcedureCall(());

impl BoxedProcedureCall {
    async fn call(&self, request: Request) -> Response {
        unimplemented!()
    }
}



pub struct Service<S> {
    _service: core::marker::PhantomData<S>,
    swarm: Swarm<Behaviour<libp2p::request_response::cbor::Codec>>
    procedures: HashMap<ProcedureId, BoxedProcedureCall>,
}

impl<S> Service<S>
where
    S: ServiceSpecification,
{
    pub fn id(&self) -> ServiceId {
        S::ID
    }

    async fn route(&self, request: Request) -> Option<Response> {
        let header = request.header;

        let procedure = self.procedures.get(&header.procedure)?;

        let response = procedure.call(request).await;
    }
}

#[cfg(test)]
mod tests {
    use crate::{server::ServiceBuilder, specification::account::AccountService};

    #[test]
    fn all_procedures() {
        let server = ServiceBuilder::<AccountService, _>::new()
            .add_procedure::<crate::specification::account::CreateAccount>()
            .add_procedure::<crate::specification::account::CreateAccountGroup>()
            .add_procedure::<crate::specification::account::CheckAccountGroupPermission>()
            .add_procedure::<crate::specification::account::AddAccountGroupMember>()
            .add_procedure::<crate::specification::account::RemoveAccountGroupMember>()
            .build();
    }
}
