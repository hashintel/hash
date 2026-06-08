use error_stack::Report;
use hash_graph_migrations::{Context, Migration};
use tokio_postgres::Client;

pub struct Webs;

impl Migration for Webs {
    type Context = Client;
    type Error = tokio_postgres::Error;

    fn up(
        self,
        _context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> {
        core::future::ready(Ok(()))
    }

    fn down(
        self,
        _context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> impl Future<Output = Result<(), Report<Self::Error>>> {
        core::future::ready(Ok(()))
    }
}
