use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;

use super::table::{
    ActorRoleRow, AiActorRow, MachineActorRow, RoleRow, TeamRow, UserActorRow, WebRow,
};
use crate::{
    snapshot::{SnapshotInsertOptions, WriteBatch, insert_rows_batch},
    store::{AsClient, PostgresStore, postgres::query::OnConflict},
};

pub enum PrincipalRowBatch {
    Users(Vec<UserActorRow>),
    Machines(Vec<MachineActorRow>),
    Ais(Vec<AiActorRow>),
    ActorRoles(Vec<ActorRoleRow>),
    Webs(Vec<WebRow>),
    Teams(Vec<TeamRow>),
    Roles(Vec<RoleRow>),
}

impl<C> WriteBatch<C> for PrincipalRowBatch
where
    C: AsClient,
{
    async fn begin(postgres_client: &mut PostgresStore<C>) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    CREATE TEMPORARY TABLE user_actor_tmp (
                        LIKE user_actor INCLUDING ALL
                    ) ON COMMIT DROP;
                    CREATE TEMPORARY TABLE machine_actor_tmp (
                        LIKE machine_actor INCLUDING ALL
                    ) ON COMMIT DROP;
                    CREATE TEMPORARY TABLE ai_actor_tmp (
                        LIKE ai_actor INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE web_tmp (
                        LIKE web INCLUDING ALL
                    ) ON COMMIT DROP;
                    CREATE TEMPORARY TABLE team_tmp (
                        LIKE team INCLUDING ALL
                    ) ON COMMIT DROP;

                    CREATE TEMPORARY TABLE role_tmp (
                        LIKE role INCLUDING ALL
                    ) ON COMMIT DROP;
                    CREATE TEMPORARY TABLE actor_role_tmp (
                        LIKE actor_role INCLUDING ALL
                    ) ON COMMIT DROP;
                ",
            )
            .instrument(tracing::info_span!(
                "CREATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;

        Ok(())
    }

    #[expect(clippy::too_many_lines)]
    async fn write(
        self,
        postgres_client: &mut PostgresStore<C>,
    ) -> Result<(), Report<InsertionError>> {
        let client = postgres_client.as_client().client();
        match self {
            Self::Users(users) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &users,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} users");
                }
            }
            Self::Machines(machines) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &machines,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} machines");
                }
            }
            Self::Ais(ais) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &ais,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} AIs");
                }
            }
            Self::ActorRoles(actor_roles) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &actor_roles,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} actor roles");
                }
            }
            Self::Webs(webs) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &webs,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} webs");
                }
            }
            Self::Teams(teams) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &teams,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} teams");
                }
            }
            Self::Roles(roles) => {
                let inserted_rows = insert_rows_batch(
                    client,
                    &roles,
                    SnapshotInsertOptions {
                        distinct: true,
                        on_conflict: OnConflict::Error,
                    },
                )
                .await?;
                if inserted_rows > 0 {
                    tracing::info!("Read {inserted_rows} roles");
                }
            }
        }
        Ok(())
    }

    async fn commit(
        postgres_client: &mut PostgresStore<C>,
        _ignore_validation_errors: bool,
    ) -> Result<(), Report<InsertionError>> {
        postgres_client
            .as_client()
            .client()
            .simple_query(
                "
                    INSERT INTO user_actor
                    SELECT * FROM user_actor_tmp;

                    INSERT INTO machine_actor
                    SELECT * FROM machine_actor_tmp;

                    INSERT INTO ai_actor
                    SELECT * FROM ai_actor_tmp;

                    INSERT INTO web
                    SELECT * FROM web_tmp;

                    INSERT INTO team
                    SELECT * FROM team_tmp;

                    INSERT INTO role
                    SELECT * FROM role_tmp;

                    INSERT INTO actor_role
                    SELECT * FROM actor_role_tmp;

                    -- Recursively build the team_hierarchy table for all ancestor-descendant pairs
                    WITH RECURSIVE team_tree AS (
                        SELECT id AS child_id, parent_id, 1 AS depth
                        FROM team
                        UNION ALL
                        SELECT team_tree.child_id, team.parent_id, team_tree.depth + 1
                        FROM team_tree
                        JOIN team ON team_tree.parent_id = team.id
                    )
                    INSERT INTO team_hierarchy (parent_id, child_id, depth)
                    SELECT parent_id, child_id, depth FROM team_tree;
                ",
            )
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
