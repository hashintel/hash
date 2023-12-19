use std::{marker::PhantomData, net::SocketAddrV4};

use libp2p::{multiaddr::Protocol, Multiaddr};
use uuid::Uuid;

use crate::{
    harpc::{
        transport::{
            client::{ClientTransportConfig, ClientTransportLayer},
            TransportConfig,
        },
        ActorId, Decode, Encode, PayloadSize, RemoteProcedure, Request, RequestHeader,
        ResponsePayload, ServiceSpecification,
    },
    types::Includes,
};

pub struct Client<S, C> {
    _service: PhantomData<S>,
    context: C,
    transport: ClientTransportLayer,
}

impl<S, C> Client<S, C>
where
    S: ServiceSpecification,
{
    pub fn new(context: C, remote: SocketAddrV4, config: TransportConfig) -> Self {
        Self {
            _service: PhantomData,
            context,
            transport: ClientTransportLayer::new(ClientTransportConfig {
                remote: Multiaddr::from(*remote.ip()).with(Protocol::Tcp(remote.port())),
                transport: config,
            })
            .unwrap(),
        }
    }

    pub async fn call<P>(&self, request: P) -> P::Response
    where
        P: RemoteProcedure,
        S::Procedures: Includes<P>,
        C: Encode<P> + Decode<P::Response>,
    {
        let request = self.context.encode(request);
        let request = Request {
            header: RequestHeader {
                service: S::ID,
                procedure: P::ID,
                actor: ActorId::from(Uuid::nil()),
                size: PayloadSize::len(&request),
            },
            body: request,
        };

        let response = self.transport.call(request).await.unwrap();

        match response.body {
            ResponsePayload::Success(body) => self.context.decode(body),
            ResponsePayload::Error(error) => panic!("error: {:?}", error),
        }
    }
}

#[cfg(test)]
mod tests {
    use authorization::schema::AccountGroupPermission;
    use graph_types::account::{AccountGroupId, AccountId};
    use uuid::Uuid;

    use crate::{
        client::Client,
        specification::account::{
            AccountService, AddAccountGroupMember, CheckAccountGroupPermission, CreateAccount,
        },
    };

    struct DifferentProcedure;
    impl crate::harpc::RemoteProcedure for DifferentProcedure {
        type Response = ();

        const ID: crate::harpc::ProcedureId =
            crate::harpc::ProcedureId::derive("DifferentProcedure");
    }

    async fn _never_called() {
        let client = Client::<AccountService, _>::new();

        let response = client.call(CreateAccount).await;

        let response = client
            .call(AddAccountGroupMember {
                account_group_id: AccountGroupId::new(Uuid::new_v4()),
                account_id: AccountId::new(Uuid::new_v4()),
            })
            .await;

        let response = client
            .call(CheckAccountGroupPermission {
                account_group_id: AccountGroupId::new(Uuid::new_v4()),
                permission: AccountGroupPermission::AddMember,
            })
            .await;

        // let response = client.call(DifferentProcedure).await;
    }

    #[test]
    fn compile() {}
}
