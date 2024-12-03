use core::error::Error;

use error_stack::Report;

use crate::context::Context;

pub trait Migration {
    type Context: Context;

    type Error: Error + Send + Sync + 'static;

    async fn up(
        self,
        context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>>;

    async fn down(
        self,
        context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>>;
}
