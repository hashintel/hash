#![feature(never_type, impl_trait_in_assoc_type, return_type_notation)]
#![expect(
    clippy::print_stdout,
    clippy::use_debug,
    unused_variables,
    reason = "example"
)]

extern crate alloc;

use core::{fmt::Debug, marker::PhantomData};
use std::time::Instant;

use error_stack::{Report, ResultExt as _};
use frunk::HList;
use harpc_client::{
    Client, ClientConfig,
    connection::{Connection, ConnectionCodec, ConnectionService},
    utils::invoke_call_discrete,
};
use harpc_codec::{decode::ReportDecoder, encode::Encoder, json::JsonCodec};
use harpc_server::{
    Server, ServerConfig,
    error::DelegationError,
    router::RouterBuilder,
    serve::serve,
    utils::{delegate_call_discrete, parse_procedure_id},
};
use harpc_system::{
    Subsystem, SubsystemIdentifier,
    delegate::SubsystemDelegate,
    procedure::{Procedure, ProcedureIdentifier},
};
use harpc_tower::{
    body::Body,
    layer::{
        body_report::HandleBodyReportLayer, boxed::BoxedResponseLayer, report::HandleReportLayer,
    },
    request::Request,
    response::Response,
};
use harpc_types::{
    procedure::ProcedureId, response_kind::ResponseKind, subsystem::SubsystemId, version::Version,
};
use multiaddr::multiaddr;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;
#[derive(Debug, Copy, Clone)]
enum System {
    Account,
}

impl SubsystemIdentifier for System {
    fn from_id(id: SubsystemId) -> Option<Self>
    where
        Self: Sized,
    {
        match id.value() {
            0x00 => Some(Self::Account),
            _ => None,
        }
    }

    fn into_id(self) -> SubsystemId {
        match self {
            Self::Account => SubsystemId::new(0x00),
        }
    }
}

enum AccountProcedureId {
    CreateAccount,
}

impl ProcedureIdentifier for AccountProcedureId {
    type Subsystem = Account;

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

impl Subsystem for Account {
    type ProcedureId = AccountProcedureId;
    type Procedures = HList![CreateAccount];
    type SubsystemId = System;

    const ID: System = System::Account;
    const VERSION: Version = Version {
        major: 0x00,
        minor: 0x00,
    };
}

#[derive(serde::Serialize, serde::Deserialize)]
struct CreateAccount {
    id: Option<ActorEntityUuid>,
}

impl Procedure for CreateAccount {
    type Subsystem = Account;

    const ID: <Self::Subsystem as Subsystem>::ProcedureId = AccountProcedureId::CreateAccount;
}

#[must_use]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display, derive_more::Error)]
#[display("unable to fullfil account request")]
pub struct AccountError;

trait AccountSystem {
    type ExecutionScope;

    async fn create_account(
        &self,
        scope: Self::ExecutionScope,
        payload: CreateAccount,
    ) -> Result<ActorEntityUuid, Report<AccountError>>;
}

#[derive_where::derive_where(Debug, Clone)]
struct AccountSystemImpl<S> {
    _scope: PhantomData<fn() -> *const S>,
}

impl<S> AccountSystemImpl<S> {
    #[must_use]
    const fn new() -> Self {
        Self {
            _scope: PhantomData,
        }
    }
}

impl<S> AccountSystem for AccountSystemImpl<S>
where
    S: Send + Sync,
{
    type ExecutionScope = S;

    async fn create_account(
        &self,
        scope: Self::ExecutionScope,
        payload: CreateAccount,
    ) -> Result<ActorEntityUuid, Report<AccountError>> {
        Ok(ActorEntityUuid::new(Uuid::new_v4()))
    }
}

#[derive(Debug, Clone)]
struct AccountSystemClient<S, C> {
    _service: PhantomData<fn() -> *const S>,
    _codec: PhantomData<fn() -> *const C>,
}

impl<S, C> AccountSystemClient<S, C> {
    const fn new() -> Self {
        Self {
            _service: PhantomData,
            _codec: PhantomData,
        }
    }
}

impl<S, C> Default for AccountSystemClient<S, C> {
    fn default() -> Self {
        Self::new()
    }
}

impl<S, C> AccountSystem for AccountSystemClient<S, C>
where
    S: ConnectionService<C>,
    C: ConnectionCodec,
{
    type ExecutionScope = Connection<S, C>;

    async fn create_account(
        &self,
        scope: Connection<S, C>,
        payload: CreateAccount,
    ) -> Result<ActorEntityUuid, Report<AccountError>> {
        invoke_call_discrete(scope, AccountProcedureId::CreateAccount, [payload])
            .await
            .change_context(AccountError)
    }
}

#[derive(Debug, Clone)]
struct AccountServerDelegate<T> {
    subsystem: T,
}

impl<T> AccountServerDelegate<T> {
    #[must_use]
    const fn new(subsystem: T) -> Self {
        Self { subsystem }
    }
}

impl<T, C> SubsystemDelegate<C> for AccountServerDelegate<T>
where
    T: AccountSystem<create_account(..): Send, ExecutionScope: Send> + Send + Sync,
    C: Encoder + ReportDecoder + Clone + Send,
{
    type Error = Report<DelegationError>;
    type ExecutionScope = T::ExecutionScope;
    type Subsystem = Account;

    type Body<Source>
        = impl Body<Control: AsRef<ResponseKind>, Error = <C as Encoder>::Error>
    where
        Source: Body<Control = !, Error: Send + Sync> + Send;

    async fn call<B>(
        self,
        request: Request<B>,
        scope: T::ExecutionScope,
        codec: C,
    ) -> Result<Response<Self::Body<B>>, Self::Error>
    where
        B: Body<Control = !, Error: Send + Sync> + Send,
    {
        let id = parse_procedure_id(&request)?;

        match id {
            AccountProcedureId::CreateAccount => {
                delegate_call_discrete(request, codec, |payload| async move {
                    self.subsystem.create_account(scope, payload).await
                })
                .await
            }
        }
    }
}

async fn server() {
    let server = Server::new(ServerConfig::default()).expect("should be able to start service");

    let router = RouterBuilder::new::<()>(JsonCodec)
        .with_builder(|builder| {
            builder
                .layer(BoxedResponseLayer::new())
                .layer(HandleReportLayer::new())
                .layer(HandleBodyReportLayer::new())
        })
        .register(AccountServerDelegate::new(AccountSystemImpl::new()));

    let task = router.background_task(server.events());
    tokio::spawn(task.into_future());

    let router = router.build();

    serve(
        server
            .listen(multiaddr![Ip4([0, 0, 0, 0]), Tcp(10500_u16)])
            .await
            .expect("should be able to listen"),
        router,
    )
    .await;
}

async fn client() {
    let client =
        Client::new(ClientConfig::default(), JsonCodec).expect("should be able to start service");

    let service = AccountSystemClient::new();

    let connection = client
        .connect(multiaddr![Ip4([127, 0, 0, 1]), Tcp(10500_u16)])
        .await
        .expect("should be able to connect");

    for _ in 0..16 {
        let now = Instant::now();
        let account_id = service
            .create_account(connection.clone(), CreateAccount { id: None })
            .await
            .expect("should be able to create account");

        println!("account_id: {account_id:?}, took: {:?}", now.elapsed());
    }
}

#[tokio::main]
async fn main() {
    if std::env::args().nth(1) == Some("server".to_owned()) {
        server().await;
    } else {
        client().await;
    }
}
