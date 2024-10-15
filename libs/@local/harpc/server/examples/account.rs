#![feature(never_type, impl_trait_in_assoc_type)]
#![expect(
    clippy::unwrap_used,
    clippy::todo,
    unused_variables,
    reason = "non-working example code"
)]

use core::{error::Error, fmt::Debug, future};

use bytes::Buf;
use error_stack::{Report, ResultExt};
use frunk::HList;
use futures::{Stream, StreamExt, pin_mut, stream};
use graph_types::account::AccountId;
use harpc_codec::{decode::Decoder, encode::Encoder, json::JsonCodec};
use harpc_net::session::server::SessionId;
use harpc_server::{router::RouterBuilder, serve::serve};
use harpc_service::{
    Service,
    delegate::ServiceDelegate,
    metadata::Metadata,
    procedure::{Procedure, ProcedureIdentifier},
    role::{Client, Role, Server},
};
use harpc_tower::{
    Extensions,
    body::{Body, BodyExt},
    layer::{
        body_report::HandleBodyReportLayer, boxed::BoxedResponseLayer, report::HandleReportLayer,
    },
    request::{self, Request},
    response::{Parts, Response},
};
use harpc_types::{
    procedure::{ProcedureDescriptor, ProcedureId},
    response_kind::ResponseKind,
    service::{ServiceDescriptor, ServiceId},
    version::Version,
};
use tower::ServiceExt as _;

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

#[derive(serde::Serialize, serde::Deserialize)]
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
enum AccountError {
    #[error("unable to establish connection to server")]
    Connection,
    #[error("unable to decode response")]
    Decode,
    #[error("expected at least a single response")]
    ExpectedResponse,
}

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
#[expect(dead_code, reason = "dummy client")]
struct AccountServiceClient;

impl<S, E, St, ResData, ResError> AccountService<Client<(S, E)>> for AccountServiceClient
where
    S: tower::Service<
            Request<<E as Encoder>::Output<stream::Once<future::Ready<CreateAccount>>>>,
            Response = Response<St>,
            Future: Send,
            Error: Error + Send + Sync + 'static,
        > + Clone
        + Send
        + Sync,
    E: Encoder + Decoder<Error: Error + Send + Sync + 'static> + Clone + Send + Sync,
    St: Stream<Item = Result<ResData, ResError>> + Send + Sync,
    ResData: Buf,
{
    async fn create_account(
        &self,
        session: &(S, E),
        payload: CreateAccount,
    ) -> Result<AccountId, Report<AccountError>> {
        let (service, codec) = session.clone();

        let body = codec.clone().encode(stream::once(future::ready(payload)));

        let request = Request::from_parts(
            request::Parts {
                service: ServiceDescriptor {
                    id: Account::ID,
                    version: Account::VERSION,
                },
                procedure: ProcedureDescriptor {
                    id: CreateAccount::ID.into_id(),
                },
                session: SessionId::CLIENT,
                extensions: Extensions::new(),
            },
            body,
        );

        let response = service
            .oneshot(request)
            .await
            .change_context(AccountError::Connection)?;

        let (parts, body) = response.into_parts();

        let data = codec.decode(body);
        tokio::pin!(data);

        let item = data
            .next()
            .await
            .ok_or_else(|| Report::new(AccountError::ExpectedResponse))?
            .change_context(AccountError::Decode)?;

        Ok(item)
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
    C: Encoder<Error: Debug> + Decoder<Error: Debug> + Clone + Send + Sync + 'static,
{
    type Error = Report<AccountError>;
    type Service = Account;

    type Body<Source>
        = impl Body<Control: AsRef<ResponseKind>, Error = <C as Encoder>::Error>
    where
        Source: Body<Control = !, Error: Send + Sync> + Send + Sync;

    async fn call<B>(
        self,
        request: Request<B>,
        session: S,
        codec: C,
    ) -> Result<Response<Self::Body<B>>, Self::Error>
    where
        B: Body<Control = !, Error: Send + Sync> + Send + Sync,
    {
        let session_id = request.session();
        let ProcedureDescriptor { id } = request.procedure();
        let id = AccountProcedureId::from_id(id).unwrap();

        match id {
            AccountProcedureId::CreateAccount => {
                let body = request.into_body();
                let data = body.into_stream().into_data_stream();

                let stream = codec.clone().decode(data);
                pin_mut!(stream);

                let payload = stream.next().await.unwrap().unwrap();

                let account_id = self.service.create_account(&session, payload).await?;
                let data = codec.encode(stream::iter([account_id]));

                Ok(Response::from_ok(Parts::new(session_id), data))
            }
        }
    }
}

#[tokio::main]
async fn main() {
    let router = RouterBuilder::new::<()>(JsonCodec)
        .with_builder(|builder, codec| {
            builder
                .layer(BoxedResponseLayer::new())
                .layer(HandleReportLayer::new(*codec))
                .layer(HandleBodyReportLayer::new(*codec))
        })
        .register(AccountServerDelegate {
            service: AccountServiceImpl,
        });

    let task = router.background_task::<_, !>(stream::empty());
    tokio::spawn(task.into_future());

    let router = router.build();

    serve(stream::empty(), router).await;
}
