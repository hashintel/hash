use std::collections::HashSet;

use error_stack::{Report, ResultExt as _, ensure};
use futures::TryStreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    policies::principal::{
        ActorId, PrincipalId,
        machine::{Machine, MachineId},
        team::{StandaloneTeam, StandaloneTeamId, Subteam, SubteamId, TeamId},
        user::{User, UserId},
        web::Web,
    },
};
use tokio_postgres::{GenericClient as _, error::SqlState};
use type_system::web::OwnedById;
use uuid::Uuid;

use crate::store::{AsClient, PostgresStore};

mod error;
pub use error::PrincipalError;

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
                    PrincipalId::Role(_) => "SELECT EXISTS(SELECT 1 FROM role WHERE id = $1)",
                },
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(row.get(0))
    }

    /// Deletes a web from the system.
    ///
    /// # Errors
    ///
    /// - [`PrincipalNotFound`] if the web with the given ID doesn't exist
    /// - [`TeamHasChildren`] if the principal is a team and has children
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`PrincipalNotFound`]: PrincipalError::PrincipalNotFound
    /// [`TeamHasChildren`]: PrincipalError::TeamHasChildren
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_principal(
        &mut self,
        id: PrincipalId,
    ) -> Result<(), Report<PrincipalError>> {
        let num_deleted = self
            .as_mut_client()
            .execute(
                match id {
                    PrincipalId::Team(TeamId::Web(_)) => {
                        "DELETE FROM principal WHERE id = $1 AND principal_type = 'web'"
                    }
                    PrincipalId::Team(TeamId::Standalone(_)) => {
                        "DELETE FROM principal WHERE id = $1 AND principal_type = 'team'"
                    }
                    PrincipalId::Team(TeamId::Sub(_)) => {
                        "DELETE FROM principal WHERE id = $1 AND principal_type = 'subteam'"
                    }
                    PrincipalId::Actor(ActorId::User(_)) => {
                        "DELETE FROM principal WHERE id = $1 AND principal_type = 'user'"
                    }
                    PrincipalId::Actor(ActorId::Machine(_)) => {
                        "DELETE FROM principal WHERE id = $1 AND principal_type = 'machine'"
                    }
                    PrincipalId::Role(_) => {
                        "DELETE FROM principal WHERE id = $1 AND principal_type = 'role'"
                    }
                },
                &[id.as_uuid()],
            )
            .await
            .map_err(Report::new)
            .map_err(|error| match (error.current_context().code(), id) {
                (Some(&SqlState::FOREIGN_KEY_VIOLATION), PrincipalId::Team(id)) => {
                    error.change_context(PrincipalError::TeamHasChildren { id })
                }
                _ => error.change_context(PrincipalError::StoreError),
            })?;

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
        if let Err(error) = transaction
            .execute("INSERT INTO subteam (id) VALUES ($1)", &[&id])
            .await
        {
            // Transaction will be rolled back when dropped
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists {
                    id: PrincipalId::Team(TeamId::Sub(SubteamId::new(id))),
                })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        // Set up all parent-child relationships in a single query
        // First row creates the direct relationship with depth 1
        // Remaining rows create transitive relationships with proper depths
        if let Err(error) = transaction
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
        {
            // Transaction will be rolled back when dropped
            return if error.code() == Some(&SqlState::FOREIGN_KEY_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalNotFound {
                    id: PrincipalId::Team(parent_id),
                })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

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
                    SELECT parent_id, principal_type::TEXT
                      FROM team_hierarchy
                      JOIN principal ON principal.id = team_hierarchy.parent_id
                     WHERE child_id = $1
                     ORDER BY depth",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_ok(|row| match row.get::<_, String>(1).as_str() {
                "web" => TeamId::Web(OwnedById::new(row.get(0))),
                "team" => TeamId::Standalone(StandaloneTeamId::new(row.get(0))),
                "subteam" => TeamId::Sub(SubteamId::new(row.get(0))),
                other => unreachable!("Unexpected team_type: {other}"),
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
        let user_id = UserId::new(id.unwrap_or_else(Uuid::new_v4));
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
                id: UserId::new(row.get(0)),
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
        let id = id.unwrap_or_else(Uuid::new_v4);
        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO machine (id) VALUES ($1)", &[&id])
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists {
                    id: PrincipalId::Actor(ActorId::Machine(MachineId::new(id))),
                })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok(MachineId::new(id))
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
                id: MachineId::new(row.get(0)),
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
}
