use error_stack::Report;
use hash_graph_migrations::{Context, Migration};
use tokio_postgres::Client;

pub struct AccountGroups;

impl Migration for AccountGroups {
    type Context = Client;
    type Error = tokio_postgres::Error;

    async fn up(
        self,
        _: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>> {
        Ok(())
    }

    async fn down(
        self,
        _: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>> {
        Ok(())
    }
}
