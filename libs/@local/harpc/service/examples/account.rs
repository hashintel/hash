#![feature(never_type)]
#![expect(
    dead_code,
    clippy::unwrap_used,
    clippy::empty_enum,
    clippy::todo,
    unused_variables,
    reason = "non-working example code"
)]

use error_stack::Report;
use frunk::HList;
use futures::{StreamExt, pin_mut, stream};
use graph_types::account::AccountId;
use harpc_net::codec::{Decoder, Encoder};
use harpc_service::{
    Service,
    delegate::ServiceDelegate,
    metadata::Metadata,
    procedure::{Procedure, ProcedureIdentifier},
    role::{Client, ClientSession, Role, Server},
};
use harpc_tower::{
    body::{Body, BodyExt},
    either::Either,
    request::Request,
    response::{Parts, Response},
};
use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};
use harpc_wire_protocol::{request::procedure::ProcedureDescriptor, response::kind::ResponseKind};

enum AccountProcedureId {
    CreateAccount,
}

impl ProcedureIdentifier for AccountProcedureId {
    fn from_id(id: ProcedureId) -> Option<Self> {
        match id.value() {
            0 => Some(Self::CreateAccount),
            _ => None,
        }
    }

    fn into_id(self) -> ProcedureId {
        match self {
            Self::CreateAccount => ProcedureId::new(0),
        }
    }
}

struct Account;

impl Service for Account {
    type ProcedureId = AccountProcedureId;
    type Procedures = HList![CreateAccount];

    const ID: ServiceId = ServiceId::new(0);
    const VERSION: Version = Version {
        major: 0x00,
        minor: 0x00,
    };

    fn metadata() -> Metadata {
        Metadata {
            since: Version {
                major: 0x00,
                minor: 0x00,
            },
            deprecation: None,
        }
    }
}

struct CreateAccount {
    id: Option<AccountId>,
}

impl Procedure for CreateAccount {
    type Service = Account;

    const ID: <Self::Service as Service>::ProcedureId = AccountProcedureId::CreateAccount;

    fn metadata() -> Metadata {
        Metadata {
            since: Version {
                major: 0x00,
                minor: 0x00,
            },
            deprecation: None,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, thiserror::Error)]
enum AccountError {}

trait AccountService<R>
where
    R: Role,
{
    fn create_account(
        &self,
        session: &R::Session,
        payload: CreateAccount,
    ) -> impl Future<Output = Result<AccountId, Report<AccountError>>> + Send;
}

struct AccountServiceImpl;

impl<S> AccountService<Server<S>> for AccountServiceImpl
where
    S: Send + Sync,
{
    async fn create_account(
        &self,
        session: &S,
        payload: CreateAccount,
    ) -> Result<AccountId, Report<AccountError>> {
        todo!()
    }
}

struct AccountServiceClient;

impl<S> AccountService<Client<S>> for AccountServiceClient
where
    S: ClientSession + Send + Sync,
{
    async fn create_account(
        &self,
        session: &S,
        payload: CreateAccount,
    ) -> Result<AccountId, Report<AccountError>> {
        todo!()
    }
}

struct AccountServerDelegate<T> {
    service: T,
}

impl<T, S, C> ServiceDelegate<S, C> for AccountServerDelegate<T>
where
    T: AccountService<Server<S>> + Send + Sync,
    S: Send + Sync,
    C: Encoder<AccountId> + Decoder<CreateAccount> + Send + Sync,
{
    type Service = Account;

    async fn call<B>(
        &self,
        request: Request<B>,
        session: &S,
        codec: &C,
    ) -> Response<impl Body<Control: AsRef<ResponseKind>>>
    where
        B: Body<Control = !> + Send + Sync,
    {
        let session_id = request.session();
        let ProcedureDescriptor { id } = request.procedure();
        let id = AccountProcedureId::from_id(id).unwrap();

        match id {
            AccountProcedureId::CreateAccount => {
                let body = request.into_body();
                let data = body.into_stream().into_data_stream();

                let stream = codec.decode_stream(data).await;
                pin_mut!(stream);

                let payload = stream.next().await.unwrap().unwrap();

                let result = self.service.create_account(session, payload).await;

                match result {
                    Ok(account_id) => {
                        let data = codec.encode_stream(stream::iter([account_id])).await;

                        Response::from_ok(Parts::new(session_id), data).map_body(Either::Left)
                    }
                    Err(error) => {
                        let error = codec.encode_report(error).await;

                        Response::from_error(Parts::new(session_id), error)
                            .map_body(|body| body.map_err(|error| match error {}))
                            .map_body(Either::Right)
                    }
                }
            }
        }
    }
}

fn main() {}
