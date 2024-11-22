use alloc::collections::BTreeMap;
use core::ops::{Bound, RangeBounds as _};
use std::collections::HashSet;

use error_stack::{Report, ResultExt as _, bail, ensure};

use crate::{
    Migration, MigrationInfo, MigrationList, StateStore,
    context::{Context as _, Transaction as _},
    list::MigrationError,
};

pub trait MigrationRunner {
    async fn run_migration<M>(
        &self,
        migration: M,
        info: &MigrationInfo,
        context: &mut M::Context,
    ) -> Result<(), Report<MigrationError>>
    where
        M: Migration;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum MigrationDirection {
    Up,
    Down,
}

pub struct Runner<S> {
    migrations_to_apply: (Bound<u32>, Bound<u32>),
    infos_to_update: HashSet<u32>,
    direction: MigrationDirection,
    state_store: S,
}

impl<S> MigrationRunner for Runner<S>
where
    S: StateStore,
{
    async fn run_migration<M>(
        &self,
        migration: M,
        info: &MigrationInfo,
        context: &mut M::Context,
    ) -> Result<(), Report<MigrationError>>
    where
        M: Migration,
    {
        if !self.migrations_to_apply.contains(&info.number) {
            if self.infos_to_update.contains(&info.number) {
                self.state_store
                    .update(info.clone())
                    .await
                    .change_context_lazy(|| MigrationError::new(info.clone()))?;

                tracing::info!(number = info.number, name = %info.name, "updated migration info");
            } else {
                tracing::debug!(number = info.number, name = %info.name, "skipping migration");
            }

            return Ok(());
        }

        let mut transaction = context
            .transaction()
            .await
            .change_context_lazy(|| MigrationError::new(info.clone()))?;

        let migration_result = match self.direction {
            MigrationDirection::Up => migration.up(&mut transaction).await,
            MigrationDirection::Down => migration.down(&mut transaction).await,
        }
        .change_context_lazy(|| MigrationError::new(info.clone()));
        match migration_result {
            Ok(()) => {
                transaction
                    .commit()
                    .await
                    .change_context_lazy(|| MigrationError::new(info.clone()))?;
            }
            Err(error) => {
                transaction
                    .commit()
                    .await
                    .change_context_lazy(|| MigrationError::new(info.clone()))?;
                bail!(error);
            }
        };

        match self.direction {
            MigrationDirection::Up => {
                self.state_store
                    .add(info.clone())
                    .await
                    .change_context_lazy(|| MigrationError::new(info.clone()))?;
                tracing::info!(number = info.number, name = %info.name, "applied migration");
            }
            MigrationDirection::Down => {
                self.state_store
                    .remove(info.number)
                    .await
                    .change_context_lazy(|| MigrationError::new(info.clone()))?;
                tracing::info!(number = info.number, name = %info.name, "reverted migration");
            }
        }

        Ok(())
    }
}

pub struct Plan<L, S, C> {
    runner: Runner<S>,
    infos_to_remove: BTreeMap<u32, MigrationInfo>,
    migration_list: L,
    context: C,
}

impl<L, S, C> Plan<L, S, C> {
    /// Executes the plan.
    ///
    /// This will run the migrations in the list in the direction specified by the plan. Depending
    /// on the direction, the migrations will be run in ascending or descending order.
    ///
    /// # Errors
    ///
    /// - If a migration fails to run
    /// - If the state store fails to update
    pub async fn execute(mut self) -> Result<(), Report<MigrationError>>
    where
        L: MigrationList<C>,
        S: StateStore,
    {
        self.migration_list
            .traverse(&self.runner, &mut self.context, self.runner.direction)
            .await?;

        for info in self.infos_to_remove.values() {
            self.runner
                .state_store
                .remove(info.number)
                .await
                .change_context_lazy(|| MigrationError::new(info.clone()))?;
            tracing::info!(number = info.number, name = %info.name, "removed migration info");
        }
        Ok(())
    }
}

#[expect(
    clippy::struct_excessive_bools,
    reason = "This struct using a builder pattern for this reason"
)]
pub struct MigrationPlanBuilder<L, S, C> {
    target: Option<u32>,
    migrations: L,
    state_store: S,
    context: C,
    allow_divergent: bool,
    update_divergent: bool,
    allow_missing: bool,
    remove_missing: bool,
}

impl MigrationPlanBuilder<(), (), ()> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            target: None,
            migrations: (),
            state_store: (),
            context: (),
            allow_divergent: false,
            update_divergent: false,
            allow_missing: false,
            remove_missing: false,
        }
    }
}

impl Default for MigrationPlanBuilder<(), (), ()> {
    fn default() -> Self {
        Self::new()
    }
}

impl<S, C> MigrationPlanBuilder<(), S, C> {
    pub fn migrations<L>(self, migrations: L) -> MigrationPlanBuilder<L, S, C>
    where
        L: MigrationList<C>,
    {
        MigrationPlanBuilder {
            target: self.target,
            migrations,
            state_store: self.state_store,
            context: self.context,
            allow_divergent: self.allow_divergent,
            update_divergent: self.update_divergent,
            allow_missing: self.allow_missing,
            remove_missing: self.remove_missing,
        }
    }
}

impl<L, C> MigrationPlanBuilder<L, (), C> {
    pub fn state<S>(self, state: S) -> MigrationPlanBuilder<L, S, C>
    where
        S: StateStore,
    {
        MigrationPlanBuilder {
            target: self.target,
            migrations: self.migrations,
            state_store: state,
            context: self.context,
            allow_divergent: self.allow_divergent,
            update_divergent: self.update_divergent,
            allow_missing: self.allow_missing,
            remove_missing: self.remove_missing,
        }
    }
}

impl<L, S> MigrationPlanBuilder<L, S, ()> {
    pub fn context<C>(self, context: C) -> MigrationPlanBuilder<L, S, C> {
        MigrationPlanBuilder {
            target: self.target,
            migrations: self.migrations,
            state_store: self.state_store,
            context,
            allow_divergent: self.allow_divergent,
            update_divergent: self.update_divergent,
            allow_missing: self.allow_missing,
            remove_missing: self.remove_missing,
        }
    }
}

impl<L, S, C> MigrationPlanBuilder<L, S, C> {
    #[must_use]
    pub const fn target(mut self, target: u32) -> Self {
        self.target = Some(target);
        self
    }

    #[must_use]
    pub const fn allow_divergent(mut self, allow: bool) -> Self {
        self.allow_divergent = allow;
        self
    }

    #[must_use]
    pub const fn update_divergent(mut self, update: bool) -> Self {
        self.update_divergent = update;
        self
    }

    #[must_use]
    pub const fn allow_missing(mut self, allow: bool) -> Self {
        self.allow_missing = allow;
        self
    }

    #[must_use]
    pub const fn remove_missing(mut self, remove: bool) -> Self {
        self.remove_missing = remove;
        self
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum MigrationPlanError {
    #[display("the state store encountered an error")]
    StateError,
    #[display("the migration file `{}` ({}) has changed", _0.number, _0.name)]
    ChangedMigration(#[error(ignore)] MigrationInfo),
    #[display("the migration file `{}` ({}) is missing", _0.number, _0.name)]
    MissingMigration(#[error(ignore)] MigrationInfo),
    #[display("the specified target migration `{}` does not exist", _0)]
    UnknownTarget(#[error(ignore)] u32),
}

impl<L, S, C> IntoFuture for MigrationPlanBuilder<L, S, C>
where
    S: StateStore,
    L: MigrationList<C>,
{
    type Output = Result<Plan<L, S, C>, Report<MigrationPlanError>>;

    type IntoFuture = impl Future<Output = Self::Output>;

    fn into_future(self) -> Self::IntoFuture {
        async move {
            self.state_store
                .initialize()
                .await
                .change_context(MigrationPlanError::StateError)?;

            let migration_infos = self
                .migrations
                .infos()
                .map(|info| (info.number, info))
                .collect::<BTreeMap<_, _>>();

            if let Some(target) = self.target {
                ensure!(
                    target == 0 || migration_infos.contains_key(&target),
                    MigrationPlanError::UnknownTarget(target)
                );
            }

            let mut infos_to_update = HashSet::new();
            let mut infos_to_remove = BTreeMap::new();
            let existing_migrations = self
                .state_store
                .get_all()
                .await
                .change_context(MigrationPlanError::StateError)?
                .into_iter()
                .map(|(info, _state)| {
                    if let Some(expected_migration) = migration_infos.get(&info.number) {
                        if *expected_migration != &info {
                            if self.allow_divergent {
                                if self.update_divergent {
                                    infos_to_update.insert(info.number);
                                }
                            } else {
                                bail!(MigrationPlanError::ChangedMigration(info));
                            }
                        };
                    } else if self.allow_missing {
                        if self.remove_missing {
                            infos_to_remove.insert(info.number, info.clone());
                        }
                    } else {
                        bail!(MigrationPlanError::MissingMigration(info));
                    }

                    Ok((info.number, info))
                })
                .collect::<Result<BTreeMap<_, _>, _>>()?;

            let (migrations_to_apply, direction) = match (
                existing_migrations.last_key_value().map(|(key, _)| *key),
                self.target,
            ) {
                (Some(current), Some(target)) if current > target => (
                    (Bound::Excluded(target), Bound::Included(current)),
                    MigrationDirection::Down,
                ),
                (current, target) => (
                    (
                        current.map_or(Bound::Unbounded, Bound::Excluded),
                        target.map_or(Bound::Unbounded, Bound::Included),
                    ),
                    MigrationDirection::Up,
                ),
            };

            Ok(Plan {
                runner: Runner {
                    migrations_to_apply,
                    infos_to_update,
                    direction,
                    state_store: self.state_store,
                },
                infos_to_remove,
                context: self.context,
                migration_list: self.migrations,
            })
        }
    }
}
