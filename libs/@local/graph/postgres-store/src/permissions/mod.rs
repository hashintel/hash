use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _, ensure};
use futures::TryStreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    policies::{
        Context, ContextBuilder, Policy, PolicyId,
        action::ActionName,
        principal::PrincipalConstraint,
        resource::ResourceConstraint,
        store::{RoleAssignmentStatus, RoleUnassignmentStatus},
    },
};
use postgres_types::{Json, ToSql};
use tokio_postgres::{GenericClient as _, error::SqlState};
use type_system::principal::{
    PrincipalId, PrincipalType,
    actor::{
        Actor, ActorEntityUuid, ActorId, ActorType, Ai, AiId, Machine, MachineId, User, UserId,
    },
    actor_group::{ActorGroup, ActorGroupEntityUuid, ActorGroupId, Team, TeamId, Web, WebId},
    role::{Role, RoleId, RoleName, TeamRole, TeamRoleId, WebRole, WebRoleId},
};
use uuid::Uuid;

use crate::store::{AsClient, PostgresStore};

mod error;
pub use self::error::{ActionError, PolicyError, PrincipalError};
const fn principal_type_into_actor_type(principal_type: PrincipalType) -> Option<ActorType> {
    match principal_type {
        PrincipalType::User => Some(ActorType::User),
        PrincipalType::Machine => Some(ActorType::Machine),
        PrincipalType::Ai => Some(ActorType::Ai),
        _ => None,
    }
}

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    async fn is_principal(
        &self,
        principal_id: impl Into<PrincipalId>,
    ) -> Result<bool, Report<PrincipalError>> {
        let principal_id = principal_id.into();
        let row = self
            .as_client()
            .query_one(
                match principal_id {
                    PrincipalId::Actor(ActorId::User(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM user_actor WHERE id = $1)"
                    }
                    PrincipalId::Actor(ActorId::Machine(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM machine_actor WHERE id = $1)"
                    }
                    PrincipalId::Actor(ActorId::Ai(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM ai_actor WHERE id = $1)"
                    }
                    PrincipalId::ActorGroup(ActorGroupId::Web(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM web WHERE id = $1)"
                    }
                    PrincipalId::ActorGroup(ActorGroupId::Team(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM team WHERE id = $1)"
                    }
                    PrincipalId::Role(RoleId::Web(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM role WHERE id = $1
                        AND principal_type = 'web_role')"
                    }
                    PrincipalId::Role(RoleId::Team(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM role WHERE id = $1
                        AND principal_type = 'team_role')"
                    }
                },
                &[&principal_id],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(row.get(0))
    }

    /// Deletes a principal from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the principal with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_principal(
        &mut self,
        id: PrincipalId,
    ) -> Result<(), Report<PrincipalError>> {
        let (uuid, principal_type): (Uuid, PrincipalType) = match id {
            PrincipalId::ActorGroup(ActorGroupId::Web(id)) => (id.into(), PrincipalType::Web),
            PrincipalId::ActorGroup(ActorGroupId::Team(id)) => (id.into(), PrincipalType::Team),
            PrincipalId::Actor(ActorId::User(id)) => (id.into(), PrincipalType::User),
            PrincipalId::Actor(ActorId::Machine(id)) => (id.into(), PrincipalType::Machine),
            PrincipalId::Actor(ActorId::Ai(id)) => (id.into(), PrincipalType::Ai),
            PrincipalId::Role(RoleId::Web(id)) => (id.into(), PrincipalType::WebRole),
            PrincipalId::Role(RoleId::Team(id)) => (id.into(), PrincipalType::TeamRole),
        };

        let num_deleted = self
            .as_mut_client()
            .execute(
                "DELETE FROM principal WHERE id = $1 AND principal_type = $2",
                &[&uuid, &principal_type],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        ensure!(num_deleted > 0, PrincipalError::PrincipalNotFound { id });

        Ok(())
    }

    /// Creates a new user with the given ID, or generates a new UUID if none is provided.
    ///
    /// # Errors
    ///
    /// - [`PrincipalAlreadyExists`] if a user with the given ID already exists
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalAlreadyExists`]: PrincipalError::PrincipalAlreadyExists
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn create_user(
        &mut self,
        id: Option<Uuid>,
    ) -> Result<UserId, Report<PrincipalError>> {
        let user_id = UserId::new(id.unwrap_or_else(Uuid::new_v4));
        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO user_actor (id) VALUES ($1)", &[&user_id])
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists {
                    id: PrincipalId::Actor(ActorId::User(user_id)),
                })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok(user_id)
    }

    /// Determines the type of an actor by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn determine_actor(
        &self,
        id: ActorEntityUuid,
    ) -> Result<ActorId, Report<PrincipalError>> {
        self.as_client()
            .query_one("SELECT principal_type FROM actor WHERE id = $1", &[&id])
            .await
            .map(|row| match row.get(0) {
                PrincipalType::User => ActorId::User(UserId::new(id)),
                PrincipalType::Machine => ActorId::Machine(MachineId::new(id)),
                PrincipalType::Ai => ActorId::Ai(AiId::new(id)),
                principal_type => unreachable!("Unexpected actor type: {principal_type:?}"),
            })
            .change_context(PrincipalError::StoreError)
    }

    /// Determines the type of an actor by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_actor(
        &self,
        actor_id: impl Into<Uuid>,
    ) -> Result<bool, Report<PrincipalError>> {
        self.as_client()
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM actor WHERE id = $1)",
                &[&actor_id.into()],
            )
            .await
            .map(|row| row.get(0))
            .change_context(PrincipalError::StoreError)
    }

    /// Gets an actor by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_actor(&self, id: ActorId) -> Result<Option<Actor>, Report<PrincipalError>> {
        Ok(match id {
            ActorId::User(id) => self.get_user(id).await?.map(Actor::User),
            ActorId::Machine(id) => self.get_machine(id).await?.map(Actor::Machine),
            ActorId::Ai(id) => self.get_ai(id).await?.map(Actor::Ai),
        })
    }

    /// Checks if a user with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_user(&self, user_id: impl Into<Uuid>) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(ActorId::User(UserId::new(user_id))).await
    }

    /// Gets a user by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_user(&self, id: UserId) -> Result<Option<User>, Report<PrincipalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT user_actor.id,
                       array_agg(role.id) FILTER (WHERE role.id IS NOT NULL),
                       array_agg(role.principal_type) FILTER (WHERE role.id IS NOT NULL)
                FROM user_actor
                LEFT OUTER JOIN actor_role ON user_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                    WHERE user_actor.id = $1
                GROUP BY user_actor.id",
                &[&id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| {
                let role_ids = row.get::<_, Option<Vec<Uuid>>>(1).unwrap_or_default();
                let principal_types = row
                    .get::<_, Option<Vec<PrincipalType>>>(2)
                    .unwrap_or_default();
                User {
                    id: row.get(0),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            _ => unreachable!("Unexpected role type: {principal_type:?}"),
                        })
                        .collect(),
                }
            }))
    }

    /// Deletes a user from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the user with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_user(&mut self, id: UserId) -> Result<(), Report<PrincipalError>> {
        self.delete_principal(PrincipalId::Actor(ActorId::User(id)))
            .await
    }

    /// Creates a new machine with the given ID, or generates a new UUID if none is provided.
    ///
    /// # Errors
    ///
    /// - [`PrincipalAlreadyExists`] if a machine with the given ID already exists
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalAlreadyExists`]: PrincipalError::PrincipalAlreadyExists
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn create_machine(
        &mut self,
        id: Option<Uuid>,
    ) -> Result<MachineId, Report<PrincipalError>> {
        let id = MachineId::new(id.unwrap_or_else(Uuid::new_v4));
        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO machine_actor (id) VALUES ($1)", &[&id])
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists {
                    id: PrincipalId::Actor(ActorId::Machine(id)),
                })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok(id)
    }

    /// Checks if a machine with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_machine(
        &self,
        machine_id: impl Into<Uuid>,
    ) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(ActorId::Machine(MachineId::new(machine_id)))
            .await
    }

    /// Gets a machine by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_machine(
        &self,
        id: MachineId,
    ) -> Result<Option<Machine>, Report<PrincipalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT machine_actor.id,
                       array_agg(role.id) FILTER (WHERE role.id IS NOT NULL),
                       array_agg(role.principal_type) FILTER (WHERE role.id IS NOT NULL)
                FROM machine_actor
                LEFT OUTER JOIN actor_role ON machine_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                WHERE machine_actor.id = $1
                GROUP BY machine_actor.id",
                &[&id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| {
                let role_ids = row.get::<_, Option<Vec<Uuid>>>(1).unwrap_or_default();
                let principal_types = row
                    .get::<_, Option<Vec<PrincipalType>>>(2)
                    .unwrap_or_default();
                Machine {
                    id: row.get(0),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            _ => unreachable!("Unexpected role type: {principal_type:?}"),
                        })
                        .collect(),
                }
            }))
    }

    /// Deletes a machine from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the machine with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_machine(&mut self, id: MachineId) -> Result<(), Report<PrincipalError>> {
        self.delete_principal(PrincipalId::Actor(ActorId::Machine(id)))
            .await
    }

    /// Creates a new AI with the given ID, or generates a new UUID if none is provided.
    ///
    /// # Errors
    ///
    /// - [`PrincipalAlreadyExists`] if an AI with the given ID already exists
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalAlreadyExists`]: PrincipalError::PrincipalAlreadyExists
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn create_ai(&mut self, id: Option<Uuid>) -> Result<AiId, Report<PrincipalError>> {
        let ai_id = AiId::new(id.unwrap_or_else(Uuid::new_v4));
        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO ai_actor (id) VALUES ($1)", &[&ai_id])
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists {
                    id: PrincipalId::Actor(ActorId::Ai(ai_id)),
                })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok(ai_id)
    }

    /// Checks if an AI with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_ai(&self, ai_id: impl Into<Uuid>) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(ActorId::Ai(AiId::new(ai_id))).await
    }

    /// Gets an AI by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_ai(&self, id: AiId) -> Result<Option<Ai>, Report<PrincipalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "
                SELECT ai_actor.id,
                       array_agg(role.id) FILTER (WHERE role.id IS NOT NULL),
                       array_agg(role.principal_type) FILTER (WHERE role.id IS NOT NULL)
                FROM ai_actor
                LEFT OUTER JOIN actor_role ON ai_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                WHERE ai_actor.id = $1
                GROUP BY ai_actor.id",
                &[&id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| {
                let role_ids = row.get::<_, Option<Vec<Uuid>>>(1).unwrap_or_default();
                let principal_types = row
                    .get::<_, Option<Vec<PrincipalType>>>(2)
                    .unwrap_or_default();
                Ai {
                    id: row.get(0),
                    roles: role_ids
                        .into_iter()
                        .zip(principal_types)
                        .map(|(id, principal_type)| match principal_type {
                            PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                            PrincipalType::TeamRole => RoleId::Team(TeamRoleId::new(id)),
                            _ => unreachable!("Unexpected role type: {principal_type:?}"),
                        })
                        .collect(),
                }
            }))
    }

    /// Deletes an AI from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the AI with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_ai(&mut self, id: AiId) -> Result<(), Report<PrincipalError>> {
        self.delete_principal(PrincipalId::Actor(ActorId::Ai(id)))
            .await
    }

    /// Determines the type of an actor group by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn determine_actor_group(
        &self,
        id: ActorGroupEntityUuid,
    ) -> Result<ActorGroupId, Report<PrincipalError>> {
        self.as_client()
            .query_one(
                "SELECT principal_type FROM actor_group WHERE id = $1",
                &[&id],
            )
            .await
            .map(|row| match row.get(0) {
                PrincipalType::Web => ActorGroupId::Web(WebId::new(id)),
                PrincipalType::Team => ActorGroupId::Team(TeamId::new(id)),
                principal_type => unreachable!("Unexpected actor group type: {principal_type:?}"),
            })
            .change_context(PrincipalError::StoreError)
    }

    /// Checks if a web with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_web(&self, web_id: impl Into<Uuid>) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(ActorGroupId::Web(WebId::new(web_id)))
            .await
    }

    /// Gets a web by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_web(&self, id: WebId) -> Result<Option<Web>, Report<PrincipalError>> {
        Ok(self
            .as_client()
            .query_opt("SELECT id FROM web WHERE id = $1", &[&id])
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| Web {
                id: row.get(0),
                roles: HashSet::new(),
            }))
    }

    /// Deletes a web from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the web with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_web(&mut self, id: WebId) -> Result<(), Report<PrincipalError>> {
        self.delete_principal(PrincipalId::ActorGroup(ActorGroupId::Web(id)))
            .await
    }

    /// Creates a new team with the given ID and parent actor group, or generates a new UUID if
    /// none is provided.
    ///
    /// # Errors
    ///
    /// - [`PrincipalAlreadyExists`] if a team with the given ID already exists
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalAlreadyExists`]: PrincipalError::PrincipalAlreadyExists
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn create_team(
        &mut self,
        id: Option<Uuid>,
        parent_id: ActorGroupId,
    ) -> Result<TeamId, Report<PrincipalError>> {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let transaction = self
            .as_mut_client()
            .transaction()
            .await
            .change_context(PrincipalError::StoreError)?;

        // First create the team
        transaction
            .execute(
                "INSERT INTO team (id, parent_id) VALUES ($1, $2)",
                &[&id, &parent_id],
            )
            .await
            .map_err(Report::new)
            .map_err(|error| match error.current_context().code() {
                Some(&SqlState::UNIQUE_VIOLATION) => {
                    error.change_context(PrincipalError::PrincipalAlreadyExists {
                        id: PrincipalId::ActorGroup(ActorGroupId::Team(TeamId::new(id))),
                    })
                }
                Some(&SqlState::FOREIGN_KEY_VIOLATION) => {
                    error.change_context(PrincipalError::PrincipalNotFound {
                        id: PrincipalId::ActorGroup(parent_id),
                    })
                }
                _ => error.change_context(PrincipalError::StoreError),
            })?;

        // Set up all parent-child relationships in a single query
        // First row creates the direct relationship with depth 1
        // Remaining rows create transitive relationships with proper depths
        transaction
            .execute(
                "INSERT INTO team_hierarchy (parent_id, child_id, depth)
                SELECT $1::uuid, $2::uuid, 1
                UNION ALL
                SELECT parent_id, $2::uuid, depth + 1
                  FROM team_hierarchy
                 WHERE child_id = $1::uuid",
                &[&parent_id, &id],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        transaction
            .commit()
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(TeamId::new(id))
    }

    /// Checks if a team with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_team(&self, team_id: impl Into<Uuid>) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(ActorGroupId::Team(TeamId::new(team_id)))
            .await
    }

    /// Gets a team by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_team(&self, id: TeamId) -> Result<Option<Team>, Report<PrincipalError>> {
        let parents = self
            .as_client()
            .query_raw(
                "
                    SELECT parent_id, principal_type
                      FROM team_hierarchy
                      JOIN principal ON principal.id = team_hierarchy.parent_id
                     WHERE child_id = $1
                     ORDER BY depth",
                &[&id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_ok(|row| match row.get(1) {
                PrincipalType::Web => ActorGroupId::Web(row.get(0)),
                PrincipalType::Team => ActorGroupId::Team(row.get(0)),
                other => unreachable!("Unexpected actor group type: {other:?}"),
            })
            .try_collect::<Vec<_>>()
            .await
            .change_context(PrincipalError::StoreError)?;

        if parents.is_empty() {
            return Ok(None);
        }

        Ok(Some(Team {
            id,
            parents,
            roles: HashSet::new(),
        }))
    }

    /// Deletes a team from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the team with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_team(&mut self, id: TeamId) -> Result<(), Report<PrincipalError>> {
        self.delete_principal(PrincipalId::ActorGroup(ActorGroupId::Team(id)))
            .await
    }

    /// Creates a new role with the given ID associated with a team, or generates a new UUID if none
    /// is provided.
    ///
    /// # Errors
    ///
    /// - [`PrincipalAlreadyExists`] if a role with the given ID already exists
    /// - [`PrincipalNotFound`] if the team with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalAlreadyExists`]: PrincipalError::PrincipalAlreadyExists
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn create_role(
        &mut self,
        id: Option<Uuid>,
        actor_group_id: ActorGroupId,
        name: RoleName,
    ) -> Result<RoleId, Report<PrincipalError>> {
        let role_id = id.unwrap_or_else(Uuid::new_v4);
        let (role_id, principal_type) = match actor_group_id {
            ActorGroupId::Web(_) => (RoleId::Web(WebRoleId::new(role_id)), PrincipalType::WebRole),
            ActorGroupId::Team(_) => (
                RoleId::Team(TeamRoleId::new(role_id)),
                PrincipalType::TeamRole,
            ),
        };

        self.as_mut_client()
            .execute(
                "INSERT INTO role (id, principal_type, actor_group_id, name)
                VALUES ($1, $2, $3, $4)",
                &[
                    &role_id,
                    &principal_type,
                    &actor_group_id,
                    match name {
                        RoleName::Administrator => &"Administrator",
                        RoleName::Member => &"Member",
                    },
                ],
            )
            .await
            .map_err(|error| match error.code() {
                Some(&SqlState::UNIQUE_VIOLATION) => {
                    Report::new(error).change_context(PrincipalError::PrincipalAlreadyExists {
                        id: PrincipalId::Role(role_id),
                    })
                }
                Some(&SqlState::FOREIGN_KEY_VIOLATION) => {
                    Report::new(error).change_context(PrincipalError::PrincipalNotFound {
                        id: PrincipalId::ActorGroup(actor_group_id),
                    })
                }
                _ => Report::new(error).change_context(PrincipalError::StoreError),
            })?;

        Ok(role_id)
    }

    /// Checks if a role with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_role(&self, id: RoleId) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(PrincipalId::Role(id)).await
    }

    /// Gets a role by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_role(
        &self,
        actor_group_id: ActorGroupId,
        name: RoleName,
    ) -> Result<Option<Role>, Report<PrincipalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "SELECT id FROM role
                WHERE actor_group_id = $1 AND name = $2 AND principal_type = $3",
                &[
                    &actor_group_id,
                    match name {
                        RoleName::Administrator => &"Administrator",
                        RoleName::Member => &"Member",
                    },
                    match actor_group_id {
                        ActorGroupId::Web(_) => &PrincipalType::WebRole,
                        ActorGroupId::Team(_) => &PrincipalType::TeamRole,
                    },
                ],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| match actor_group_id {
                ActorGroupId::Web(web_id) => Role::Web(WebRole {
                    id: row.get(0),
                    web_id,
                    name,
                }),
                ActorGroupId::Team(team_id) => Role::Team(TeamRole {
                    id: row.get(0),
                    team_id,
                    name,
                }),
            }))
    }

    /// Deletes a role from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the role with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_role(&mut self, id: RoleId) -> Result<(), Report<PrincipalError>> {
        self.delete_principal(PrincipalId::Role(id)).await
    }

    /// Assigns a role to an actor.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the actor or role with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn assign_role_by_id(
        &mut self,
        actor_id: ActorId,
        role_id: RoleId,
    ) -> Result<RoleAssignmentStatus, Report<PrincipalError>> {
        // Check if the actor exists
        if !self.is_actor(actor_id).await? {
            return Err(Report::new(PrincipalError::PrincipalNotFound {
                id: PrincipalId::Actor(actor_id),
            }));
        }

        if !self.is_role(role_id).await? {
            return Err(Report::new(PrincipalError::PrincipalNotFound {
                id: PrincipalId::Role(role_id),
            }));
        }

        let affected_rows = self
            .as_mut_client()
            .execute(
                "INSERT INTO actor_role (actor_id, role_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING",
                &[&actor_id, &role_id],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(if affected_rows > 0 {
            RoleAssignmentStatus::NewlyAssigned
        } else {
            RoleAssignmentStatus::AlreadyAssigned
        })
    }

    /// Unassigns a role from an actor.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn unassign_role_by_id(
        &mut self,
        actor_id: ActorId,
        role_id: RoleId,
    ) -> Result<RoleUnassignmentStatus, Report<PrincipalError>> {
        let num_deleted = self
            .as_mut_client()
            .execute(
                "DELETE FROM actor_role WHERE actor_id = $1 AND role_id = $2",
                &[&actor_id, &role_id],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(if num_deleted > 0 {
            RoleUnassignmentStatus::Unassigned
        } else {
            RoleUnassignmentStatus::NotAssigned
        })
    }

    /// Gets all roles assigned to a specific actor.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the actor with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_actor_roles(
        &self,
        actor_id: ActorId,
    ) -> Result<HashMap<RoleId, Role>, Report<PrincipalError>> {
        // Check if the actor exists
        if !self.is_principal(PrincipalId::Actor(actor_id)).await? {
            return Err(Report::new(PrincipalError::PrincipalNotFound {
                id: PrincipalId::Actor(actor_id),
            }));
        }

        self.as_client()
            .query_raw(
                "SELECT role.id, role.principal_type, role.actor_group_id, role.name
                 FROM actor_role
                 JOIN role ON actor_role.role_id = role.id
                 WHERE actor_role.actor_id = $1",
                &[&actor_id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_ok(|row| {
                let role_id: Uuid = row.get(0);
                let principal_type: PrincipalType = row.get(1);
                let actor_group_id: Uuid = row.get(2);
                let name = match row.get(3) {
                    "Administrator" => RoleName::Administrator,
                    "Member" => RoleName::Member,
                    other => unreachable!("Unexpected role name: {other:?}"),
                };
                match principal_type {
                    PrincipalType::WebRole => (
                        RoleId::Web(WebRoleId::new(role_id)),
                        Role::Web(WebRole {
                            id: WebRoleId::new(role_id),
                            web_id: WebId::new(actor_group_id),
                            name,
                        }),
                    ),
                    PrincipalType::TeamRole => (
                        RoleId::Team(TeamRoleId::new(role_id)),
                        Role::Team(TeamRole {
                            id: TeamRoleId::new(role_id),
                            team_id: TeamId::new(actor_group_id),
                            name,
                        }),
                    ),
                    _ => unreachable!("Unexpected role type: {principal_type:?}"),
                }
            })
            .try_collect()
            .await
            .change_context(PrincipalError::StoreError)
    }

    /// Gets all actors assigned to a specific role.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the role with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_role_actors(
        &self,
        role_id: RoleId,
    ) -> Result<HashSet<ActorId>, Report<PrincipalError>> {
        // Check if the role exists
        if !self.is_principal(PrincipalId::Role(role_id)).await? {
            return Err(Report::new(PrincipalError::PrincipalNotFound {
                id: PrincipalId::Role(role_id),
            }));
        }

        self.as_client()
            .query_raw(
                "SELECT actor.principal_type, actor.id
                 FROM actor_role
                 JOIN actor ON actor_role.actor_id = actor.id
                 WHERE actor_role.role_id = $1",
                &[&role_id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_ok(|row| match row.get(0) {
                PrincipalType::User => ActorId::User(row.get(1)),
                PrincipalType::Machine => ActorId::Machine(row.get(1)),
                PrincipalType::Ai => ActorId::Ai(row.get(1)),
                principal_type => unreachable!("Unexpected principal type: {principal_type:?}"),
            })
            .try_collect()
            .await
            .change_context(PrincipalError::StoreError)
    }

    /// Registers an action in the database.
    ///
    /// # Errors
    ///
    /// - [`AlreadyExists`] if an action with the same ID already exists
    /// - [`NotFound`] if the parent action doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`AlreadyExists`]: ActionError::AlreadyExists
    /// [`NotFound`]: ActionError::NotFound
    /// [`StoreError`]: ActionError::StoreError
    pub async fn register_action(&mut self, action: ActionName) -> Result<(), Report<ActionError>> {
        let transaction = self
            .transaction()
            .await
            .change_context(ActionError::StoreError)?;

        transaction
            .as_client()
            .execute(
                "INSERT INTO action (name, parent) VALUES ($1, $2)",
                &[&action, &action.parent()],
            )
            .await
            .map_err(|error| {
                let policy_error = match (error.code(), action.parent()) {
                    (Some(&SqlState::CHECK_VIOLATION), _) => {
                        ActionError::HasSelfCycle { id: action }
                    }
                    (Some(&SqlState::UNIQUE_VIOLATION), _) => {
                        ActionError::AlreadyExists { id: action }
                    }
                    (Some(&SqlState::FOREIGN_KEY_VIOLATION), Some(parent)) => {
                        ActionError::NotFound { id: parent }
                    }
                    _ => ActionError::StoreError,
                };
                Report::new(error).change_context(policy_error)
            })?;

        transaction
            .as_client()
            .execute(
                "INSERT INTO action_hierarchy (child_name, parent_name, depth)
                    SELECT $1, $1, 0
                    UNION ALL
                    SELECT $1, parent_name, ordinality
                    FROM unnest($2::text[]) WITH ORDINALITY as t(parent_name, ordinality)",
                &[&action, &action.parents().collect::<Vec<_>>()],
            )
            .await
            .change_context(ActionError::StoreError)?;

        transaction
            .commit()
            .await
            .change_context(ActionError::StoreError)?;

        Ok(())
    }

    /// Checks if an action exists in the database.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: ActionError::StoreError
    pub async fn has_action(&self, action: ActionName) -> Result<bool, Report<ActionError>> {
        let row = self
            .as_client()
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM action WHERE name = $1)",
                &[&action],
            )
            .await
            .change_context(ActionError::StoreError)?;

        Ok(row.get(0))
    }

    /// Gets all parent actions for a given action.
    ///
    /// # Errors
    ///
    /// - [`NotFound`] if the action doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`NotFound`]: ActionError::NotFound
    /// [`StoreError`]: ActionError::StoreError
    pub async fn get_parent_actions(
        &self,
        action: ActionName,
    ) -> Result<Vec<ActionName>, Report<ActionError>> {
        let parents = self
            .as_client()
            .query_raw(
                "
                    SELECT parent_name
                      FROM action_hierarchy
                     WHERE child_name = $1 AND depth > 0
                     ORDER BY depth",
                &[&action],
            )
            .await
            .change_context(ActionError::StoreError)?
            .map_ok(|row| row.get::<_, ActionName>(0))
            .try_collect::<Vec<_>>()
            .await
            .change_context(ActionError::StoreError)?;

        // We expect all actions to have a parent, except for the root action so if we find that
        // the action has no parents, we return an error
        if action != ActionName::All && parents.is_empty() {
            Err(Report::new(ActionError::NotFound { id: action }))
        } else {
            Ok(parents)
        }
    }

    /// Unregisters an action from the database.
    ///
    /// # Errors
    ///
    /// - [`HasChildren`] if the action has children which must be unregistered first
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`HasChildren`]: ActionError::HasChildren
    /// [`StoreError`]: ActionError::StoreError
    pub async fn unregister_action(
        &mut self,
        action: ActionName,
    ) -> Result<(), Report<ActionError>> {
        let num_deleted = self
            .as_mut_client()
            .execute("DELETE FROM action WHERE name = $1", &[&action])
            .await
            .map_err(|error| {
                let policy_error = match error.code() {
                    Some(&SqlState::FOREIGN_KEY_VIOLATION) => {
                        ActionError::HasChildren { id: action }
                    }
                    _ => ActionError::StoreError,
                };
                Report::new(error).change_context(policy_error)
            })?;

        if num_deleted > 0 {
            Ok(())
        } else {
            Err(Report::new(ActionError::NotFound { id: action }))
        }
    }

    /// Creates a new policy in the database.
    ///
    /// # Errors
    ///
    /// - [`PolicyAlreadyExists`] if a policy with the same ID already exists
    /// - [`PrincipalNotFound`] if a principal referenced in the policy doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PolicyAlreadyExists`]: PolicyError::PolicyAlreadyExists
    /// [`PrincipalNotFound`]: PolicyError::PrincipalNotFound
    /// [`StoreError`]: PolicyError::StoreError
    pub async fn create_policy(&mut self, policy: Policy) -> Result<PolicyId, Report<PolicyError>> {
        if policy.actions.is_empty() {
            return Err(Report::new(PolicyError::PolicyHasNoActions));
        }

        let (principal_id, actor_type) = match policy.principal {
            Some(PrincipalConstraint::ActorType { actor_type }) => (None, Some(actor_type)),
            Some(PrincipalConstraint::Actor { actor }) => (Some(PrincipalId::Actor(actor)), None),
            Some(PrincipalConstraint::ActorGroup {
                actor_group,
                actor_type,
            }) => (Some(PrincipalId::ActorGroup(actor_group)), actor_type),
            Some(PrincipalConstraint::Role { role, actor_type }) => {
                (Some(PrincipalId::Role(role)), actor_type)
            }
            None => (None, None),
        };
        let principal_type = principal_id
            .as_ref()
            .copied()
            .map(PrincipalId::principal_type);
        let actor_type = actor_type.map(PrincipalType::from);

        let transaction = self
            .as_mut_client()
            .transaction()
            .await
            .change_context(PolicyError::StoreError)?;

        let policy_id = PolicyId::new(Uuid::new_v4());
        transaction
            .execute(
                "INSERT INTO policy (
                    id, effect, principal_id, principal_type, actor_type, resource_constraint
                ) VALUES (
                    $1, $2, $3, $4, $5, $6
                 )",
                &[
                    &policy_id,
                    &policy.effect,
                    &principal_id,
                    &principal_type,
                    &actor_type,
                    &policy.resource.as_ref().map(Json),
                ],
            )
            .await
            .map_err(|error| {
                let policy_error = match (error.code(), principal_id) {
                    (Some(&SqlState::UNIQUE_VIOLATION), _) => {
                        PolicyError::PolicyAlreadyExists { id: policy_id }
                    }
                    (Some(&SqlState::FOREIGN_KEY_VIOLATION), Some(principal_id)) => {
                        PolicyError::PrincipalNotFound { id: principal_id }
                    }
                    _ => PolicyError::StoreError,
                };
                Report::new(error).change_context(policy_error)
            })?;

        for action in policy.actions {
            transaction
                .execute(
                    "INSERT INTO policy_action (policy_id, action_name) VALUES ($1, $2)",
                    &[&policy_id, &action],
                )
                .await
                .map_err(|error| {
                    let policy_error = match error.code() {
                        Some(&SqlState::FOREIGN_KEY_VIOLATION) => {
                            PolicyError::ActionNotFound { id: action }
                        }
                        _ => PolicyError::StoreError,
                    };
                    Report::new(error).change_context(policy_error)
                })?;
        }
        transaction
            .commit()
            .await
            .change_context(PolicyError::StoreError)?;

        Ok(policy_id)
    }

    /// Builds a context used to evaluate policies for an actor.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the actor with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    ///
    /// # Performance considerations
    ///
    /// This function performs multiple database queries to collect all entities needed for policy
    /// evaluation, which could become a performance bottleneck for frequently accessed actors.
    /// Future optimizations may include:
    ///   - Combining some queries into a single more complex query
    ///   - Implementing caching strategies for frequently accessed contexts
    ///   - Prefetching contexts for related actors in batch operations
    pub async fn build_principal_context(
        &self,
        actor_id: ActorId,
    ) -> Result<Context, Report<PrincipalError>> {
        let mut context_builder = ContextBuilder::default();

        let actor = self
            .get_actor(actor_id)
            .await?
            .ok_or(PrincipalError::PrincipalNotFound {
                id: PrincipalId::Actor(actor_id),
            })?;
        context_builder.add_actor(&actor);

        let group_ids = self
            .get_actor_roles(actor_id)
            .await?
            .into_values()
            .map(|role| {
                context_builder.add_role(&role);
                role.actor_group_id()
            })
            .collect::<Vec<_>>();

        self.as_client()
            .query_raw(
                "
                WITH groups AS (
                    SELECT parent_id AS id FROM team_hierarchy WHERE child_id = ANY($1)
                    UNION ALL
                    SELECT id FROM actor_group WHERE id = ANY($1)
                )
                SELECT
                    'team'::PRINCIPAL_TYPE,
                    team.id,
                    parent.principal_type,
                    parent.id
                 FROM team
                 JOIN groups ON team.id = groups.id
                 JOIN actor_group parent ON team.parent_id = parent.id

                 UNION ALL

                 SELECT
                    'web'::PRINCIPAL_TYPE,
                    web.id,
                    NULL,
                    NULL
                 FROM web
                 JOIN groups ON web.id = groups.id
                 ",
                &[&group_ids],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_ok(|row| match row.get(0) {
                PrincipalType::Web => ActorGroup::Web(Web {
                    id: row.get(1),
                    roles: HashSet::new(),
                }),
                PrincipalType::Team => ActorGroup::Team(Team {
                    id: row.get(1),
                    parents: vec![match row.get(2) {
                        PrincipalType::Web => ActorGroupId::Web(row.get(3)),
                        PrincipalType::Team => ActorGroupId::Team(row.get(3)),
                        actor_group_type => {
                            unreachable!("Unexpected actor group type: {actor_group_type:?}")
                        }
                    }],
                    roles: HashSet::new(),
                }),
                actor_group_type => {
                    unreachable!("Unexpected actor group type: {actor_group_type:?}")
                }
            })
            .try_collect::<Vec<_>>()
            .await
            .change_context(PrincipalError::StoreError)?
            .into_iter()
            .for_each(|actor_group| {
                context_builder.add_actor_group(&actor_group);
            });

        context_builder
            .build()
            .change_context(PrincipalError::ContextBuilderError)
    }

    /// Gets all policies associated with an actor.
    ///
    /// This provides a complete set of policies that apply to an actor, including all policies that
    ///   - apply to the actor itself,
    ///   - apply to the actor's roles,
    ///   - apply to the actor's groups, and
    ///   - apply to the actor's parent groups (for teams).
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the actor with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    // TODO: We should probably allow filtering based on the action as well here
    #[expect(clippy::too_many_lines)]
    pub async fn get_policies_for_actor(
        &self,
        actor_id: ActorId,
    ) -> Result<HashMap<PolicyId, Policy>, Report<PolicyError>> {
        // The below query does several things. It:
        //   1. gets all principals that the actor can act as
        //   2. gets all policies that apply to those principals
        //   3. TODO: filters the policies based on the action -- currently not implemented
        //
        // Principals are retrieved by:
        //   - the actor itself, filtered by the actor ID and actor type
        //   - all roles assigned to the actor, filtered by the actor ID
        //   - all actor groups associated with those roles, determined by the role's actor group ID
        //   - all parent actor groups of those actor groups (for teams), determined by the actor
        //     group hierarchy
        //
        // The actions are associated in the `policy_action` table. We join that table and aggregate
        // the actions for each policy. All actions are included, but the action hierarchy is used
        // to determine which actions are relevant to the actor.
        self.as_client()
            .query_raw(
                "
                WITH principals AS (
                    -- The actor itself
                    SELECT id, principal_type
                    FROM actor
                    WHERE id = $1 AND principal_type = $2

                    UNION ALL

                    -- All roles directly assigned to the actor
                    SELECT role.id, role.principal_type
                    FROM actor_role
                    JOIN role ON actor_role.role_id = role.id
                    WHERE actor_role.actor_id = $1

                    UNION ALL

                    -- Direct actor group of each role - always included
                    SELECT actor_group.id, actor_group.principal_type
                    FROM actor_role
                    JOIN role ON actor_role.role_id = role.id
                    JOIN actor_group ON actor_group.id = role.actor_group_id
                    WHERE actor_role.actor_id = $1

                    UNION ALL

                    -- All parent actor groups of actor groups (recursively through hierarchy)
                    SELECT parent.id, parent.principal_type
                    FROM actor_role
                    JOIN role ON actor_role.role_id = role.id
                    JOIN team_hierarchy
                      ON team_hierarchy.child_id = role.actor_group_id
                    JOIN actor_group parent ON parent.id = team_hierarchy.parent_id
                    WHERE actor_role.actor_id = $1
                ),
                -- We filter out policies that don't apply to the actor's type or principal ID
                policy AS (
                    -- global and actor-type based policies
                    SELECT policy.*
                    FROM policy
                    WHERE principal_id IS NULL
                      AND (actor_type IS NULL OR actor_type = $2)

                    UNION ALL

                    -- actor type policies
                    SELECT policy.*
                    FROM policy
                    JOIN principals
                      ON policy.principal_id = principals.id
                     AND policy.principal_type = principals.principal_type
                    WHERE policy.actor_type IS NULL OR policy.actor_type = $2
                )
                SELECT
                    policy.id,
                    policy.effect,
                    policy.principal_id,
                    policy.principal_type,
                    policy.actor_type,
                    policy.resource_constraint,
                    array_agg(policy_action.action_name)
                FROM policy
                JOIN policy_action ON policy.id = policy_action.policy_id
                GROUP BY
                    policy.id, policy.effect, policy.principal_id, policy.principal_type,
                    policy.actor_type, policy.resource_constraint
                ",
                [
                    &actor_id as &(dyn ToSql + Sync),
                    &PrincipalType::from(actor_id.actor_type()),
                ],
            )
            .await
            .change_context(PolicyError::StoreError)?
            .map_err(|error| Report::new(error).change_context(PolicyError::StoreError))
            .and_then(async |row| -> Result<_, Report<PolicyError>> {
                let policy_id = PolicyId::new(row.get(0));
                let effect = row.get(1);
                let principal_uuid: Option<Uuid> = row.get(2);
                let principal_type: Option<PrincipalType> = row.get(3);
                let actor_type: Option<PrincipalType> = row.get(4);
                let resource_constraint = row
                    .get::<_, Option<Json<ResourceConstraint>>>(5)
                    .map(|json| json.0);
                let actions = row.get(6);

                let principal_id = match (principal_uuid, principal_type) {
                    (Some(uuid), Some(principal_type)) => {
                        Some(PrincipalId::new(uuid, principal_type))
                    }
                    (None, None) => None,
                    (Some(_), None) | (None, Some(_)) => {
                        return Err(Report::new(PolicyError::InvalidPrincipalConstraint));
                    }
                };

                let actor_type = actor_type
                    .map(|principal_type| {
                        principal_type_into_actor_type(principal_type)
                            .ok_or(PolicyError::InvalidPrincipalConstraint)
                    })
                    .transpose()?;

                let principal_constraint = match (principal_id, actor_type) {
                    (None, None) => None,
                    (None, Some(actor_type)) => Some(PrincipalConstraint::ActorType { actor_type }),
                    (Some(PrincipalId::Actor(actor)), None) => {
                        Some(PrincipalConstraint::Actor { actor })
                    }
                    (Some(PrincipalId::ActorGroup(actor_group)), actor_type) => {
                        Some(PrincipalConstraint::ActorGroup {
                            actor_group,
                            actor_type,
                        })
                    }
                    (Some(PrincipalId::Role(role)), actor_type) => {
                        Some(PrincipalConstraint::Role { role, actor_type })
                    }
                    _ => return Err(Report::new(PolicyError::InvalidPrincipalConstraint)),
                };

                Ok((
                    policy_id,
                    Policy {
                        id: policy_id,
                        effect,
                        principal: principal_constraint,
                        actions,
                        resource: resource_constraint,
                        constraints: None,
                    },
                ))
            })
            .try_collect::<HashMap<_, _>>()
            .await
            .change_context(PolicyError::StoreError)
    }
}
