#![feature(never_type)]
use core::marker::PhantomData;

use error_stack::Report;
use frunk::HList;
use graph_types::account::AccountId;
use harpc_service::{
    delegate::ServiceDelegate,
    metadata::Metadata,
    procedure::{Procedure, ProcedureIdentifier},
    role::{Client, ClientSession, Role, Server},
    service::Service,
};
use harpc_tower::{body::Body, request::Request, response::Response};
use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};
use harpc_wire_protocol::response::kind::ResponseKind;

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

impl<T, S> ServiceDelegate for AccountServerDelegate<T, S>
where
    T: AccountService<Server<S>>,
    S: Send + Sync,
{
    type Codec;
    type Service = Account;

    fn call<B>(
        request: Request<B>,
        codec: &Self::Codec,
    ) -> impl Future<Output = Response<impl Body<Control: AsRef<ResponseKind>>>> + Send
    where
        B: Body<Control = !> + Send + Sync,
    {
        todo!()
    }
}

fn main() {}
