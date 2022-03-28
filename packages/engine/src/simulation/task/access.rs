use crate::{
    datastore::table::task_shared_store::TaskSharedStore,
    simulation::{enum_dispatch::enum_dispatch, Result},
};

#[enum_dispatch]
pub trait StoreAccessVerify {
    /// Ensures that the [`Task`] variant has the correct permissions on the [`SharedState`] and
    /// [`SharedContext`] objects that make up the [`TaskSharedStore`].
    ///
    /// The intended implementation, is that this trait is implemented for each package-group, e.g.
    /// rather than being implemented on `JsPyInitTask`, it's implemented on the [`InitTask`]
    /// variant, as all Initialization packages should have the same access expectations.
    ///
    /// # Errors
    ///
    /// The implementation should error with [`AccessNotAllowed`] if the permissions don't match up.
    ///
    /// [`Task`]: crate::simulation::task::Task
    /// [`SharedState`]: crate::datastore::table::task_shared_store::SharedState
    /// [`SharedContext`]: crate::datastore::table::task_shared_store::SharedContext
    /// [`AccessNotAllowed`]: crate::simulation::error::Error::AccessNotAllowed
    fn verify_store_access(&self, access: &TaskSharedStore) -> Result<()>;
}
