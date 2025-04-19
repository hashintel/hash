use error_stack::Report;
use hash_graph_migrations::{Context, Migration};
use tokio_postgres::Client;

pub struct Webs;

impl Migration for Webs {
    type Context = Client;
    type Error = tokio_postgres::Error;

    async fn up(
        self,
        _context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>> {
        Ok(())
    }

    async fn down(
        self,
        _context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>> {
        Ok(())
    }
}
