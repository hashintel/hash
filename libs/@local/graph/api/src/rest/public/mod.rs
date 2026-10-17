mod credentials;

mod entities;
mod types;

use aide::transform::TransformOpenApi;
use hash_graph_store::pool::StorePool;

use self::credentials::Credentials;
use super::{Api, ApiState};

pub(super) fn apis<S>() -> impl Iterator<Item = Api<ApiState<S>>>
where
    S: StorePool + Send + Sync + 'static,
{
    entities::api::<S>().into_iter().chain(types::api())
}

const fn document(document: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    document
}
