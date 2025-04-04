use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _, ensure};
use futures::TryStreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    policies::{
        Policy, PolicyId,
        action::ActionName,
        principal::{
            PrincipalConstraint, PrincipalId,
            actor::{Ai, Machine, User},
            role::{Role, RoleId, SubteamRole, SubteamRoleId, WebRole, WebRoleId},
            team::{Subteam, SubteamId, TeamId, Web},
        },
        resource::ResourceConstraint,
    },
};
use postgres_types::{Json, ToSql};
use tokio_postgres::{GenericClient as _, error::SqlState};
use type_system::{
    knowledge::entity::id::EntityUuid,
    provenance::{ActorEntityUuid, ActorId, ActorType, AiId, MachineId, UserId},
    web::OwnedById,
};
use uuid::Uuid;

use crate::store::{AsClient, PostgresStore};

mod error;
pub use self::error::{ActionError, PolicyError, PrincipalError};

#[derive(Debug, postgres_types::ToSql, postgres_types::FromSql)]
#[postgres(name = "principal_type", rename_all = "snake_case")]
enum PrincipalType {
    User,
    Machine,
    Ai,
    Web,
    Subteam,
    WebRole,
    SubteamRole,
}

impl PrincipalType {
    const fn from_principal_id(principal_id: &PrincipalId) -> Self {
        match principal_id {
            PrincipalId::Actor(ActorId::User(_)) => Self::User,
            PrincipalId::Actor(ActorId::Machine(_)) => Self::Machine,
            PrincipalId::Actor(ActorId::Ai(_)) => Self::Ai,
            PrincipalId::Team(TeamId::Web(_)) => Self::Web,
            PrincipalId::Team(TeamId::Subteam(_)) => Self::Subteam,
            PrincipalId::Role(RoleId::Web(_)) => Self::WebRole,
            PrincipalId::Role(RoleId::Subteam(_)) => Self::SubteamRole,
        }
    }

    const fn into_actor_type(self) -> Option<ActorType> {
        match self {
            Self::User => Some(ActorType::User),
            Self::Machine => Some(ActorType::Machine),
            Self::Ai => Some(ActorType::Ai),
            _ => None,
        }
    }

    const fn make_principal_id(self, id: Uuid) -> PrincipalId {
        match self {
            Self::User => PrincipalId::Actor(ActorId::User(UserId::new(ActorEntityUuid::new(
                EntityUuid::new(id),
            )))),
            Self::Machine => PrincipalId::Actor(ActorId::Machine(MachineId::new(
                ActorEntityUuid::new(EntityUuid::new(id)),
            ))),
            Self::Ai => PrincipalId::Actor(ActorId::Ai(AiId::new(ActorEntityUuid::new(
                EntityUuid::new(id),
            )))),
            Self::Web => PrincipalId::Team(TeamId::Web(OwnedById::new(id))),
            Self::Subteam => PrincipalId::Team(TeamId::Subteam(SubteamId::new(id))),
            Self::WebRole => PrincipalId::Role(RoleId::Web(WebRoleId::new(id))),
            Self::SubteamRole => PrincipalId::Role(RoleId::Subteam(SubteamRoleId::new(id))),
        }
    }

    const fn from_actor_id(actor_id: ActorId) -> Self {
        match actor_id {
            ActorId::User(_) => Self::User,
            ActorId::Machine(_) => Self::Machine,
            ActorId::Ai(_) => Self::Ai,
        }
    }

    const fn from_actor_type(actor_type: ActorType) -> Self {
        match actor_type {
            ActorType::User => Self::User,
            ActorType::Machine => Self::Machine,
            ActorType::Ai => Self::Ai,
        }
    }
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
                    PrincipalId::Team(TeamId::Subteam(_)) => {
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
            PrincipalId::Team(TeamId::Subteam(id)) => (id.into_uuid(), PrincipalType::Subteam),
            PrincipalId::Actor(ActorId::User(id)) => (id.into_uuid(), PrincipalType::User),
            PrincipalId::Actor(ActorId::Machine(id)) => (id.into_uuid(), PrincipalType::Machine),
            PrincipalId::Actor(ActorId::Ai(id)) => (id.into_uuid(), PrincipalType::Ai),
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
                        id: PrincipalId::Team(TeamId::Subteam(SubteamId::new(id))),
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
        self.is_principal(PrincipalId::Team(TeamId::Subteam(id)))
            .await
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
                PrincipalType::Subteam => TeamId::Subteam(SubteamId::new(row.get(0))),
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
        self.delete_principal(PrincipalId::Team(TeamId::Subteam(id)))
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
            TeamId::Web(_) => (RoleId::Web(WebRoleId::new(role_id)), PrincipalType::WebRole),
            TeamId::Subteam(_) => (
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
                    PrincipalType::WebRole => Role::Web(WebRole {
                        id: WebRoleId::new(role_id),
                        web_id: OwnedById::new(team_id),
                    }),
                    PrincipalType::SubteamRole => Role::Subteam(SubteamRole {
                        id: SubteamRoleId::new(role_id),
                        subteam_id: SubteamId::new(team_id),
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

    /// Registers an action in the database.
    ///
    /// # Errors
    ///
    /// - [`AlreadyExists`] if an action with the same ID already exists
    /// - [`NotFound`] if the parent action doesn't exist
    /// - [`HasSelfCycle`] if the action has a self-cycle
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`AlreadyExists`]: ActionError::AlreadyExists
    /// [`NotFound`]: ActionError::NotFound
    /// [`HasSelfCycle`]: ActionError::HasSelfCycle
    /// [`StoreError`]: ActionError::StoreError
    pub async fn register_action(
        &mut self,
        action: ActionName,
        parent: Option<ActionName>,
    ) -> Result<(), Report<ActionError>> {
        let transaction = self
            .transaction()
            .await
            .change_context(ActionError::StoreError)?;

        transaction
            .as_client()
            .execute(
                "INSERT INTO action (name, parent) VALUES ($1, $2)",
                &[&action, &parent],
            )
            .await
            .map_err(|error| {
                let policy_error = match (error.code(), parent) {
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

        if let Some(parent) = parent {
            // Set up all parent-child relationships in a single query
            // - We insert the self-cycle first with depth 0. This allows easier lookup of the
            //   hierarchy as every action is present in the hierarchy table
            // - Next we insert the direct parent-child relationship with depth 1
            // - Finally, we insert the transitive relationships for all other depths
            transaction
                .as_client()
                .execute(
                    "INSERT INTO action_hierarchy (child_name, parent_name, depth)
                    SELECT $1, $1, 0
                    UNION ALL
                    SELECT $1, $2, 1
                    UNION ALL
                    SELECT $1, parent_name, depth + 1
                    FROM action_hierarchy
                    WHERE child_name = $2 AND depth > 0",
                    &[&action, &parent],
                )
                .await
                .change_context(ActionError::StoreError)?;
        } else if action == ActionName::All {
            transaction
                .as_client()
                .execute(
                    "INSERT INTO action_hierarchy (child_name, parent_name, depth)
                    VALUES ($1, $1, 0)",
                    &[&action],
                )
                .await
                .change_context(ActionError::StoreError)?;
        } else {
            return Err(Report::new(ActionError::HasNoParent { id: action }));
        }

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
            Some(PrincipalConstraint::Team { team, actor_type }) => {
                (Some(PrincipalId::Team(team)), actor_type)
            }
            Some(PrincipalConstraint::Role { role, actor_type }) => {
                (Some(PrincipalId::Role(role)), actor_type)
            }
            None => (None, None),
        };
        let principal_type = principal_id.as_ref().map(PrincipalType::from_principal_id);
        let actor_type = actor_type.map(PrincipalType::from_actor_type);

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
                    &principal_id.map(PrincipalId::into_uuid),
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

    /// Gets all policies associated with an actor.
    ///
    /// This provides a complete set of policies that apply to an actor, including all policies that
    ///   - apply to the actor itself,
    ///   - apply to the actor's roles,
    ///   - apply to the actor's teams, and
    ///   - apply to the actor's parent teams (for subteams).
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
        //   - all teams associated with those roles, determined by the role's team ID
        //   - all parent teams of those teams (for subteams), determined by the team hierarchy
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
                    actor_id.as_uuid() as &(dyn ToSql + Sync),
                    &PrincipalType::from_actor_id(actor_id),
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
                        Some(principal_type.make_principal_id(uuid))
                    }
                    (None, None) => None,
                    (Some(_), None) | (None, Some(_)) => {
                        return Err(Report::new(PolicyError::InvalidPrincipalConstraint));
                    }
                };

                let actor_type = actor_type
                    .map(|actor_type| {
                        actor_type
                            .into_actor_type()
                            .ok_or(PolicyError::InvalidPrincipalConstraint)
                    })
                    .transpose()?;

                let principal_constraint = match (principal_id, actor_type) {
                    (None, None) => None,
                    (None, Some(actor_type)) => Some(PrincipalConstraint::ActorType { actor_type }),
                    (Some(PrincipalId::Actor(actor)), None) => {
                        Some(PrincipalConstraint::Actor { actor })
                    }
                    (Some(PrincipalId::Team(team)), actor_type) => {
                        Some(PrincipalConstraint::Team { team, actor_type })
                    }
                    (Some(PrincipalId::Role(role)), actor_type) => {
                        Some(PrincipalConstraint::Role { role, actor_type })
                    }
                    _ => return Err(Report::new(PolicyError::InvalidPrincipalConstraint)),
                };

                Ok((
                    policy_id,
                    Policy {
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
