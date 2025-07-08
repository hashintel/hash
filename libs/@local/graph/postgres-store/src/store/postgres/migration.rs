use error_stack::{Report, ResultExt as _};
use hash_graph_store::migration::{Migration, MigrationError, MigrationState, StoreMigration};
use tokio_postgres::Client;

use super::{AsClient, PostgresStore};

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("postgres_migrations");
}

fn create_postgres_migration(value: &refinery::Migration) -> Migration {
    let state = value
        .applied_on()
        .map(|applied_on| MigrationState::Applied {
            applied_at_utc: applied_on.unix_timestamp(),
        })
        .unwrap_or_default();

    // Refinery migration names are stripped of their version prefix. We recreate it here, it's
    // just for display purposes as we rely on the checksum/hash to provide proper comparison
    // for the different migrations
    let name = format!("{}_{}", value.version(), value.name());

    Migration::new(name, state, value.checksum())
}

impl<C> StoreMigration for PostgresStore<C>
where
    C: AsClient<Client = Client>,
{
    async fn run_migrations(&mut self) -> Result<Vec<Migration>, Report<MigrationError>> {
        Ok(embedded::migrations::runner()
            .run_async(self.as_mut_client())
            .await
            .change_context(MigrationError)?
            .applied_migrations()
            .iter()
            .map(create_postgres_migration)
            .collect())
    }

    async fn all_migrations(&mut self) -> Result<Vec<Migration>, Report<MigrationError>> {
        Ok(embedded::migrations::runner()
            .get_migrations()
            .iter()
            .map(create_postgres_migration)
            .collect())
    }

    async fn applied_migrations(&mut self) -> Result<Vec<Migration>, Report<MigrationError>> {
        Ok(embedded::migrations::runner()
            .get_applied_migrations_async(self.as_mut_client())
            .await
            .change_context(MigrationError)?
            .iter()
            .map(create_postgres_migration)
            .collect())
    }

    async fn missing_migrations(&mut self) -> Result<Vec<Migration>, Report<MigrationError>> {
        let all_migrations = self.all_migrations().await?;
        let applied_migrations = self.all_migrations().await?;

        // Migrations are expected to be a very small list, even with thousands of migrations, the
        // performance implications of this are negligible.
        Ok(all_migrations
            .into_iter()
            .filter(|item| !applied_migrations.contains(item))
            .collect())
    }
}
