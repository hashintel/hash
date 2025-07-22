use error_stack::Report;
use hash_graph_migrations::{Context, Migration};
use tokio_postgres::Client;
use tracing::Instrument as _;

pub struct PropertyTypes;

impl Migration for PropertyTypes {
    type Context = Client;
    type Error = tokio_postgres::Error;

    async fn up(
        self,
        context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>> {
        context
            .simple_query(include_str!("up.sql"))
            .instrument(tracing::info_span!(
                "BATCH",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await?;
        Ok(())
    }

    async fn down(
        self,
        context: &mut <Self::Context as Context>::Transaction<'_>,
    ) -> Result<(), Report<Self::Error>> {
        context
            .simple_query(include_str!("down.sql"))
            .instrument(tracing::info_span!(
                "BATCH",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await?;
        Ok(())
    }
}
