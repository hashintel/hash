mod credentials;
mod hashql;

use aide::{openapi::Info, transform::TransformOpenApi};
use hash_graph_authorization::policies::store::{PolicyStore, PrincipalStore};
use hash_graph_postgres_store::store::postgres::PostgresClient;
use hash_graph_store::pool::StorePool;

use self::credentials::Credentials;
pub use self::hashql::CompilerState;
use super::{Api, ApiState, documentation, openapi, routing::Routes};

/// The path the internal API, its documentation and the legacy document are served under.
pub(super) const PREFIX: &str = "/_api";

fn routes<S>() -> Routes<ApiState<S>>
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>
        + Send
        + Sync
        + 'static,
{
    Routes::new()
        .route("/hashql", hashql::route::<S>())
        .tag("HashQL")
}

pub(super) fn api<S>() -> Api<ApiState<S>>
where
    S: for<'pool> StorePool<Store<'pool>: AsRef<PostgresClient> + PrincipalStore + PolicyStore>
        + Send
        + Sync
        + 'static,
{
    openapi::build::<Credentials, _>(
        PREFIX,
        Info {
            title: "Internal".to_owned(),
            version: "unversioned".to_owned(),
            description: Some(documentation::OVERVIEW.to_owned()),
            ..Info::default()
        },
        routes::<S>,
        document,
    )
}

const fn document(document: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    document
}
