#![feature(never_type)]
use core::marker::PhantomData;

use error_stack::Report;
use frunk::HList;
use futures::pin_mut;
use graph_types::account::AccountId;
use harpc_net::codec::{Codec, Decoder, Encoder};
use harpc_service::{
    delegate::{CodecRequirement, ServiceDelegate},
    metadata::Metadata,
    procedure::{Procedure, ProcedureIdentifier},
    role::{Client, ClientSession, Role, Server},
    service::Service,
};
use harpc_tower::{
    body::{Body, BodyExt},
    request::Request,
    response::Response,
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
            removal: None,
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
            removal: None,
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

impl<T> AccountService<Server<T>> for AccountServiceImpl
where
    T: Send + Sync,
{
    async fn create_account(
        &self,
        _: &<Server<T> as Role>::Session,
        _: CreateAccount,
    ) -> Result<AccountId, Report<AccountError>> {
        todo!()
    }
}

struct AccountServiceClient;

impl<T> AccountService<Client<T>> for AccountServiceClient
where
    T: ClientSession + Send + Sync,
{
    async fn create_account(
        &self,
        _: &<Client<T> as Role>::Session,
        _: CreateAccount,
    ) -> Result<AccountId, Report<AccountError>> {
        todo!()
    }
}

struct AccountServerDelegate<T, S> {
    service: T,
    _session: PhantomData<fn() -> *const S>,
}

// struct A;
// struct B;
// struct C;

struct AccountCodecRequirement;
impl<C> CodecRequirement<C> for AccountCodecRequirement where C: Codec<CreateAccount> {}

// struct CodecRequirement;
// impl<E> CodecSatisfies<E> for CodecRequirement where E: Codec<A> + Codec<B> + Codec<C> {}

fn acquire_session<S>() -> S {
    todo!()
}

// TODO: SessionStorage
impl<T, S> ServiceDelegate for AccountServerDelegate<T, S>
where
    T: AccountService<Server<S>>,
    S: Send + Sync,
{
    type CodecRequirement = AccountCodecRequirement;
    type Service = Account;

    async fn call<B, C>(
        &self,
        request: Request<B>,
        codec: &C,
    ) -> Response<impl Body<Control: AsRef<ResponseKind>>>
    where
        B: Body<Control = !> + Send + Sync,
        AccountCodecRequirement: CodecRequirement<C>,
    {
        let ProcedureDescriptor { id } = request.procedure();
        let id = AccountProcedureId::from_id(id).unwrap();

        match id {
            AccountProcedureId::CreateAccount => {
                let encoder = <C as Codec<CreateAccount>>::encoder(codec);
                let decoder = <C as Codec<CreateAccount>>::decoder(codec);

                let body = request.into_body();
                let data = body.into_stream().into_data_stream();

                let stream = decoder.decode_stream(data).await;
                pin_mut!(stream);

                let payload = stream.next().await.unwrap().unwrap();

                let result = self
                    .service
                    .create_account(&acquire_session(), payload)
                    .await;

                let response = match result {
                    Ok(account_id) => {
                        let data = encoder.encode(account_id).await;
                        Response::ok(data)
                    }
                    Err(_) => Response::error(),
                };

                return response;
            }
        }
    }
}

fn main() {}
