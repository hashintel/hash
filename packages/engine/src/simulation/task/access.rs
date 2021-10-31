use enum_dispatch::enum_dispatch;

use crate::datastore::table::task_shared_store::{SharedContext, SharedState, TaskSharedStore};

use super::super::{Error, Result};

use super::prelude::*;

#[enum_dispatch]
pub trait StoreAccessVerify {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()>;
}

impl StoreAccessVerify for ContextTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> bool {
        let state = access.state();
        let context = access.context();
        if (matches!(state, SharedState::Read(_)) || matches!(state, SharedState::None))
            && matches!(context, SharedContext::None)
        {
            Ok(())
        } else {
            Err(Error::AccessNotAllowed(state, context, "Context".into()))
        }
    }
}

impl StoreAccessVerify for InitTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = access.state();
        let context = access.context();
        if matches!(state, SharedState::None) && matches!(context, SharedContext::None) {
            Ok(())
        } else {
            Err(Error::AccessNotAllowed(state, context, "Init".into()))
        }
    }
}

impl StoreAccessVerify for StateTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = access.state();
        let context = access.context();
        // All combinations (as of now) are allowed (but still being explicit)
        if (matches!(state, SharedState::Write(_))
            || matches!(state, SharedState::Read(_))
            || matches!(state, SharedState::None))
            && (matches!(context, SharedContext::Read) || matches!(context, SharedContext::None))
        {
            Ok(())
        } else {
            Err(Error::AccessNotAllowed(state, context, "State".into()))
        }
        Ok(())
    }
}

impl StoreAccessVerify for OutputTask {
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()> {
        let state = access.state();
        let context = access.context();
        if (matches!(state, SharedState::Read(_)) || matches!(state, SharedState::None))
            && (matches!(context, SharedContext::Read) || matches!(context, SharedContext::None))
        {
            Ok(())
        } else {
            Err(Error::AccessNotAllowed(state, context, "Output".into()))
        }
    }
}
