use error_stack::Report;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the store encountered a migration error")]
#[must_use]
pub struct MigrationError;

#[derive(Debug, Default, PartialEq, Eq)]
pub enum MigrationState {
    Applied {
        applied_at_utc: i64,
    },
    #[default]
    Unapplied,
}

#[derive(Debug, Eq)]
pub struct Migration {
    name: String,
    state: MigrationState,
    // We expect a hash to be precomputed for the migration
    hash: u64,
}

impl PartialEq for Migration {
    fn eq(&self, other: &Self) -> bool {
        self.hash == other.hash
    }
}

impl Migration {
    #[must_use]
    pub const fn new(name: String, state: MigrationState, hash: u64) -> Self {
        Self { name, state, hash }
    }

    #[must_use]
    pub fn name(&self) -> &str {
        self.name.as_ref()
    }

    #[must_use]
    pub const fn state(&self) -> &MigrationState {
        &self.state
    }

    #[must_use]
    pub const fn hash(&self) -> u64 {
        self.hash
    }
}

/// Describes the API of a store implementation.
///
/// # Errors
///
/// In addition to the errors described in the methods of this trait, further errors might also be
/// raised depending on the implementation, e.g. connection issues.
pub trait StoreMigration: Sync {
    fn run_migrations(
        &mut self,
    ) -> impl Future<Output = Result<Vec<Migration>, Report<MigrationError>>> + Send;

    fn all_migrations(
        &mut self,
    ) -> impl Future<Output = Result<Vec<Migration>, Report<MigrationError>>> + Send;

    fn applied_migrations(
        &mut self,
    ) -> impl Future<Output = Result<Vec<Migration>, Report<MigrationError>>> + Send;
    fn missing_migrations(
        &mut self,
    ) -> impl Future<Output = Result<Vec<Migration>, Report<MigrationError>>> + Send;
}
