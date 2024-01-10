use std::{ops::Deref, sync::Arc};

use authorization::AuthorizationApiPool;
use graph::store::StorePool;
use hash_graph_rpc::{specification::common::JsonContext, Server, ServerBuilder};

mod account;

pub struct State<S, A> {
    store_pool: Arc<S>,
    authorization_api_pool: Arc<A>,
}

impl<S, A> State<S, A> {
    pub fn new(store_pool: Arc<S>, authorization_api_pool: Arc<A>) -> Self {
        Self {
            store_pool,
            authorization_api_pool,
        }
    }
}

impl<S, A> Clone for State<S, A> {
    fn clone(&self) -> Self {
        Self {
            authorization_api_pool: Arc::clone(&self.authorization_api_pool),
            store_pool: Arc::clone(&self.store_pool),
        }
    }
}

#[must_use]
pub fn server<S, A>(state: State<S, A>) -> Server<JsonContext<State<S, A>>>
where
    S: StorePool + Send + Sync + 'static,
    A: AuthorizationApiPool + Send + Sync + 'static,
{
    let context = JsonContext::new(state);

    ServerBuilder::new()
        .add_service(account::service())
        .build(context)
}
