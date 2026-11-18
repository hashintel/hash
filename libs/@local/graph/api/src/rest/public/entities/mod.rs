mod v1;

use hash_graph_store::pool::StorePool;

use crate::rest::{Api, ApiState};

pub(super) fn api<S>() -> [Api<ApiState<S>>; 1]
where
    S: StorePool + Send + Sync + 'static,
{
    [v1::api()]
}
