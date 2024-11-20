use alloc::collections::BTreeMap;
use core::ops::{Bound, RangeBounds as _};

use error_stack::{Report, ResultExt as _, bail};

use crate::{Migration, MigrationInfo, MigrationList, StateStore, list::MigrationError};

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

pub struct Plan<L, S, C> {
    lower: Bound<u32>,
    upper: Bound<u32>,
    existing_migrations: BTreeMap<u32, MigrationInfo>,
    migration_list: L,
    direction: MigrationDirection,
    state_store: S,
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
            .traverse(
                &Runner {
                    lower: self.lower,
                    upper: self.upper,
                    existing_migrations: self.existing_migrations,
                    direction: self.direction,
                    state_store: self.state_store,
                },
                &mut self.context,
                self.direction,
            )
            .await
    }
}

pub struct Runner<S> {
    lower: Bound<u32>,
    upper: Bound<u32>,
    existing_migrations: BTreeMap<u32, MigrationInfo>,
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
        if !(self.lower, self.upper).contains(&info.number) {
            if let Some(existing_migration) = self.existing_migrations.get(&info.number) {
                if existing_migration != info {
                    tracing::error!(
                        number = info.number,
                        name = %info.name,
                        "Migration file has changed"
                    );
                    bail!(MigrationError::new(info.clone()));
                }
            }
            if self.direction == MigrationDirection::Up {
                tracing::debug!(number = info.number, name = %info.name, "skipping migration");
            }

            return Ok(());
        }

        match self.direction {
            MigrationDirection::Up => migration.up(context).await,
            MigrationDirection::Down => migration.down(context).await,
        }
        .change_context_lazy(|| MigrationError::new(info.clone()))?;

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

pub struct MigrationPlanBuilder<L, S, C> {
    target: Option<u32>,
    migrations: L,
    state_store: S,
    context: C,
}

impl MigrationPlanBuilder<(), (), ()> {
    #[must_use]
    pub const fn new() -> Self {
        Self {
            target: None,
            migrations: (),
            state_store: (),
            context: (),
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
        }
    }
}

impl<L, S> MigrationPlanBuilder<L, S, ()> {
    pub fn context<C>(self, context: C) -> MigrationPlanBuilder<L, S, C>
    where
        L: MigrationList<C>,
    {
        MigrationPlanBuilder {
            target: self.target,
            migrations: self.migrations,
            state_store: self.state_store,
            context,
        }
    }
}

impl<L, S, C> MigrationPlanBuilder<L, S, C> {
    #[must_use]
    pub const fn target(mut self, target: u32) -> Self {
        self.target = Some(target);
        self
    }
}

impl<L, S, C> IntoFuture for MigrationPlanBuilder<L, S, C>
where
    S: StateStore,
    L: MigrationList<C>,
{
    type Output = Result<Plan<L, S, C>, Report<S::Error>>;

    type IntoFuture = impl Future<Output = Self::Output>;

    fn into_future(self) -> Self::IntoFuture {
        async move {
            self.state_store.initialize().await?;
            let existing_migrations = self
                .state_store
                .get_all()
                .await?
                .into_iter()
                .map(|(info, _state)| (info.number, info))
                .collect::<BTreeMap<_, _>>();

            let (lower, upper, direction) = match (
                existing_migrations.last_key_value().map(|(key, _)| *key),
                self.target,
            ) {
                (Some(current), Some(target)) if current < target => (
                    Bound::Excluded(current),
                    Bound::Included(target),
                    MigrationDirection::Up,
                ),
                (Some(current), Some(target)) if current > target => (
                    Bound::Excluded(target),
                    Bound::Included(current),
                    MigrationDirection::Down,
                ),
                (current, target) => (
                    current.map_or(Bound::Unbounded, Bound::Excluded),
                    target.map_or(Bound::Unbounded, Bound::Included),
                    MigrationDirection::Up,
                ),
            };

            Ok(Plan {
                lower,
                upper,
                direction,
                state_store: self.state_store,
                existing_migrations,
                context: self.context,
                migration_list: self.migrations,
            })
        }
    }
}
