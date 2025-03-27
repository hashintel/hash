use error_stack::{Report, ResultExt as _, ensure};
use futures::TryStreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    policies::principal::{
        machine::MachineId,
        team::{StandaloneTeamId, SubteamId, TeamId},
        user::UserId,
    },
};
use tokio_postgres::{GenericClient as _, error::SqlState};
use type_system::web::OwnedById;
use uuid::Uuid;

use crate::store::{AsClient, PostgresStore};

mod error;
pub use error::PrincipalError;

impl<C: AsClient, A: AuthorizationApi> PostgresStore<C, A> {
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
        let id = id.unwrap_or_else(Uuid::new_v4);
        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO web (id) VALUES ($1)", &[&id])
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists { id })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok(OwnedById::new(id))
    }

    /// Checks if a web with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_web(&self, id: OwnedById) -> Result<bool, Report<PrincipalError>> {
        let row = self
            .as_client()
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM web WHERE id = $1)",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(row.get(0))
    }

    /// Gets a web by its ID.
    ///
    /// # Errors
    ///
    /// - [`WebNotFound`] if the web with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`WebNotFound`]: PrincipalError::WebNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_web(&self, id: OwnedById) -> Result<OwnedById, Report<PrincipalError>> {
        self.as_client()
            .query_opt("SELECT id FROM web WHERE id = $1", &[id.as_uuid()])
            .await
            .change_context(PrincipalError::StoreError)?
            .map_or_else(
                || Err(Report::new(PrincipalError::WebNotFound { id })),
                |row| Ok(OwnedById::new(row.get(0))),
            )
    }

    /// Deletes a web from the system.
    ///
    /// # Errors
    ///
    /// - [`WebNotFound`] if the web with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`WebNotFound`]: PrincipalError::WebNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_web(&mut self, id: OwnedById) -> Result<(), Report<PrincipalError>> {
        let num_deleted = self
            .as_mut_client()
            .execute(
                "DELETE FROM principal WHERE id = $1 AND principal_type = 'web'",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)
            .attach_printable("Failed to execute delete query")?;

        ensure!(num_deleted > 0, PrincipalError::WebNotFound { id });

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
        let id = id.unwrap_or_else(Uuid::new_v4);
        if let Err(error) = self
            .as_mut_client()
            .execute(
                "INSERT INTO team (id, team_type) VALUES ($1, 'team')",
                &[&id],
            )
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists { id })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok(StandaloneTeamId::new(id))
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
        let row = self
            .as_client()
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM team WHERE id = $1 AND team_type = 'team')",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(row.get(0))
    }

    /// Gets a standalone team by its ID.
    ///
    /// # Errors
    ///
    /// - [`StandaloneTeamNotFound`] if the team with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StandaloneTeamNotFound`]: PrincipalError::StandaloneTeamNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_standalone_team(
        &self,
        id: StandaloneTeamId,
    ) -> Result<StandaloneTeamId, Report<PrincipalError>> {
        self.as_client()
            .query_opt(
                "SELECT id FROM team WHERE id = $1 AND team_type = 'team'",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_or_else(
                || {
                    Err(Report::new(PrincipalError::StandaloneTeamNotFound {
                        id: StandaloneTeamId::new(*id.as_uuid()),
                    }))
                },
                |row| Ok(StandaloneTeamId::new(row.get(0))),
            )
    }

    /// Deletes a standalone team from the system.
    ///
    /// # Errors
    ///
    /// - [`StandaloneTeamNotFound`] if the team with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StandaloneTeamNotFound`]: PrincipalError::StandaloneTeamNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_standalone_team(
        &mut self,
        id: StandaloneTeamId,
    ) -> Result<(), Report<PrincipalError>> {
        let num_deleted = self
            .as_mut_client()
            .execute(
                "DELETE FROM principal WHERE id = $1 AND principal_type = 'team'",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)
            .attach_printable("Failed to execute delete query")?;

        ensure!(
            num_deleted > 0,
            PrincipalError::StandaloneTeamNotFound { id }
        );

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
    ) -> Result<(UserId, OwnedById), Report<PrincipalError>> {
        let id = id.unwrap_or_else(Uuid::new_v4);
        if let Err(error) = self
            .as_mut_client()
            .execute("INSERT INTO \"user\" (id) VALUES ($1)", &[&id])
            .await
        {
            return if error.code() == Some(&SqlState::UNIQUE_VIOLATION) {
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists { id })
            } else {
                Err(error).change_context(PrincipalError::StoreError)
            };
        }

        Ok((UserId::new(id), OwnedById::new(id)))
    }

    /// Checks if a user with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_user(&self, id: UserId) -> Result<bool, Report<PrincipalError>> {
        let row = self
            .as_client()
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM \"user\" WHERE id = $1)",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(row.get(0))
    }

    /// Gets a user by its ID.
    ///
    /// # Errors
    ///
    /// - [`UserNotFound`] if the user with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`UserNotFound`]: PrincipalError::UserNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_user(&self, id: UserId) -> Result<UserId, Report<PrincipalError>> {
        self.as_client()
            .query_opt("SELECT id FROM \"user\" WHERE id = $1", &[id.as_uuid()])
            .await
            .change_context(PrincipalError::StoreError)?
            .map_or_else(
                || Err(Report::new(PrincipalError::UserNotFound { id })),
                |row| Ok(UserId::new(row.get(0))),
            )
    }

    /// Deletes a user from the system.
    ///
    /// # Errors
    ///
    /// - [`UserNotFound`] if the user with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`UserNotFound`]: PrincipalError::UserNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_user(&mut self, id: UserId) -> Result<(), Report<PrincipalError>> {
        let num_deleted = self
            .as_mut_client()
            .execute(
                "DELETE FROM principal WHERE id = $1 AND principal_type = 'user'",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)
            .attach_printable("Failed to execute delete query")?;

        ensure!(num_deleted > 0, PrincipalError::UserNotFound { id });

        Ok(())
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
                Err(error).change_context(PrincipalError::PrincipalAlreadyExists { id })
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
        let row = self
            .as_client()
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM machine WHERE id = $1)",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(row.get(0))
    }

    /// Deletes a machine from the system.
    ///
    /// # Errors
    ///
    /// - [`MachineNotFound`] if the machine with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`MachineNotFound`]: PrincipalError::MachineNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_machine(&mut self, id: MachineId) -> Result<(), Report<PrincipalError>> {
        let num_deleted = self
            .as_mut_client()
            .execute(
                "DELETE FROM principal WHERE id = $1 AND principal_type = 'machine'",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)
            .attach_printable("Failed to execute delete query")?;

        ensure!(num_deleted > 0, PrincipalError::MachineNotFound { id });

        Ok(())
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
        parent_id: StandaloneTeamId,
    ) -> Result<StandaloneTeamId, Report<PrincipalError>> {
        let id = id.unwrap_or_else(Uuid::new_v4);
        let transaction = self
            .as_mut_client()
            .transaction()
            .await
            .change_context(PrincipalError::StoreError)?;

        // First create the subteam
        transaction
            .execute("INSERT INTO subteam (id) VALUES ($1)", &[&id])
            .await
            .change_context(PrincipalError::StoreError)?;

        // Then set up the parent-child relationship
        transaction
            .execute(
                "INSERT INTO team_hierarchy (parent_id, child_id) VALUES ($1, $2)",
                &[parent_id.as_uuid(), &id],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        transaction
            .commit()
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(StandaloneTeamId::new(id))
    }

    /// Checks if a subteam with the given ID exists.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn is_subteam(&self, id: StandaloneTeamId) -> Result<bool, Report<PrincipalError>> {
        let row = self
            .as_client()
            .query_one(
                "SELECT EXISTS(SELECT 1 FROM subteam WHERE id = $1)",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(row.get(0))
    }

    /// Gets a subteam by its ID.
    ///
    /// # Errors
    ///
    /// - [`SubteamNotFound`] if the subteam with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`SubteamNotFound`]: PrincipalError::SubteamNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_subteam(
        &self,
        id: StandaloneTeamId,
    ) -> Result<StandaloneTeamId, Report<PrincipalError>> {
        let row = self
            .as_client()
            .query_one("SELECT id FROM subteam WHERE id = $1", &[id.as_uuid()])
            .await
            .change_context(PrincipalError::StoreError)?;

        Ok(StandaloneTeamId::new(row.get(0)))
    }

    /// Gets all parents of a subteam.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_subteam_parents(
        &self,
        id: SubteamId,
    ) -> Result<Vec<TeamId>, Report<PrincipalError>> {
        self.as_client()
            .query_raw(
                "
                    SELECT parent_id, team_type::TEXT
                      FROM team_hierarchy
                      JOIN team ON team_hierarchy.parent_id = team.id
                     WHERE child_id = $1
                ",
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
            .try_collect()
            .await
            .change_context(PrincipalError::StoreError)
    }

    /// Gets all subteam children of a team.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn get_team_children(
        &self,
        id: TeamId,
    ) -> Result<Vec<SubteamId>, Report<PrincipalError>> {
        self.as_client()
            .query_raw(
                "
                    SELECT child_id, team_type::TEXT
                      FROM team_hierarchy
                      JOIN team ON team_hierarchy.child_id = team.id
                     WHERE parent_id = $1
                ",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?
            .map_ok(|row| SubteamId::new(row.get(0)))
            .try_collect()
            .await
            .change_context(PrincipalError::StoreError)
    }

    /// Adds a parent to a subteam.
    ///
    /// # Errors
    ///
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn add_subteam_parent(
        &mut self,
        subteam_id: SubteamId,
        parent_id: TeamId,
    ) -> Result<(), Report<PrincipalError>> {
        self.as_mut_client()
            .execute(
                "INSERT INTO team_hierarchy (parent_id, child_id) VALUES ($1, $2)",
                &[parent_id.as_uuid(), &subteam_id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)?;
        Ok(())
    }

    /// Removes a parent from a subteam.
    ///
    /// # Errors
    ///
    /// - [`SubteamNotFound`] if the subteam or parent relationship doesn't exist
    /// - [`SubteamRequiresParent`] if removing this parent would leave the subteam without any
    ///   parents
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`SubteamNotFound`]: PrincipalError::SubteamNotFound
    /// [`SubteamRequiresParent`]: PrincipalError::SubteamRequiresParent
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn remove_subteam_parent(
        &mut self,
        subteam_id: SubteamId,
        parent_id: TeamId,
    ) -> Result<(), Report<PrincipalError>> {
        let transaction = self
            .transaction()
            .await
            .change_context(PrincipalError::StoreError)
            .attach_printable("Failed to start transaction")?;

        let num_deleted = transaction
            .as_client()
            .execute(
                "DELETE FROM team_hierarchy WHERE parent_id = $1 AND child_id = $2",
                &[parent_id.as_uuid(), &subteam_id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)
            .attach_printable("Failed to execute parent removal")?;

        ensure!(
            num_deleted > 0,
            PrincipalError::SubteamNotFound { id: subteam_id }
        );

        let parents = transaction
            .get_subteam_parents(subteam_id)
            .await
            .attach_printable("Failed to get subteam parents")?;

        ensure!(
            !parents.is_empty(),
            PrincipalError::SubteamRequiresParent { id: subteam_id }
        );

        transaction
            .commit()
            .await
            .change_context(PrincipalError::StoreError)
            .attach_printable("Failed to commit transaction")?;

        Ok(())
    }

    /// Deletes a subteam from the system.
    ///
    /// # Errors
    ///
    /// - [`SubteamNotFound`] if the subteam with the given ID doesn't exist
    /// - [`StoreError`] if a database error occurs
    ///
    /// [`SubteamNotFound`]: PrincipalError::SubteamNotFound
    /// [`StoreError`]: PrincipalError::StoreError
    pub async fn delete_subteam(
        &mut self,
        id: StandaloneTeamId,
    ) -> Result<(), Report<PrincipalError>> {
        let num_deleted = self
            .as_mut_client()
            .execute(
                "DELETE FROM principal WHERE id = $1 AND principal_type = 'subteam'",
                &[id.as_uuid()],
            )
            .await
            .change_context(PrincipalError::StoreError)
            .attach_printable("Failed to execute delete query")?;

        ensure!(
            num_deleted > 0,
            PrincipalError::SubteamNotFound {
                id: SubteamId::new(*id.as_uuid())
            }
        );

        Ok(())
    }
}
