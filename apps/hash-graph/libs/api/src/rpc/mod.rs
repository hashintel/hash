use std::{ops::Deref, sync::Arc};

use authorization::AuthorizationApiPool;
use graph::store::StorePool;
use hash_graph_rpc::{specification::common::JsonContext, Server, ServerBuilder};

mod account;

pub struct StateData<S, A> {
    authorization_api_pool: A,
    store_pool: S,
}

pub struct State<S, A>(Arc<StateData<S, A>>);

impl<S, A> State<S, A> {
    pub fn new(authorization_api_pool: A, store_pool: S) -> Self {
        Self(Arc::new(StateData {
            authorization_api_pool,
            store_pool,
        }))
    }
}

impl<S, A> Clone for State<S, A> {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}

impl<S, A> Deref for State<S, A> {
    type Target = StateData<S, A>;

    fn deref(&self) -> &Self::Target {
        &self.0
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
