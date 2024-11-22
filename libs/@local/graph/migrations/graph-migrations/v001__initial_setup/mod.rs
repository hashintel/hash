use error_stack::Report;
use hash_graph_migrations::{Context, Migration};
use tokio_postgres::Client;

pub struct InitialSetup;

impl Migration for InitialSetup {
    type Context = Client;
    type Error = tokio_postgres::Error;

    async fn up(
        self,
        context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>> {
        context.simple_query(include_str!("up.sql")).await?;
        Ok(())
    }

    async fn down(
        self,
        context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>> {
        context.simple_query(include_str!("down.sql")).await?;
        Ok(())
    }
}
