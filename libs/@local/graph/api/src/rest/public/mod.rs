mod credentials;
mod present;

mod entities;
mod types;

use core::num::NonZero;

use aide::transform::TransformOpenApi;
use hash_graph_store::pool::StorePool;

use self::credentials::Credentials;
use super::{Api, ApiState};

/// Server-side configuration for the public API.
#[derive(Debug, Clone, Copy)]
#[cfg_attr(feature = "clap", derive(clap::Parser))]
pub struct PublicApiConfig {
    /// The default and maximum number of entities on a page of a public entity query.
    ///
    /// When a request omits `limit`, this value is used. A larger `limit` is reduced to it.
    #[cfg_attr(
        feature = "clap",
        clap(
            id = "public_query_entity_limit",
            long = "public-query-entity-limit",
            default_value = "100",
            env = "HASH_GRAPH_PUBLIC_QUERY_ENTITY_LIMIT"
        )
    )]
    pub query_entity_limit: NonZero<u16>,
}

pub(super) fn apis<S>() -> impl Iterator<Item = Api<ApiState<S>>>
where
    S: StorePool + Send + Sync + 'static,
{
    entities::api::<S>().into_iter().chain(types::api())
}

const fn document(document: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    document
}
