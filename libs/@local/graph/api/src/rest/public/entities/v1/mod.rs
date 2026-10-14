mod entity;

use aide::openapi::Info;
use hash_graph_store::pool::StorePool;

use crate::rest::{Api, ApiState, caller, documentation, openapi, public};

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
        || caller::routes::<public::Credentials, _>().merge(entity::routes::<S>()),
        public::document,
    )
}
