use std::{marker::PhantomData, net::SocketAddrV4};

use error_stack::{Result, ResultExt};
use libp2p::{multiaddr::Protocol, Multiaddr};
use thiserror::Error;
use uuid::Uuid;

use crate::{
    harpc::{
        procedure::RemoteProcedure,
        service::Service,
        transport::{
            client::{ClientTransportConfig, ClientTransportLayer},
            message::{
                actor::ActorId,
                request::{Request, RequestFlags, RequestHeader},
                response::{ResponseError, ResponsePayload},
                size::PayloadSize,
                version::{TransportVersion, Version},
            },
            TransportConfig,
        },
        Decode, Encode,
    },
    types::Includes,
};

#[derive(Debug, Copy, Clone, Error)]
pub enum TransportError {
    #[error("connection has been closed by the remote peer")]
    ConnectionClosed,
    #[error("unknown protocol version")]
    InvalidTransportVersion,
    #[error("mismatch between reported payload size and actual payload size")]
    InvalidPayloadSize,
    #[error("invalid payload")]
    InvalidPayload,
}

#[derive(Debug, Copy, Clone, Error)]
pub enum RoutingError {
    #[error("unknown service")]
    UnknownService,
    #[error("service found, but request version unknown")]
    UnknownServiceVersion,
    #[error("unknown procedure")]
    UnknownProcedure,
}

#[derive(Debug, Copy, Clone, Error)]
pub enum Error {
    #[error("transport error: {0}")]
    Transport(TransportError),
    #[error("routing error: {0}")]
    Routing(RoutingError),
    // TODO: add these errors correctly
    #[error("unable to encode request")]
    EncodeRequest,
    #[error("unable to encode response")]
    EncodeResponse,
    #[error("unable to decode request")]
    DecodeRequest,
    #[error("unable to decode response")]
    DecodeResponse,
    #[error("timeout while waiting for response")]
    Timeout,
    #[error("internal error")]
    Internal,
    #[error("unknown error")]
    Unknown,
}

impl From<ResponseError> for Error {
    fn from(value: ResponseError) -> Self {
        match value {
            ResponseError::DeadlineExceeded => Self::Timeout,
            ResponseError::ConnectionClosed => Self::Transport(TransportError::ConnectionClosed),
            ResponseError::UnknownServiceVersion => {
                Self::Routing(RoutingError::UnknownServiceVersion)
            }
            ResponseError::UnknownService => Self::Routing(RoutingError::UnknownService),
            ResponseError::UnknownProcedure => Self::Routing(RoutingError::UnknownProcedure),
            ResponseError::InvalidTransportVersion => {
                Self::Transport(TransportError::InvalidTransportVersion)
            }
            ResponseError::InvalidPayloadSize => {
                Self::Transport(TransportError::InvalidPayloadSize)
            }
            ResponseError::InvalidPayload => Self::Transport(TransportError::InvalidPayload),
            ResponseError::EncodingError => Self::EncodeResponse,
            ResponseError::DecodingError => Self::DecodeRequest,
        }
    }
}

pub struct Client<S, C> {
    _service: PhantomData<S>,
    context: C,
    transport: ClientTransportLayer,
}

impl<S, C> Client<S, C>
where
    S: Service,
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

    pub async fn call<P>(&self, request: P) -> Result<P::Response, Error>
    where
        P: RemoteProcedure,
        S::Procedures: Includes<P>,
        C: Encode<P> + Decode<P::Response>,
    {
        let request = self
            .context
            .encode(request)
            .await
            .change_context(Error::EncodeRequest)?;

        let request = Request {
            header: RequestHeader {
                flags: RequestFlags::new(),
                version: Version {
                    transport: TransportVersion::new(0x00),
                    service: S::VERSION,
                },
                service: S::ID,
                procedure: P::ID,
                actor: ActorId::from(Uuid::nil()),
                size: PayloadSize::len(&request),
            },
            body: request,
        };

        let response = self
            .transport
            .call(request)
            .await
            .change_context(Error::Internal)?;

        match response.body {
            ResponsePayload::Success(body) => self
                .context
                .decode(body)
                .await
                .change_context(Error::DecodeResponse),
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
    impl crate::harpc::procedure::RemoteProcedure for DifferentProcedure {
        type Response = ();

        const ID: crate::harpc::procedure::ProcedureId =
            crate::harpc::procedure::ProcedureId::derive("DifferentProcedure");
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
