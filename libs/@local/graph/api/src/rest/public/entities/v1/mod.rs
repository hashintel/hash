mod create;
mod entity;
mod property_metadata;

use aide::openapi::Info;
use hash_graph_store::pool::StorePool;

use crate::rest::{Api, ApiState, documentation, openapi, public, routing::Routes};

fn routes<S>() -> Routes<ApiState<S>>
where
    S: StorePool + Send + Sync + 'static,
{
    Routes::new()
        .route("/", create::route::<S>())
        .route("/{entityId}", entity::route::<S>())
        .tag("Entity")
}

pub(super) fn api<S>() -> Api<ApiState<S>>
where
    S: StorePool + Send + Sync + 'static,
{
    openapi::build::<public::Credentials, _>(
        "/entities/v1",
        Info {
            title: "Entities".to_owned(),
            version: "1".to_owned(),
            description: Some(documentation::OVERVIEW.to_owned()),
            ..Info::default()
        },
        routes::<S>,
        public::document,
    )
}
