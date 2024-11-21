use error_stack::Report;
use hash_graph_migrations::{Context, Migration, MigrationError};
use tokio_postgres::Client;

pub struct AdvancedSetup;

impl Migration for AdvancedSetup {
    type Context = Client;
    type Error = MigrationError;

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
