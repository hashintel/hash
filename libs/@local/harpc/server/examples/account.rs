#![feature(never_type, impl_trait_in_assoc_type)]
#![expect(
    clippy::unwrap_used,
    clippy::print_stdout,
    clippy::use_debug,
    unused_variables,
    reason = "example"
)]

extern crate alloc;

use core::{error::Error, fmt::Debug};
use std::time::Instant;

use error_stack::{Report, ResultExt};
use frunk::HList;
use futures::{StreamExt, TryStreamExt, pin_mut, stream};
use graph_types::account::AccountId;
use harpc_client::{
    Client, ClientConfig,
    connection::{Connection, DefaultConnection, default},
};
use harpc_codec::{decode::Decoder, encode::Encoder, json::JsonCodec};
use harpc_net::session::server::SessionId;
use harpc_server::{Server, ServerConfig, router::RouterBuilder, serve::serve};
use harpc_service::{
    Service,
    delegate::ServiceDelegate,
    metadata::Metadata,
    procedure::{Procedure, ProcedureIdentifier},
    role,
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
use multiaddr::multiaddr;
use tower::ServiceExt as _;
use uuid::Uuid;

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
    #[error("unable to encode request")]
    Encode,
    #[error("unable to decode response")]
    Decode,
    #[error("expected at least a single response")]
    ExpectedResponse,
}

trait AccountService<R>
where
    R: role::Role,
{
    fn create_account(
        &self,
        session: &R::Session,
        payload: CreateAccount,
    ) -> impl Future<Output = Result<AccountId, Report<AccountError>>> + Send;
}

#[derive(Debug, Clone)]
struct AccountServiceImpl;

impl<S> AccountService<role::Server<S>> for AccountServiceImpl
where
    S: Send + Sync,
{
    async fn create_account(
        &self,
        session: &S,
        payload: CreateAccount,
    ) -> Result<AccountId, Report<AccountError>> {
        Ok(AccountId::new(Uuid::new_v4()))
    }
}

#[derive(Debug, Clone)]
struct AccountServiceClient;

impl<C, DecoderError, EncoderError> AccountService<role::Client<DefaultConnection<C>>>
    for AccountServiceClient
where
    // TODO: I want to get rid of the boxed stream here, the problem is just that `Output` has `<Input>`
    // as a type parameter, therefore cannot parameterize over it, unless we box or duplicate the
    // trait requirement. both are not great solutions.
    C: Encoder<Error = Report<EncoderError>, Buf: Send + 'static>
        + Decoder<Error = Report<DecoderError>>
        + Clone
        + Send
        + Sync,
    DecoderError: Error + Send + Sync + 'static,
    EncoderError: Error + Send + Sync + 'static,
{
    async fn create_account(
        &self,
        session: &Connection<default::Default, C>,
        payload: CreateAccount,
    ) -> Result<AccountId, Report<AccountError>> {
        let codec = session.codec().clone();
        let connection = session.clone();

        // in theory we could also skip the allocation here, but the problem is that in that case we
        // would send data that *might* be malformed, or is missing data. Instead of skipping said
        // data we allocate. In future we might want to instead have something like
        // tracing::error or a panic instead, but this is sufficient for now.
        // (more importantly it also opt us out of having a stream as input that we then encode,
        // which should be fine?)
        //
        // In theory we'd need to be able to propagate the error into the transport layer, while
        // possible we would await yet another challenge, what happens if the transport layer
        // encounters an error? We can't very well send that error to the server just for us to
        // return it, the server might already be processing things and now suddenly needs to stop?
        // So we'd need to panic or filter on the client and would have partially commited data on
        // the server.
        // This circumvents the problem because we just return an error early, in the future - if
        // the need arises - we might want to investigate request cancellation (which should be
        // possible in the protocol)
        // That'd allow us to cancel the request but would make response handling *a lot* more
        // complex.
        // This isn't a solved problem at all in e.g. rust in general, because there are some things
        // you can't just cancel. How do you roll back a potentially already commited transaction?
        // The current hypothesis is that the overhead required for one less allocation simply isn't
        // worth it, but in the future we might want to revisit this.
        let body: Vec<_> = codec
            .clone()
            .encode(stream::iter([payload]))
            .try_collect()
            .await
            .change_context(AccountError::Encode)?;

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
            stream::iter(body),
        );

        let response = connection
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
    T: AccountService<role::Server<S>> + Send + Sync,
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

async fn server() {
    let server = Server::new(ServerConfig::default()).expect("should be able to start service");

    let router = RouterBuilder::new::<()>(JsonCodec)
        .with_builder(|builder| {
            builder
                .layer(BoxedResponseLayer::new())
                .layer(HandleReportLayer::new())
                .layer(HandleBodyReportLayer::new())
        })
        .register(AccountServerDelegate {
            service: AccountServiceImpl,
        });

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

    let service = AccountServiceClient;

    let connection = client
        .connect(multiaddr![Ip4([127, 0, 0, 1]), Tcp(10500_u16)])
        .await
        .expect("should be able to connect");

    for _ in 0..16 {
        let now = Instant::now();
        let account_id = service
            .create_account(&connection, CreateAccount { id: None })
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
