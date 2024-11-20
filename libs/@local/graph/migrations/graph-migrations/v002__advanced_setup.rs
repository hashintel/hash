use error_stack::Report;
use hash_graph_migrations::Migration;

pub struct AdvancedSetup;

impl Migration for AdvancedSetup {
    type Context = ();
    type Error = core::fmt::Error;

    async fn up(self, _context: &mut Self::Context) -> Result<(), Report<Self::Error>> {
        Ok(())
    }

    async fn down(self, _context: &mut Self::Context) -> Result<(), Report<Self::Error>> {
        Ok(())
    }
}
