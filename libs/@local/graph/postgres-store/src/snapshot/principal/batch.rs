use error_stack::{Report, ResultExt as _};
use hash_graph_store::error::InsertionError;
use tokio_postgres::GenericClient as _;

use super::table::{
    ActorRoleRow, AiActorRow, MachineActorRow, RoleRow, TeamRow, UserActorRow, WebRow,
};
use crate::{
    snapshot::WriteBatch,
    store::{AsClient, PostgresStore},
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
                let rows = client
                    .query(
                        "
                            INSERT INTO user_actor_tmp
                            SELECT DISTINCT * FROM UNNEST($1::user_actor[])
                            RETURNING 1;
                        ",
                        &[&users],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} users", rows.len());
                }
            }
            Self::Machines(machines) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO machine_actor_tmp
                            SELECT DISTINCT * FROM UNNEST($1::machine_actor[])
                            RETURNING 1;
                        ",
                        &[&machines],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} machines", rows.len());
                }
            }
            Self::Ais(ais) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO ai_actor_tmp
                            SELECT DISTINCT * FROM UNNEST($1::ai_actor[])
                            RETURNING 1;
                        ",
                        &[&ais],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} AIs", rows.len());
                }
            }
            Self::ActorRoles(actor_roles) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO actor_role_tmp
                            SELECT DISTINCT * FROM UNNEST($1::actor_role[])
                            RETURNING 1;
                        ",
                        &[&actor_roles],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} actor roles", rows.len());
                }
            }
            Self::Webs(webs) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO web_tmp
                            SELECT DISTINCT * FROM UNNEST($1::web[])
                            RETURNING 1;
                        ",
                        &[&webs],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} webs", rows.len());
                }
            }
            Self::Teams(teams) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO team_tmp
                            SELECT DISTINCT * FROM UNNEST($1::team[])
                            RETURNING 1;
                        ",
                        &[&teams],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} teams", rows.len());
                }
            }
            Self::Roles(roles) => {
                let rows = client
                    .query(
                        "
                            INSERT INTO role_tmp
                            SELECT DISTINCT * FROM UNNEST($1::role[])
                            RETURNING 1;
                        ",
                        &[&roles],
                    )
                    .await
                    .change_context(InsertionError)?;
                if !rows.is_empty() {
                    tracing::info!("Read {} roles", rows.len());
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
            .await
            .change_context(InsertionError)?;
        Ok(())
    }
}
