use core::error::Error;

use error_stack::Report;

use crate::context::{Context, ContextTransaction};

pub trait Migration {
    type Context: Context;

    type Error: Error + Send + Sync + 'static;

    async fn up(
        self,
        context: &mut ContextTransaction<'_, Self::Context>,
    ) -> Result<(), Report<Self::Error>>;

    async fn down(
        self,
        context: &mut ContextTransaction<'_, Self::Context>,
    ) -> Result<(), Report<Self::Error>>;
}
