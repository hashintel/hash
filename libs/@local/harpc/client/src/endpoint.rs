use core::future::ready;

use deadpool::managed::{self, PoolError};
use error_stack::{Report, ResultExt};
use multiaddr::Multiaddr;

use crate::{Client, connection::Connection};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum EndpointError {
    #[error("unable to create connection to endpoint")]
    Dial,
    #[error("connection pool is unable to connect to endpoint")]
    Connect,
    #[error("executing a connection pool hook failed")]
    Hook,
}

fn pool_error_into_report(error: PoolError<Report<EndpointError>>) -> Report<EndpointError> {
    let error = match error {
        PoolError::Timeout(r#type) => PoolError::<!>::Timeout(r#type),
        PoolError::Backend(error) => return error,
        PoolError::Closed => PoolError::<!>::Closed,
        PoolError::NoRuntimeSpecified => PoolError::<!>::NoRuntimeSpecified,
        PoolError::PostCreateHook(managed::HookError::Backend(error)) => {
            return error.change_context(EndpointError::Hook);
        }
        PoolError::PostCreateHook(managed::HookError::Message(message)) => {
            return Report::new(PoolError::<!>::PostCreateHook(managed::HookError::Message(
                message,
            )))
            .change_context(EndpointError::Hook);
        }
    };

    Report::new(error).change_context(EndpointError::Connect)
}

#[derive(Debug, Clone)]
pub struct Endpoint {
    pool: managed::Pool<EndpointManager, Connection>,
}

impl Endpoint {
    pub(crate) fn new(client: Client, target: Multiaddr) -> Self {
        let manager = EndpointManager { client, target };

        let pool = managed::Pool::builder(manager)
            .build()
            .expect("runtime should be configured");

        Self { pool }
    }

    pub async fn connect(&self) -> Result<Connection, Report<EndpointError>> {
        match self.pool.get().await {
            Ok(connection) => Ok(connection),
            Err(error) => Err(pool_error_into_report(error)),
        }
    }
}

#[derive(Debug)]
pub(crate) struct EndpointManager {
    client: Client,
    target: Multiaddr,
}

impl managed::Manager for EndpointManager {
    type Error = Report<EndpointError>;
    type Type = harpc_net::session::client::Connection;

    fn detach(&self, _obj: &mut Self::Type) {}

    async fn create(&self) -> Result<Self::Type, Self::Error> {
        self.client
            .connect(self.target.clone())
            .await
            .change_context(EndpointError::Dial)
    }

    fn recycle(
        &self,
        obj: &mut Self::Type,
        _: &managed::Metrics,
    ) -> impl Future<Output = managed::RecycleResult<Self::Error>> + Send {
        if obj.is_healthy() {
            ready(managed::RecycleResult::Ok(()))
        } else {
            ready(managed::RecycleResult::Err(managed::RecycleError::message(
                "the connection is currently shutting down or has been shut down",
            )))
        }
    }
}
