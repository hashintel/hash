pub mod account;
pub mod auth;
pub mod echo;
mod session;

use alloc::sync::Arc;

use harpc_codec::{decode::ReportDecoder, encode::ReportEncoder};
use harpc_server::{
    route::Route,
    router::{Router, RouterBuilder},
    session::Task,
};
use harpc_system::SubsystemIdentifier;
use harpc_tower::{
    body::server::request::RequestBody,
    layer::{body_report::HandleBodyReportLayer, report::HandleReportLayer},
};
use harpc_types::subsystem::SubsystemId;
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_store::pool::StorePool;
use hash_temporal_client::TemporalClient;

use self::{
    account::{AccountDelegate, AccountServer},
    auth::{AuthenticationDelegate, AuthenticationServer},
    echo::{EchoDelegate, EchoServer},
    session::Account,
};

#[derive(Debug, Copy, Clone)]
pub enum GraphSubsystemId {
    Echo,
    Authentication,
    Account,
}

impl SubsystemIdentifier for GraphSubsystemId {
    fn from_id(id: SubsystemId) -> Option<Self>
    where
        Self: Sized,
    {
        match id.value() {
            0x00 => Some(Self::Echo),
            0x01 => Some(Self::Authentication),
            0x02 => Some(Self::Account),
            _ => None,
        }
    }

    fn into_id(self) -> SubsystemId {
        match self {
            Self::Echo => SubsystemId::new(0x00),
            Self::Authentication => SubsystemId::new(0x01),
            Self::Account => SubsystemId::new(0x02),
        }
    }
}

pub struct Dependencies<S, C> {
    pub store: Arc<S>,
    pub temporal_client: Option<TemporalClient>,
    pub codec: C,
}

pub fn rpc_router<S, C, N>(
    dependencies: Dependencies<S, C>,
    notifications: N,
) -> (
    Router<impl Route<RequestBody, ResponseBody: Send, Future: Send> + Send>,
    Task<Account, N>,
)
where
    S: StorePool + Send + Sync + 'static,
    C: ReportEncoder + ReportDecoder + Clone + Send + Sync + 'static,
    for<'p> S::Store<'p>: PrincipalStore,
{
    let builder = RouterBuilder::new(dependencies.codec)
        .with_builder(|builder| {
            builder
                .layer(HandleReportLayer::new())
                .layer(HandleBodyReportLayer::new())
        })
        .register(AuthenticationDelegate::new(AuthenticationServer))
        .register(AccountDelegate::new(AccountServer {
            store_pool: dependencies.store,
            temporal_client: dependencies.temporal_client.map(Arc::new),
        }))
        .register(EchoDelegate::new(EchoServer));

    let task = builder.background_task(notifications);

    let router = builder.build();

    (router, task)
}
