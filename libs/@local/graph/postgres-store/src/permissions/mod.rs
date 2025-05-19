use alloc::borrow::Cow;
use core::str::FromStr as _;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _, TryReportIteratorExt as _, ensure};
use futures::TryStreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    policies::{
        ContextBuilder,
        action::ActionName,
        resource::{EntityTypeId, EntityTypeResource},
        store::{RoleAssignmentStatus, RoleUnassignmentStatus},
    },
};
use hash_graph_store::error::QueryError;
use hash_status::StatusCode;
use tokio_postgres::{GenericClient as _, error::SqlState};
use type_system::{
    ontology::VersionedUrl,
    principal::{
        PrincipalId, PrincipalType,
        actor::{Actor, ActorEntityUuid, ActorId, Ai, AiId, Machine, MachineId, User, UserId},
        actor_group::{ActorGroup, ActorGroupEntityUuid, ActorGroupId, Team, TeamId, Web, WebId},
        role::{Role, RoleId, RoleName, TeamRole, TeamRoleId, WebRole, WebRoleId},
    },
};
use uuid::Uuid;

use crate::store::{AsClient, PostgresStore};

mod error;
pub use self::error::{ActionError, PolicyError, PrincipalError};

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

    /// Creates a new user with the given ID, or generates a new UUID if none
    /// is provided.
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
    /// Returns `None` if the ID is the public actor.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    /// - [`ActorNotFound`] if the actor with the given ID doesn't exist
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    /// [`ActorNotFound`]: PrincipalError::ActorNotFound
    pub async fn determine_actor(
        &self,
        id: ActorEntityUuid,
    ) -> Result<Option<ActorId>, Report<PrincipalError>> {
        if Uuid::from(id).is_nil() {
            return Ok(None);
        }

        let row = self
            .as_client()
            .query_opt("SELECT principal_type FROM actor WHERE id = $1", &[&id])
            .await
            .change_context(PrincipalError::StoreError)?
            .ok_or(PrincipalError::ActorNotFound { id })?;

        Ok(Some(match row.get(0) {
            PrincipalType::User => ActorId::User(UserId::new(id)),
            PrincipalType::Machine => ActorId::Machine(MachineId::new(id)),
            PrincipalType::Ai => ActorId::Ai(AiId::new(id)),
            principal_type => unreachable!("Unexpected actor type: {principal_type:?}"),
        }))
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
        identifier: &str,
    ) -> Result<MachineId, Report<PrincipalError>> {
        let id = MachineId::new(id.unwrap_or_else(Uuid::new_v4));
        if let Err(error) = self
            .as_mut_client()
            .execute(
                "INSERT INTO machine_actor (id, identifier) VALUES ($1, $2)",
                &[&id, &identifier],
            )
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
                       machine_actor.identifier,
                       array_agg(role.id) FILTER (WHERE role.id IS NOT NULL),
                       array_agg(role.principal_type) FILTER (WHERE role.id IS NOT NULL)
                FROM machine_actor
                LEFT OUTER JOIN actor_role ON machine_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                WHERE machine_actor.id = $1
                GROUP BY machine_actor.id, machine_actor.identifier",
                &[&id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| {
                let role_ids = row.get::<_, Option<Vec<Uuid>>>(2).unwrap_or_default();
                let principal_types = row
                    .get::<_, Option<Vec<PrincipalType>>>(3)
                    .unwrap_or_default();
                Machine {
                    id: row.get(0),
                    identifier: row.get(1),
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
    pub async fn create_ai(
        &mut self,
        id: Option<Uuid>,
        identifier: &str,
    ) -> Result<AiId, Report<PrincipalError>> {
        let ai_id = AiId::new(id.unwrap_or_else(Uuid::new_v4));
        if let Err(error) = self
            .as_mut_client()
            .execute(
                "INSERT INTO ai_actor (id, identifier) VALUES ($1, $2)",
                &[&ai_id, &identifier],
            )
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
                SELECT
                    ai_actor.id,
                    ai_actor.identifier,
                    array_agg(role.id) FILTER (WHERE role.id IS NOT NULL),
                    array_agg(role.principal_type) FILTER (WHERE role.id IS NOT NULL)
                FROM ai_actor
                LEFT OUTER JOIN actor_role ON ai_actor.id = actor_role.actor_id
                LEFT OUTER JOIN role ON actor_role.role_id = role.id
                WHERE ai_actor.id = $1
                GROUP BY ai_actor.id, ai_actor.identifier",
                &[&id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| {
                let role_ids = row.get::<_, Option<Vec<Uuid>>>(2).unwrap_or_default();
                let principal_types = row
                    .get::<_, Option<Vec<PrincipalType>>>(3)
                    .unwrap_or_default();
                Ai {
                    id: row.get(0),
                    identifier: row.get(1),
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
            .query_opt(
                "SELECT
                    web.id,
                    shortname,
                    array_remove(array_agg(role.id), NULL)
                FROM web
                LEFT OUTER JOIN role ON web.id = role.actor_group_id
                WHERE web.id = $1
                GROUP BY web.id, web.shortname",
                &[&id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<WebRoleId>>(2);
                Web {
                    id: row.get(0),
                    shortname: row.get(1),
                    roles: role_ids.into_iter().collect(),
                }
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
    pub async fn insert_team(
        &mut self,
        id: Option<Uuid>,
        parent_id: ActorGroupId,
        name: &str,
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
                "INSERT INTO team (id, parent_id, name) VALUES ($1, $2, $3)",
                &[&id, &parent_id, &name],
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
        Ok(self
            .as_client()
            .query_opt(
                "SELECT
                    team.id,
                    parent.principal_type,
                    parent.id,
                    team.name,
                    array_remove(array_agg(role.id), NULL)
                FROM team
                JOIN actor_group AS parent ON parent.id = parent_id
                LEFT OUTER JOIN role ON team.id = role.actor_group_id
                WHERE team.id = $1
                GROUP BY team.id, parent.principal_type, parent.id, team.name",
                &[&id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| {
                let role_ids = row.get::<_, Vec<TeamRoleId>>(4);
                Team {
                    id: row.get(0),
                    parent_id: match row.get(1) {
                        PrincipalType::Web => ActorGroupId::Web(row.get(2)),
                        PrincipalType::Team => ActorGroupId::Team(row.get(2)),
                        principal_type => {
                            unreachable!("Unexpected principal type {principal_type}")
                        }
                    },
                    name: row.get(3),
                    roles: role_ids.into_iter().collect(),
                }
            }))
    }

    /// Gets all parent actor groups for the given team.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_parent_actor_groups(
        &self,
        id: TeamId,
    ) -> Result<Vec<ActorGroupId>, Report<PrincipalError>> {
        self.as_client()
            .query_raw(
                "SELECT
                    parent.principal_type,
                    parent.id
                FROM team_hierarchy
                JOIN actor_group AS parent ON parent.id = parent_id
                WHERE child_id = $1
                ORDER BY depth ASC",
                &[&id],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_ok(|row| match row.get(0) {
                PrincipalType::Web => ActorGroupId::Web(row.get(1)),
                PrincipalType::Team => ActorGroupId::Team(row.get(1)),
                principal_type => {
                    unreachable!("Unexpected principal type {principal_type}")
                }
            })
            .try_collect()
            .await
            .change_context(PrincipalError::StoreError)
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
                &[&role_id, &principal_type, &actor_group_id, &name],
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
                "SELECT
                    id
                FROM role
                WHERE actor_group_id = $1
                  AND name = $2
                  AND principal_type = $3",
                &[
                    &actor_group_id,
                    &name,
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
        actor_id: impl Into<ActorId>,
        role_id: RoleId,
    ) -> Result<RoleAssignmentStatus, Report<PrincipalError>> {
        let actor_id = actor_id.into();
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
        actor_id: impl Into<ActorId>,
        role_id: RoleId,
    ) -> Result<RoleUnassignmentStatus, Report<PrincipalError>> {
        let actor_id = actor_id.into();
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
                match row.get(1) {
                    PrincipalType::WebRole => (
                        RoleId::Web(WebRoleId::new(role_id)),
                        Role::Web(WebRole {
                            id: WebRoleId::new(role_id),
                            web_id: row.get(2),
                            name: row.get(3),
                        }),
                    ),
                    PrincipalType::TeamRole => (
                        RoleId::Team(TeamRoleId::new(role_id)),
                        Role::Team(TeamRole {
                            id: TeamRoleId::new(role_id),
                            team_id: row.get(2),
                            name: row.get(3),
                        }),
                    ),
                    principal_type => unreachable!("Unexpected role type: {principal_type:?}"),
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

    /// Removes all actions which are not known to the system and adds any missing actions.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: ActionError::StoreError
    pub async fn synchronize_actions(&mut self) -> Result<(), Report<ActionError>> {
        let mut actions = ActionName::all().collect::<HashSet<_>>();

        let actions_to_be_removed = self
            .as_client()
            .query("SELECT name FROM action", &[])
            .await
            .change_context(ActionError::StoreError)?
            .into_iter()
            .filter_map(|row| {
                let action_name = row.get::<_, &str>(0);
                ActionName::from_str(action_name).map_or_else(
                    |_| Some(action_name.to_owned()),
                    |action_name| {
                        actions.remove(&action_name);
                        None
                    },
                )
            })
            .collect::<Vec<String>>();

        self.as_client()
            .query(
                "DELETE FROM action WHERE name = ANY($1)",
                &[&actions_to_be_removed],
            )
            .await
            .change_context(ActionError::StoreError)?;

        for action in ActionName::all() {
            if actions.contains(&action) {
                self.register_action(action).await?;
            }
        }

        Ok(())
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
        context_builder: &mut ContextBuilder,
    ) -> Result<(), Report<PrincipalError>> {
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
                    team.name,
                    parent.principal_type,
                    parent.id
                 FROM team
                 JOIN groups ON team.id = groups.id
                 JOIN actor_group parent ON team.parent_id = parent.id

                 UNION

                 SELECT
                    'web'::PRINCIPAL_TYPE,
                    web.id,
                    web.shortname,
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
                    shortname: row.get(2),
                    roles: HashSet::new(),
                }),
                PrincipalType::Team => ActorGroup::Team(Team {
                    id: row.get(1),
                    name: row.get(2),
                    parent_id: match row.get(3) {
                        PrincipalType::Web => ActorGroupId::Web(row.get(4)),
                        PrincipalType::Team => ActorGroupId::Team(row.get(4)),
                        actor_group_type => {
                            unreachable!("Unexpected actor group type: {actor_group_type:?}")
                        }
                    },
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

        Ok(())
    }

    /// Builds a context used to evaluate policies for a set of entity types.
    ///
    /// # Errors
    ///
    /// - [`QueryError`] if a database error occurs
    pub async fn build_entity_type_context(
        &self,
        entity_type_ids: &[VersionedUrl],
        context_builder: &mut ContextBuilder,
    ) -> Result<(), Report<QueryError>> {
        let () = self
            .as_client()
            .query(
                "
                    SELECT input.idx
                    FROM unnest($1::text[]) WITH ORDINALITY AS input(url, idx)
                    WHERE NOT EXISTS (
                        SELECT 1 FROM entity_types
                        WHERE entity_types.schema ->> '$id' = input.url
                    )",
                &[&entity_type_ids],
            )
            .await
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                #[expect(
                    clippy::cast_possible_truncation,
                    clippy::cast_sign_loss,
                    reason = "The index is 1-based and is always less than or equal to the length \
                              of the array"
                )]
                Err(Report::new(QueryError).attach_printable(format!(
                    "Entity type not found: `{}`",
                    entity_type_ids[row.get::<_, i64>(0) as usize - 1]
                )))
            })
            .try_collect_reports()
            .change_context(QueryError)
            .attach(StatusCode::NotFound)?;

        self.as_client()
            .query(
                "
                WITH filtered AS (
                    SELECT entity_types.ontology_id
                    FROM entity_types
                    WHERE entity_types.schema ->> '$id' = any($1)
                )
                SELECT
                    ontology_ids.base_url,
                    ontology_ids.version,
                    ontology_owned_metadata.web_id
                FROM filtered
                INNER JOIN ontology_ids
                    ON filtered.ontology_id = ontology_ids.ontology_id
                LEFT OUTER JOIN ontology_owned_metadata
                    ON ontology_ids.ontology_id = ontology_owned_metadata.ontology_id

                UNION

                SELECT
                    ontology_ids.base_url,
                    ontology_ids.version,
                    ontology_owned_metadata.web_id
                FROM filtered
                INNER JOIN
                    entity_type_inherits_from
                    ON filtered.ontology_id = source_entity_type_ontology_id
                INNER JOIN ontology_ids
                    ON target_entity_type_ontology_id = ontology_ids.ontology_id
                LEFT OUTER JOIN ontology_owned_metadata
                    ON ontology_ids.ontology_id = ontology_owned_metadata.ontology_id;
                 ",
                &[&entity_type_ids],
            )
            .await
            .change_context(QueryError)?
            .into_iter()
            .for_each(|row| {
                context_builder.add_entity_type(&EntityTypeResource {
                    id: Cow::Owned(EntityTypeId::new(VersionedUrl {
                        base_url: row.get(0),
                        version: row.get(1),
                    })),
                    web_id: row.get(2),
                });
            });

        Ok(())
    }
}
