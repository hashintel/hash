use error_stack::Report;
use hash_graph_migrations::{ContextTransaction, Migration};
use tokio_postgres::Client;

pub struct Webs;

impl Migration for Webs {
    type Context = Client;
    type Error = tokio_postgres::Error;

    fn up(
        self,
        _context: &mut ContextTransaction<'_, Self::Context>,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> {
        core::future::ready(Ok(()))
    }

    fn down(
        self,
        _context: &mut ContextTransaction<'_, Self::Context>,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> {
        core::future::ready(Ok(()))
    }
}
