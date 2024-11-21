use error_stack::Report;

use crate::{MigrationDirection, MigrationInfo, plan::MigrationRunner};

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the store encountered a migration error in migration {:0>3}: {}", _0.number, _0.name)]
pub struct MigrationError(#[error(ignore)] MigrationInfo);

impl MigrationError {
    pub(crate) const fn new(info: MigrationInfo) -> Self {
        Self(info)
    }
}

pub trait MigrationList<C> {
    /// Returns an iterator over the migration infos in this list.
    fn infos(&self) -> impl Iterator<Item = &MigrationInfo>;

    /// Runs this list in the provided plan and context.
    ///
    /// This will only forward the [`Migration`] to the [`MigrationRunner`].
    ///
    /// [`Migration`]: crate::Migration
    /// [`down`]: Migration::down
    async fn traverse(
        self,
        runner: &impl MigrationRunner,
        context: &mut C,
        direction: MigrationDirection,
    ) -> Result<(), Report<MigrationError>>;
}
