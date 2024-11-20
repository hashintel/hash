use core::error::Error;

use error_stack::Report;
use time::OffsetDateTime;

use crate::MigrationInfo;

#[derive(Debug)]
pub enum MigrationState {
    Applied { on: OffsetDateTime },
    NotApplied,
}

pub trait StateStore {
    type Error: Error + Send + Sync + 'static;

    async fn initialize(&self) -> Result<(), Report<Self::Error>>;

    async fn add(&self, info: MigrationInfo) -> Result<(), Report<Self::Error>>;

    async fn get_all(&self) -> Result<Vec<(MigrationInfo, MigrationState)>, Report<Self::Error>>;

    async fn remove(
        &self,
        number: u32,
    ) -> Result<Option<(MigrationInfo, MigrationState)>, Report<Self::Error>>;
}
