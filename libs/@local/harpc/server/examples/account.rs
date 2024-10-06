#![feature(never_type, impl_trait_in_assoc_type)]
#![expect(
    dead_code,
    clippy::unwrap_used,
    clippy::empty_enum,
    clippy::todo,
    unused_variables,
    reason = "non-working example code"
)]

use core::fmt::Debug;

use error_stack::Report;
use frunk::HList;
use futures::{StreamExt, pin_mut, stream};
use graph_types::account::AccountId;
use harpc_net::codec::{ErrorEncoder, ValueDecoder, ValueEncoder};
use harpc_server::{router::RouterBuilder, serve::serve};
use harpc_service::{
    Service,
    delegate::ServiceDelegate,
    metadata::Metadata,
    procedure::{Procedure, ProcedureIdentifier},
    role::{Client, ClientSession, Role, Server},
};
use harpc_tower::{
    body::{Body, BodyExt},
    layer::{boxed::BoxedResponseLayer, report::HandleReportLayer},
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

#[derive(Debug, Clone)]
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

#[derive(Debug, Clone)]
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

#[derive(Debug, Clone)]
struct AccountServerDelegate<T> {
    service: T,
}

impl<T, S, C> ServiceDelegate<S, C> for AccountServerDelegate<T>
where
    T: AccountService<Server<S>> + Send + Sync,
    S: Send + Sync,
    C: ValueEncoder<AccountId>
        + ValueDecoder<CreateAccount, Error: Debug>
        + Clone
        + Send
        + Sync
        + 'static,
{
    type Error = Report<AccountError>;
    type Service = Account;

    type Body = impl Body<Control: AsRef<ResponseKind>>;

    async fn call<B>(
        self,
        request: Request<B>,
        session: S,
        codec: C,
    ) -> Result<Response<Self::Body>, Self::Error>
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

                let stream = codec.clone().decode_stream(data).await;
                pin_mut!(stream);

                let payload = stream.next().await.unwrap().unwrap();

                let account_id = self.service.create_account(&session, payload).await?;
                let data = codec.encode_stream(stream::iter([account_id])).await;

                Ok(Response::from_ok(Parts::new(session_id), data))
            }
        }
    }
}

#[derive(Debug, Clone)]
struct NoopCodec;

impl<T> ValueEncoder<T> for NoopCodec {
    type Error = !;

    async fn encode_stream(
        self,
        items: impl stream::Stream<Item = T> + Send + Sync,
    ) -> impl stream::Stream<Item = Result<tokio_util::bytes::Bytes, Self::Error>> + Send + Sync
    {
        items.map(|_| Ok(tokio_util::bytes::Bytes::new()))
    }
}

impl ErrorEncoder for NoopCodec {
    async fn encode_report<C>(
        &self,
        report: Report<C>,
    ) -> harpc_net::session::error::TransactionError {
        todo!()
    }

    async fn encode_error<E>(&self, error: E) -> harpc_net::session::error::TransactionError
    where
        E: harpc_net::codec::WireError + Send,
    {
        todo!()
    }
}

impl<T> ValueDecoder<T> for NoopCodec
where
    T: Send + Sync,
{
    type Error = !;

    #[expect(unreachable_code, reason = "needed for inference")]
    async fn decode_stream<B, E>(
        self,
        items: impl stream::Stream<Item = core::result::Result<B, E>> + Send + Sync,
    ) -> impl stream::Stream<Item = Result<T, Self::Error>> + Send + Sync
    where
        B: tokio_util::bytes::Buf,
    {
        todo!("NoopCodec::decode_stream");
        stream::empty()
    }
}

fn main() {
    let router = RouterBuilder::new::<()>(NoopCodec)
        .with_builder(|builder| {
            builder
                .layer(HandleReportLayer::new(NoopCodec))
                .layer(BoxedResponseLayer::new())
        })
        .register(AccountServerDelegate {
            service: AccountServiceImpl,
        })
        .build();

    serve(stream::empty(), router);
}
