use core::error::Error;

use error_stack::Report;

use crate::MigrationInfo;

pub trait Migration {
    type Context;

    type Error: Error + Send + Sync + 'static;

    async fn up(self, context: &mut Self::Context) -> Result<(), Report<Self::Error>>;
    async fn down(self, context: &mut Self::Context) -> Result<(), Report<Self::Error>>;
}

#[derive(Debug)]
pub struct MigrationDefinition<M> {
    pub migration: M,
    pub info: MigrationInfo,
}
