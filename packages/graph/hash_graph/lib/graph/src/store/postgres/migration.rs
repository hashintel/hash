use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::Client;

use super::{AsClient, PostgresStore};
use crate::store::{
    error::MigrationError,
    migration::{Migration, MigrationState, StoreMigration},
};

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("postgres_migrations");
}

#[async_trait]
impl<C: AsClient<Client = Client>> StoreMigration for PostgresStore<C> {
    async fn run_migrations(&mut self) -> Result<(), MigrationError> {
        embedded::migrations::runner()
            .run_async(self.as_mut_client())
            .await
            .into_report()
            .change_context(MigrationError)?;

        Ok(())
    }

    async fn all_migrations(&mut self) -> Result<Vec<Migration>, MigrationError> {
        let all_migrations = embedded::migrations::runner()
            .get_migrations()
            .iter()
            .map(|migration| migration.into())
            .collect();

        Ok(all_migrations)
    }

    async fn applied_migrations(&mut self) -> Result<Vec<Migration>, MigrationError> {
        let applied_migrations = embedded::migrations::runner()
            .get_applied_migrations_async(self.as_mut_client())
            .await
            .into_report()
            .change_context(MigrationError)?
            .iter()
            .map(|migration| migration.into())
            .collect();

        Ok(applied_migrations)
    }

    async fn missing_migrations(&mut self) -> Result<Vec<Migration>, MigrationError> {
        let all_migrations = self.all_migrations().await?;
        let applied_migrations = self.all_migrations().await?;

        // Migrations are expected to be a very small list, even with thousands of migrations, the
        // performance implications of this
        let difference: Vec<_> = all_migrations
            .into_iter()
            .filter(|item| !applied_migrations.contains(item))
            .collect();

        Ok(difference)
    }
}

impl From<&refinery::Migration> for Migration {
    fn from(value: &refinery::Migration) -> Self {
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
        Self::new(name, state, value.checksum())
    }
}
