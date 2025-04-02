use std::collections::HashSet;

use error_stack::{Report, ResultExt as _, ensure};
use futures::TryStreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    policies::principal::{
        PrincipalId,
        ai::Ai,
        machine::Machine,
        role::{Role, RoleId},
        team::{
            StandaloneTeam, StandaloneTeamId, StandaloneTeamRole, StandaloneTeamRoleId, Subteam,
            SubteamId, SubteamRole, TeamId,
        },
        user::User,
        web::{SubteamRoleId, Web, WebRole, WebRoleId},
    },
};
use tokio_postgres::{GenericClient as _, error::SqlState};
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, ActorId, AiId, MachineId, UserId},
    web::OwnedById,
};
use uuid::Uuid;

use crate::store::{AsClient, PostgresStore};

mod error;
pub use error::PrincipalError;

#[derive(Debug, postgres_types::ToSql, postgres_types::FromSql)]
#[postgres(name = "principal_type", rename_all = "snake_case")]
pub enum PrincipalType {
    User,
    Machine,
    Ai,
    Team,
    Web,
    Subteam,
    Role,
    WebRole,
    SubteamRole,
}

#[derive(Debug)]
pub enum RoleAssignmentStatus {
    NewlyAssigned,
    AlreadyAssigned,
}

#[derive(Debug)]
pub enum RoleUnassignmentStatus {
    Unassigned,
    NotAssigned,
}

impl<C: AsClient, A: AuthorizationApi> PostgresStore<C, A> {
    /// Checks if a principal with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_principal(&self, id: PrincipalId) -> Result<bool, Report<PrincipalError>> {
        let row = self
            .as_client()
            .query_one(
                match id {
                    PrincipalId::Team(TeamId::Web(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM web WHERE id = $1)"
                    }
                    PrincipalId::Team(TeamId::Standalone(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM team WHERE id = $1
                        AND principal_type = 'team')"
                    }
                    PrincipalId::Team(TeamId::Sub(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM subteam WHERE id = $1)"
                    }
                    PrincipalId::Actor(ActorId::User(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM \"user\" WHERE id = $1)"
                    }
                    PrincipalId::Actor(ActorId::Machine(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM machine WHERE id = $1)"
                    }
                    PrincipalId::Actor(ActorId::Ai(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM ai WHERE id = $1)"
                    }
                    PrincipalId::Role(RoleId::Standalone(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM role WHERE id = $1
                        AND principal_type = 'role')"
                    }
                    PrincipalId::Role(RoleId::Web(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM role WHERE id = $1
                        AND principal_type = 'web_role')"
                    }
                    PrincipalId::Role(RoleId::Subteam(_)) => {
                        "SELECT EXISTS(SELECT 1 FROM role WHERE id = $1
                        AND principal_type = 'subteam_role')"
                    }
                },
                &[id.as_uuid()],
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
        let (uuid, principal_type) = match id {
            PrincipalId::Team(TeamId::Web(id)) => (id.into_uuid(), PrincipalType::Web),
            PrincipalId::Team(TeamId::Standalone(id)) => (id.into_uuid(), PrincipalType::Team),
            PrincipalId::Team(TeamId::Sub(id)) => (id.into_uuid(), PrincipalType::Subteam),
            PrincipalId::Actor(ActorId::User(id)) => (id.into_uuid(), PrincipalType::User),
            PrincipalId::Actor(ActorId::Machine(id)) => (id.into_uuid(), PrincipalType::Machine),
            PrincipalId::Actor(ActorId::Ai(id)) => (id.into_uuid(), PrincipalType::Ai),
            PrincipalId::Role(RoleId::Standalone(id)) => (id.into_uuid(), PrincipalType::Role),
            PrincipalId::Role(RoleId::Web(id)) => (id.into_uuid(), PrincipalType::WebRole),
            PrincipalId::Role(RoleId::Subteam(id)) => (id.into_uuid(), PrincipalType::SubteamRole),
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

    /// Creates a new standalone team with the given ID, or generates a new UUID if none is
    /// provided.
    ///
    /// # Errors
    ///
    /// - [`PrincipalAlreadyExists`] if a team with the given ID already exists
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalAlreadyExists`]: PrincipalError::PrincipalAlreadyExists
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn create_standalone_team(
        &mut self,
        id: Option<Uuid>,
    ) -> Result<StandaloneTeamId, Report<PrincipalError>> {
        let team_id = StandaloneTeamId::new(id.unwrap_or_else(Uuid::new_v4));
        if let Err(error) = self
            .as_mut_client()
            .execute(
                "INSERT INTO team (id, principal_type) VALUES ($1, 'team')",
                &[team_id.as_uuid()],
            )
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists {
                    id: PrincipalId::Team(TeamId::Standalone(team_id)),
                })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok(team_id)
    }

    /// Checks if a standalone team with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_standalone_team(
        &self,
        id: StandaloneTeamId,
    ) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(PrincipalId::Team(TeamId::Standalone(id)))
            .await
    }

    /// Gets a standalone team by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_standalone_team(
        &self,
        id: StandaloneTeamId,
    ) -> Result<Option<StandaloneTeam>, Report<PrincipalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "SELECT id FROM team WHERE id = $1 AND principal_type = 'team'",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| StandaloneTeam {
                id: StandaloneTeamId::new(row.get(0)),
                roles: HashSet::new(),
            }))
    }

    /// Deletes a standalone team from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the team with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_standalone_team(
        &mut self,
        id: StandaloneTeamId,
    ) -> Result<(), Report<PrincipalError>> {
        self.delete_principal(PrincipalId::Team(TeamId::Standalone(id)))
            .await
    }

    /// Creates a new web with the given ID, or generates a new UUID if none is provided.
    ///
    /// # Errors
    ///
    /// - [`PrincipalAlreadyExists`] if a web with the given ID already exists
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalAlreadyExists`]: PrincipalError::PrincipalAlreadyExists
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn create_web(
        &mut self,
        id: Option<Uuid>,
    ) -> Result<OwnedById, Report<PrincipalError>> {
        let web_id = OwnedById::new(id.unwrap_or_else(Uuid::new_v4));
        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO web (id) VALUES ($1)", &[web_id.as_uuid()])
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists {
                    id: PrincipalId::Team(TeamId::Web(web_id)),
                })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok(web_id)
    }

    /// Checks if a web with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_web(&self, id: OwnedById) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(PrincipalId::Team(TeamId::Web(id))).await
    }

    /// Gets a web by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_web(&self, id: OwnedById) -> Result<Option<Web>, Report<PrincipalError>> {
        Ok(self
            .as_client()
            .query_opt("SELECT id FROM web WHERE id = $1", &[id.as_uuid()])
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| Web {
                id: OwnedById::new(row.get(0)),
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
    pub async fn delete_web(&mut self, id: OwnedById) -> Result<(), Report<PrincipalError>> {
        self.delete_principal(PrincipalId::Team(TeamId::Web(id)))
            .await
    }

    /// Creates a new subteam with the given ID and parent team, or generates a new UUID if none is
    /// provided.
    ///
    /// # Errors
    ///
    /// - [`PrincipalAlreadyExists`] if a subteam with the given ID already exists
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalAlreadyExists`]: PrincipalError::PrincipalAlreadyExists
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn create_subteam(
        &mut self,
        id: Option<Uuid>,
        parent_id: TeamId,
    ) -> Result<SubteamId, Report<PrincipalError>> {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let transaction = self
            .as_mut_client()
            .transaction()
            .await
            .change_context(PrincipalError::StoreError)?;

        // First create the subteam
        transaction
            .execute(
                "INSERT INTO subteam (id, parent_id) VALUES ($1, $2)",
                &[&id, parent_id.as_uuid()],
            )
            .await
            .map_err(Report::new)
            .map_err(|error| match error.current_context().code() {
                Some(&SqlState::UNIQUE_VIOLATION) => {
                    error.change_context(PrincipalError::PrincipalAlreadyExists {
                        id: PrincipalId::Team(TeamId::Sub(SubteamId::new(id))),
                    })
                }
                Some(&SqlState::FOREIGN_KEY_VIOLATION) => {
                    error.change_context(PrincipalError::PrincipalNotFound {
                        id: PrincipalId::Team(parent_id),
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
                &[parent_id.as_uuid(), &id],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        transaction
            .commit()
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(SubteamId::new(id))
    }

    /// Checks if a subteam with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_subteam(&self, id: SubteamId) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(PrincipalId::Team(TeamId::Sub(id))).await
    }

    /// Gets a subteam by its ID.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_subteam(
        &self,
        id: SubteamId,
    ) -> Result<Option<Subteam>, Report<PrincipalError>> {
        let parents = self
            .as_client()
            .query_raw(
                "
                    SELECT parent_id, principal_type
                      FROM team_hierarchy
                      JOIN principal ON principal.id = team_hierarchy.parent_id
                     WHERE child_id = $1
                     ORDER BY depth",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_ok(|row| match row.get(1) {
                PrincipalType::Web => TeamId::Web(OwnedById::new(row.get(0))),
                PrincipalType::Team => TeamId::Standalone(StandaloneTeamId::new(row.get(0))),
                PrincipalType::Subteam => TeamId::Sub(SubteamId::new(row.get(0))),
                other => unreachable!("Unexpected team type: {other:?}"),
            })
            .try_collect::<Vec<_>>()
            .await
            .change_context(PrincipalError::StoreError)?;

        if parents.is_empty() {
            return Ok(None);
        }

        Ok(Some(Subteam {
            id,
            parents,
            roles: HashSet::new(),
        }))
    }

    /// Deletes a subteam from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the subteam with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_subteam(&mut self, id: SubteamId) -> Result<(), Report<PrincipalError>> {
        self.delete_principal(PrincipalId::Team(TeamId::Sub(id)))
            .await
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
        let user_id = UserId::new(ActorEntityUuid::new(EntityUuid::new(
            id.unwrap_or_else(Uuid::new_v4),
        )));
        if let Err(error) = self
            .as_mut_client()
            .execute(
                "INSERT INTO \"user\" (id) VALUES ($1)",
                &[user_id.as_uuid()],
            )
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

    /// Checks if a user with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_user(&self, id: UserId) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(PrincipalId::Actor(ActorId::User(id)))
            .await
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
            .query_opt("SELECT id FROM \"user\" WHERE id = $1", &[id.as_uuid()])
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| User {
                id: UserId::new(ActorEntityUuid::new(row.get(0))),
                roles: HashSet::new(),
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
        let id = MachineId::new(ActorEntityUuid::new(EntityUuid::new(
            id.unwrap_or_else(Uuid::new_v4),
        )));
        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO machine (id) VALUES ($1)", &[id.as_uuid()])
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
    pub async fn is_machine(&self, id: MachineId) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(PrincipalId::Actor(ActorId::Machine(id)))
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
            .query_opt("SELECT id FROM machine WHERE id = $1", &[id.as_uuid()])
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| Machine {
                id: MachineId::new(ActorEntityUuid::new(row.get(0))),
                roles: HashSet::new(),
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
        let id = AiId::new(ActorEntityUuid::new(EntityUuid::new(
            id.unwrap_or_else(Uuid::new_v4),
        )));
        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO ai (id) VALUES ($1)", &[id.as_uuid()])
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists {
                    id: PrincipalId::Actor(ActorId::Ai(id)),
                })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok(id)
    }

    /// Checks if an AI with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_ai(&self, id: AiId) -> Result<bool, Report<PrincipalError>> {
        self.is_principal(PrincipalId::Actor(ActorId::Ai(id))).await
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
            .query_opt("SELECT id FROM ai WHERE id = $1", &[id.as_uuid()])
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| Ai {
                id: AiId::new(ActorEntityUuid::new(row.get(0))),
                roles: HashSet::new(),
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
        team_id: TeamId,
    ) -> Result<RoleId, Report<PrincipalError>> {
        let role_id = id.unwrap_or_else(Uuid::new_v4);
        let (role_id, principal_type) = match team_id {
            TeamId::Standalone(_) => (
                RoleId::Standalone(StandaloneTeamRoleId::new(role_id)),
                PrincipalType::Role,
            ),
            TeamId::Web(_) => (RoleId::Web(WebRoleId::new(role_id)), PrincipalType::WebRole),
            TeamId::Sub(_) => (
                RoleId::Subteam(SubteamRoleId::new(role_id)),
                PrincipalType::SubteamRole,
            ),
        };

        if let Err(error) = self
            .as_mut_client()
            .execute(
                "INSERT INTO role (id, principal_type, team_id)
                VALUES ($1, $2, $3)",
                &[role_id.as_uuid(), &principal_type, team_id.as_uuid()],
            )
            .await
        {
            return match error.code() {
                Some(&SqlState::UNIQUE_VIOLATION) => {
                    Err(error).change_context(PrincipalError::PrincipalAlreadyExists {
                        id: PrincipalId::Role(role_id),
                    })
                }
                Some(&SqlState::FOREIGN_KEY_VIOLATION) => {
                    Err(error).change_context(PrincipalError::PrincipalNotFound {
                        id: PrincipalId::Team(team_id),
                    })
                }
                _ => Err(error).change_context(PrincipalError::StoreError),
            };
        }

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
    pub async fn get_role(&self, id: RoleId) -> Result<Option<Role>, Report<PrincipalError>> {
        Ok(self
            .as_client()
            .query_opt(
                "SELECT id, principal_type, team_id FROM role WHERE id = $1",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map(|row| {
                let role_id: Uuid = row.get(0);
                let team_id: Uuid = row.get(2);
                match row.get(1) {
                    PrincipalType::Role => Role::Standalone(StandaloneTeamRole {
                        id: StandaloneTeamRoleId::new(role_id),
                        team_id: StandaloneTeamId::new(team_id),
                    }),
                    PrincipalType::WebRole => Role::Web(WebRole {
                        id: WebRoleId::new(role_id),
                        web_id: OwnedById::new(team_id),
                    }),
                    PrincipalType::SubteamRole => Role::Subteam(SubteamRole {
                        id: SubteamRoleId::new(role_id),
                        team_id: SubteamId::new(team_id),
                    }),
                    other => unreachable!("Unexpected role type: {other:?}"),
                }
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
    pub async fn assign_role_to_actor(
        &mut self,
        actor_id: ActorId,
        role_id: RoleId,
    ) -> Result<RoleAssignmentStatus, Report<PrincipalError>> {
        // Check if the actor exists
        if !self.is_principal(PrincipalId::Actor(actor_id)).await? {
            return Err(Report::new(PrincipalError::PrincipalNotFound {
                id: PrincipalId::Actor(actor_id),
            }));
        }

        // Check if the role exists
        if !self.is_principal(PrincipalId::Role(role_id)).await? {
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
                &[actor_id.as_uuid(), role_id.as_uuid()],
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
    pub async fn unassign_role_from_actor(
        &mut self,
        actor_id: ActorId,
        role_id: RoleId,
    ) -> Result<RoleUnassignmentStatus, Report<PrincipalError>> {
        let num_deleted = self
            .as_mut_client()
            .execute(
                "DELETE FROM actor_role WHERE actor_id = $1 AND role_id = $2",
                &[actor_id.as_uuid(), role_id.as_uuid()],
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
    ) -> Result<HashSet<RoleId>, Report<PrincipalError>> {
        // Check if the actor exists
        if !self.is_principal(PrincipalId::Actor(actor_id)).await? {
            return Err(Report::new(PrincipalError::PrincipalNotFound {
                id: PrincipalId::Actor(actor_id),
            }));
        }

        let rows = self
            .as_client()
            .query(
                "SELECT r.id, r.principal_type
                 FROM actor_role ar
                 JOIN role r ON ar.role_id = r.id
                 WHERE ar.actor_id = $1",
                &[actor_id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        let mut roles = HashSet::new();
        for row in rows {
            let id: Uuid = row.get(0);
            let principal_type: PrincipalType = row.get(1);

            let role_id = match principal_type {
                PrincipalType::WebRole => RoleId::Web(WebRoleId::new(id)),
                PrincipalType::Role => RoleId::Standalone(StandaloneTeamRoleId::new(id)),
                PrincipalType::SubteamRole => RoleId::Subteam(SubteamRoleId::new(id)),
                _ => continue, // Skip non-role principal types
            };

            roles.insert(role_id);
        }

        Ok(roles)
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

        let rows = self
            .as_client()
            .query(
                "SELECT a.id, a.principal_type
                 FROM actor_role ar
                 JOIN actor a ON ar.actor_id = a.id
                 WHERE ar.role_id = $1",
                &[role_id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        let mut actors = HashSet::new();
        for row in rows {
            let id = ActorEntityUuid::new(row.get(0));
            let principal_type: PrincipalType = row.get(1);

            let actor_id = match principal_type {
                PrincipalType::User => ActorId::User(UserId::new(id)),
                PrincipalType::Machine => ActorId::Machine(MachineId::new(id)),
                PrincipalType::Ai => ActorId::Ai(AiId::new(id)),
                _ => continue, // Skip non-actor principal types
            };

            actors.insert(actor_id);
        }

        Ok(actors)
    }

    /// Gets all principal IDs associated with an actor.
    ///
    /// This provides a complete set of principals that the actor can act as, including:
    /// - The actor itself
    /// - All roles directly assigned to the actor
    /// - All teams that the actor's roles belong to
    /// - All parent teams of those teams (for subteams)
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the actor with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_actor_principals(
        &self,
        actor_id: ActorId,
    ) -> Result<HashSet<PrincipalId>, Report<PrincipalError>> {
        // Use a single optimized query that gets all principals in one go:
        // 1. The actor itself
        // 2. All roles assigned to the actor
        // 3. All teams associated with those roles
        // 4. All parent teams of those teams (for subteams)
        // We utilize the team_hierarchy table which already stores parent-child relationships
        let principals = self
            .as_client()
            .query_raw(
                "
                -- The actor itself
                SELECT $1 AS id, principal_type
                FROM actor
                WHERE id = $1

                UNION ALL

                -- All roles directly assigned to the actor
                SELECT role.id, role.principal_type
                FROM actor_role
                JOIN role ON actor_role.role_id = role.id
                WHERE actor_role.actor_id = $1

                UNION ALL

                -- Direct team of each role - always included
                SELECT team.id, team.principal_type
                FROM actor_role
                JOIN role ON actor_role.role_id = role.id
                JOIN team ON team.id = role.team_id
                WHERE actor_role.actor_id = $1

                UNION ALL

                -- All parent teams of subteams (recursively through hierarchy)
                SELECT parent.id, parent.principal_type
                FROM actor_role
                JOIN role ON actor_role.role_id = role.id
                JOIN team_hierarchy ON team_hierarchy.child_id = role.team_id
                JOIN team parent ON parent.id = team_hierarchy.parent_id
                WHERE actor_role.actor_id = $1
                ",
                &[actor_id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_ok(|row| {
                let id: Uuid = row.get(0);
                match row.get(1) {
                    // Actors
                    PrincipalType::User => PrincipalId::Actor(ActorId::User(UserId::new(
                        ActorEntityUuid::new(EntityUuid::new(id)),
                    ))),
                    PrincipalType::Machine => PrincipalId::Actor(ActorId::Machine(MachineId::new(
                        ActorEntityUuid::new(EntityUuid::new(id)),
                    ))),
                    PrincipalType::Ai => PrincipalId::Actor(ActorId::Ai(AiId::new(
                        ActorEntityUuid::new(EntityUuid::new(id)),
                    ))),

                    // Teams
                    PrincipalType::Team => {
                        PrincipalId::Team(TeamId::Standalone(StandaloneTeamId::new(id)))
                    }
                    PrincipalType::Web => PrincipalId::Team(TeamId::Web(OwnedById::new(id))),
                    PrincipalType::Subteam => PrincipalId::Team(TeamId::Sub(SubteamId::new(id))),

                    // Roles
                    PrincipalType::Role => {
                        PrincipalId::Role(RoleId::Standalone(StandaloneTeamRoleId::new(id)))
                    }
                    PrincipalType::WebRole => PrincipalId::Role(RoleId::Web(WebRoleId::new(id))),
                    PrincipalType::SubteamRole => {
                        PrincipalId::Role(RoleId::Subteam(SubteamRoleId::new(id)))
                    }
                }
            })
            .try_collect::<HashSet<_>>()
            .await
            .change_context(PrincipalError::StoreError)?;

        if principals.is_empty() {
            Err(Report::new(PrincipalError::PrincipalNotFound {
                id: PrincipalId::Actor(actor_id),
            }))
        } else {
            Ok(principals)
        }
    }
}
