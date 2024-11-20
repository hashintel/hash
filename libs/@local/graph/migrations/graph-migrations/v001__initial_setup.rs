use error_stack::Report;
use hash_graph_migrations::{Migration, MigrationError};

pub struct InitialSetup;

impl Migration for InitialSetup {
    type Context = ();
    type Error = MigrationError;

    async fn up(self, _context: &mut Self::Context) -> Result<(), Report<Self::Error>> {
        Ok(())
    }

    async fn down(self, _context: &mut Self::Context) -> Result<(), Report<Self::Error>> {
        Ok(())
    }
}
