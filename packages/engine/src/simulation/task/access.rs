use crate::{
    datastore::table::task_shared_store::{SharedContext, SharedState, TaskSharedStore},
    simulation::{
        enum_dispatch::*,
        package::{context::ContextTask, init::InitTask, output::OutputTask, state::StateTask},
        Error, Result,
    },
};

#[enum_dispatch]
pub trait StoreAccessVerify {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()>;
}

impl StoreAccessVerify for ContextTask {
    #[tracing::instrument(skip_all)]
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        if (matches!(state, SharedState::Read(_)) || matches!(state, SharedState::None))
            && matches!(context, SharedContext::None)
        {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "Context".into()))
        }
    }
}

impl StoreAccessVerify for InitTask {
    #[tracing::instrument(skip_all)]
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        if matches!(state, SharedState::None) && matches!(context, SharedContext::None) {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "Init".into()))
        }
    }
}

impl StoreAccessVerify for StateTask {
    #[tracing::instrument(skip_all)]
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        // All combinations (as of now) are allowed (but still being explicit)
        if (matches!(state, SharedState::Write(_))
            || matches!(state, SharedState::Read(_))
            || matches!(state, SharedState::None))
            && (matches!(context, SharedContext::Read) || matches!(context, SharedContext::None))
        {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "State".into()))
        }
    }
}

impl StoreAccessVerify for OutputTask {
    #[tracing::instrument(skip_all)]
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = &access.state;
        let context = access.context();
        if (matches!(state, SharedState::Read(_)) || matches!(state, SharedState::None))
            && (matches!(context, SharedContext::Read) || matches!(context, SharedContext::None))
        {
            Ok(())
        } else {
            Err(Error::access_not_allowed(state, context, "Output".into()))
        }
    }
}
