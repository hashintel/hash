use core::error::Error;

use error_stack::Report;

pub trait Migration {
    type Context;

    type Error: Error + Send + Sync + 'static;

    async fn up(self, context: &mut Self::Context) -> Result<(), Report<Self::Error>>;
    async fn down(self, context: &mut Self::Context) -> Result<(), Report<Self::Error>>;
}
