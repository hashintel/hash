//! Example Implementation just to get everything right, to be removed before PR merging

use core::future::Future;

use error_stack::Result;
use graph_types::account::AccountId;
use harpc_net::session::server::SessionId;
use harpc_types::{service::ServiceId, version::Version};

pub trait ProcedureId: Sized {
    fn from_u16(id: u16) -> Option<Self>;
    fn into_u16(self) -> u16;
}

pub struct Deprecation {
    since: Version,
}

pub struct Removal {
    r#in: Version,
}

pub trait Procedure {
    type Id: ProcedureId;
    type Response;

    const ID: Self::Id;

    fn since() -> Version;

    fn deprecation() -> Option<Deprecation> {
        None
    }
    fn removal() -> Option<Removal> {
        None
    }
}

pub struct CreateAccount {
    id: Option<AccountId>,
}

impl Procedure for CreateAccount {
    type Id = AccountProcedureId;
    type Response = AccountId;

    const ID: Self::Id = AccountProcedureId::CreateAccount;

    fn since() -> Version {
        Version {
            major: 0x00,
            minor: 0x00,
        }
    }
}

pub trait Session {
    fn id(&self) -> SessionId;
    // TODO: do we need session specific state?!
}

// async fn call(
//     &self,
//     request: Request<impl Body<Control = !> + Send + Sync>,
//     codec: impl Codec,
// ) -> Response<impl Body> {
//     // TODO: how would a client implementation look like? wait no, the server only needs this,
//     //       part of a Service<Server> client or something
//     let ProcedureDescriptor { id } = request.procedure();
//     let id = AccountProcedureId::from_u16(id.value()).unwrap();

//     match id {
//         AccountProcedureId::CreateAccount => {
//             let decoder = codec.decoder();
//             let encoder = codec.encoder();

//             let body = request.into_body();
//             let data = body.into_stream().into_data_stream();

//             let stream = decoder.decode_stream(data).await;
//             pin_mut!(stream);

//             let payload: CreateAccount = stream.next().await.unwrap().unwrap();

//             let result = self.create_account(&Server, payload).await;

//             let response = match result {
//                 Ok(account_id) => {
//                     let data = encoder.encode(account_id).await;
//                     Response::ok(data)
//                 }
//                 Err(_) => Response::error(),
//             };
//         }
//     }

//     todo!("Implement me!")
// }

pub struct AccountError;

pub enum AccountProcedureId {
    CreateAccount,
}

impl ProcedureId for AccountProcedureId {
    fn from_u16(id: u16) -> Option<Self> {
        match id {
            0 => Some(Self::CreateAccount),
            _ => None,
        }
    }

    fn into_u16(self) -> u16 {
        match self {
            Self::CreateAccount => 0,
        }
    }
}

pub struct State<A, S, T> {
    account_api_pool: A,
    store_pool: S,
    temporal_client: T,
}

pub trait Role {
    type Session: Session;
}

pub trait AccountService<R> {
    fn create_account(
        &self,
        session: &R::Session,
        payload: CreateAccount,
    ) -> impl Future<Output = Result<AccountId, AccountError>>
    where
        R: Role;
}

pub struct AccountServiceInfo;

pub struct AccountServiceImpl<A, S, T> {
    state: State<A, S, T>,
}

pub struct Server;

impl Role for Server {
    type Session = Server;
}

impl Session for Server {
    fn id(&self) -> SessionId {
        todo!()
    }
}

impl<A, S, T> AccountService<Server> for AccountServiceImpl<A, S, T>
where
    A: Send + Sync,
    S: Send + Sync,
    T: Send + Sync,
{
    async fn create_account(
        &self,
        session: &Server,
        payload: CreateAccount,
    ) -> Result<AccountId, AccountError> {
        todo!("Implement me!")
    }
}

pub struct AccountServiceDelegate<A, S, T> {
    service: AccountServiceImpl<A, S, T>,
}

pub trait ServiceDelegate {
    type Service: ServiceInfo;

    async fn call_procedure() {
        todo!()
    }
}

pub trait Procedures {}

pub trait ServiceInfo {
    type Procedures: Procedures;

    const ID: ServiceId;
    const VERSION: Version;

    fn since() -> Version;

    fn deprecation() -> Option<Deprecation> {
        None
    }

    fn removal() -> Option<Removal> {
        None
    }
}

pub struct Client;
pub struct AccountServiceClient {
    inner: Client,
}

impl AccountService<Client> for AccountServiceClient {
    fn create_account(
        &self,
        session: &Client,
        payload: CreateAccount,
    ) -> impl Future<Output = Result<AccountId, AccountError>> {
        // send to server, recv response
        todo!()
    }
}
