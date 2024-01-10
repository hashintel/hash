use std::{ops::Deref, sync::Arc};

mod account;

struct StateData<S, A> {
    authorization_api_pool: A,
    store_pool: S,
}

struct State<S, A>(Arc<StateData<S, A>>);

impl<S, A> Clone for State<S, A> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl<S, A> Deref for State<S, A> {
    type Target = StateData<S, A>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
