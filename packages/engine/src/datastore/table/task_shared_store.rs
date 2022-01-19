//! TODO: DOC
use std::fmt::Debug;

use super::{
    context::ReadContext,
    proxy::{StateReadProxy, StateWriteProxy},
    state::{ReadState, WriteState},
};
use crate::{
    config::{Distribution, Worker, WorkerAllocation},
    datastore::{prelude::Result, Error},
    simulation::task::handler::worker_pool::SplitConfig,
};

/// TODO: DOC, purpose and fields
#[derive(Default, Debug)]
pub struct TaskSharedStore {
    pub state: SharedState,
    context: SharedContext,
}

impl TaskSharedStore {
    #[tracing::instrument(skip_all)]
    pub fn context(&self) -> &SharedContext {
        &self.context
    }
}

/// TODO: DOC
#[derive(Debug)]
pub struct PartialStateWriteProxy {
    pub indices: Vec<usize>,
    pub inner: StateWriteProxy,
}

/// TODO: DOC
#[derive(Debug, Clone)]
pub struct PartialStateReadProxy {
    pub indices: Vec<usize>,
    pub inner: StateReadProxy,
}

/// TODO: DOC
#[derive(Debug)]
pub enum SharedState {
    Partial(PartialSharedState),
    Write(StateWriteProxy),
    Read(StateReadProxy),
    None,
}

#[derive(Debug, Clone)]
pub enum SharedContext {
    Read,
    None,
}

impl Default for SharedState {
    #[tracing::instrument(skip_all)]
    fn default() -> Self {
        Self::None
    }
}

impl Default for SharedContext {
    #[tracing::instrument(skip_all)]
    fn default() -> Self {
        Self::None
    }
}

#[derive(Default)]
pub struct TaskSharedStoreBuilder {
    inner: TaskSharedStore,
}

impl TaskSharedStoreBuilder {
    #[tracing::instrument(skip_all)]
    pub fn new() -> Self {
        Self::default()
    }

    #[tracing::instrument(skip_all)]
    pub fn build(self) -> TaskSharedStore {
        self.inner
    }

    #[tracing::instrument(skip_all)]
    pub fn partial_write_state<K: WriteState>(
        mut self,
        state: &K,
        batch_indices: Vec<usize>,
    ) -> Result<Self> {
        self.inner.state =
            SharedState::Partial(PartialSharedState::new_write(state, batch_indices)?);

        Ok(self)
    }

    #[tracing::instrument(skip_all)]
    pub fn partial_read_state<K: ReadState>(
        mut self,
        state: &K,
        batch_indices: Vec<usize>,
    ) -> Result<Self> {
        self.inner.state =
            SharedState::Partial(PartialSharedState::new_read(state, batch_indices)?);
        Ok(self)
    }

    /// Allow the task runners to have write access to all of agent state
    pub fn write_state<K: WriteState>(mut self, state: &mut K) -> Result<Self> {
        self.inner.state = SharedState::Write(StateWriteProxy::new(state)?);
        Ok(self)
    }

    /// Allow the task runners to have read access to all of agent state
    pub fn read_state<K: ReadState>(mut self, state: &K) -> Result<Self> {
        self.inner.state = SharedState::Read(StateReadProxy::new(state)?);
        Ok(self)
    }

    /// Allow the task runners to have read access to the context object
    pub fn read_context<K: ReadContext>(mut self, _context: &K) -> Result<Self> {
        self.inner.context = SharedContext::Read;
        Ok(self)
    }
}

/// TODO: DOC (expand and reformat below)
// Represents partial access to the State portion
// of the data store. Can have both write
// and read access to different (non-overlapping)
// subsets of the state pool
#[derive(Debug)]
pub enum PartialSharedState {
    Write(PartialStateWriteProxy),
    Read(PartialStateReadProxy),
}

impl PartialSharedState {
    #[tracing::instrument(skip_all)]
    fn new_write<K: WriteState>(state: &K, indices: Vec<usize>) -> Result<PartialSharedState> {
        let inner = StateWriteProxy::new_partial(state, &indices)?;
        Ok(PartialSharedState::Write(PartialStateWriteProxy {
            indices,
            inner,
        }))
    }

    #[tracing::instrument(skip_all)]
    fn new_read<K: ReadState>(state: &K, indices: Vec<usize>) -> Result<PartialSharedState> {
        let inner = StateReadProxy::new_partial(state, &indices)?;
        Ok(PartialSharedState::Read(PartialStateReadProxy {
            indices,
            inner,
        }))
    }
}

/// TODO: DOC

#[tracing::instrument(skip_all)]
fn distribute_batches<A, M>(
    worker_list: &WorkerAllocation,
    agent_batches: Vec<A>,
    msg_batches: Vec<M>,
    group_indices: Vec<usize>,
    group_sizes: Vec<usize>, // Number of agents in each group
) -> (Vec<(Worker, Vec<A>, Vec<M>, Vec<usize>)>, SplitConfig) {
    // Initialize with empty distribution.
    let num_workers = worker_list.len();
    let mut agent_distribution = Vec::with_capacity(num_workers);
    let mut stores = Vec::with_capacity(num_workers);
    worker_list.iter().for_each(|worker| {
        agent_distribution.push(0);
        stores.push((*worker, vec![], vec![], vec![]));
    });

    // Distribute batches.
    let iter = agent_batches
        .into_iter()
        .zip(msg_batches.into_iter())
        .enumerate();
    for (i_group, (agent_batch, msg_batch)) in iter {
        let i_worker = i_group % num_workers;
        agent_distribution[i_group] += group_sizes[i_worker];

        let store = &mut stores[i_worker];
        store.1.push(agent_batch);
        store.2.push(msg_batch);
        store.3.push(group_indices[i_group]);
    }

    // Wrap into correct format.
    let split_config = SplitConfig {
        num_workers,
        agent_distribution: Some(agent_distribution),
    };
    (stores, split_config)
}

impl TaskSharedStore {
    /// Number of agents in the sim that can be accessed through this store

    #[tracing::instrument(skip_all)]
    fn n_accessible_agents(&self) -> usize {
        match &self.state {
            SharedState::None => 0,
            SharedState::Write(state) => state.n_accessible_agents(),
            SharedState::Read(state) => state.n_accessible_agents(),
            SharedState::Partial(partial) => match partial {
                PartialSharedState::Read(partial) => partial.inner.n_accessible_agents(),
                PartialSharedState::Write(partial) => partial.inner.n_accessible_agents(),
            },
        }
    }

    #[tracing::instrument(skip_all)]
    fn reads_state(&self) -> bool {
        matches!(&self.state, SharedState::Read(_))
            || matches!(
                &self.state,
                SharedState::Partial(PartialSharedState::Read(_))
            )
    }

    #[tracing::instrument(skip_all)]
    fn writes_state(&self) -> bool {
        matches!(&self.state, SharedState::Write(_))
            || matches!(
                &self.state,
                SharedState::Partial(PartialSharedState::Write(_))
            )
    }

    /// TODO: DOC
    pub fn distribute(
        self,
        distribution: &Distribution,
        worker_list: &WorkerAllocation,
    ) -> Result<(Vec<(Worker, Self)>, SplitConfig)> {
        let reads_state = self.reads_state();
        let writes_state = self.writes_state();
        let context = self.context.clone();

        // TODO: Code duplication between read and write
        let split = if writes_state {
            // We take write access to state, but need to distribute
            // each batch to a single worker.
            // Note: This doesn't mean that each worker gets a single batch.
            //       A worker can also get multiple batches or zero batches.
            let ((agent_batches, msg_batches), group_indices) = match self.state {
                SharedState::Write(state) => {
                    let indices = (0..state.agent_pool().n_batches()).collect();
                    (state.deconstruct(), indices)
                }
                SharedState::Partial(PartialSharedState::Write(partial)) => {
                    let (state, indices) = (partial.inner, partial.indices);
                    (state.deconstruct(), indices)
                }
                _ => unreachable!(),
            };
            let group_sizes = agent_batches
                .iter()
                .map(|batch| batch.inner().num_agents())
                .collect();
            let (stores, split_config) = distribute_batches(
                worker_list,
                agent_batches,
                msg_batches,
                group_indices,
                group_sizes,
            );
            let stores: Vec<_> = stores
                .into_iter()
                .map(|(worker, agent_batches, msg_batches, indices)| {
                    let store = Self {
                        state: SharedState::Partial(PartialSharedState::Write(
                            PartialStateWriteProxy {
                                indices,
                                inner: StateWriteProxy::from((agent_batches, msg_batches)),
                            },
                        )),
                        context: context.clone(),
                    };
                    (worker, store)
                })
                .collect();
            (stores, split_config)
        } else if reads_state && distribution.single_read_access {
            // We take read access to state so we need to distribute
            // each batch to a single worker.
            // Note: This doesn't mean that each worker gets a single batch.
            //       A worker can also get multiple batches or zero batches.
            let ((agent_batches, msg_batches), group_indices) = match self.state {
                SharedState::Read(state) => {
                    let indices = (0..state.agent_pool().n_batches()).collect();
                    (state.deconstruct(), indices)
                }
                SharedState::Partial(PartialSharedState::Read(partial)) => {
                    let (state, indices) = (partial.inner, partial.indices);
                    (state.deconstruct(), indices)
                }
                _ => unreachable!(),
            };
            let group_sizes = agent_batches
                .iter()
                .map(|batch| batch.inner().num_agents())
                .collect();
            let (stores, split_config) = distribute_batches(
                worker_list,
                agent_batches,
                msg_batches,
                group_indices,
                group_sizes,
            );
            let stores: Vec<_> = stores
                .into_iter()
                .map(|(worker, agent_batches, msg_batches, indices)| {
                    let store = Self {
                        state: SharedState::Partial(PartialSharedState::Read(
                            PartialStateReadProxy {
                                indices,
                                inner: StateReadProxy::from((agent_batches, msg_batches)),
                            },
                        )),
                        context: context.clone(),
                    };
                    (worker, store)
                })
                .collect();
            (stores, split_config)
        } else {
            // No access to state or duplicate read access to state, trivial split:
            // Give every worker the same access.
            let stores = worker_list
                .iter()
                .map(|worker| Ok((*worker, self.try_clone()?)))
                .collect::<Result<_>>()?;

            let num_workers = worker_list.len();
            let agent_distribution = std::iter::repeat(self.n_accessible_agents())
                .take(num_workers)
                .collect();
            let split_config = SplitConfig {
                num_workers,
                agent_distribution: Some(agent_distribution),
            };

            (stores, split_config)
        };
        Ok(split)
    }
}

impl TaskSharedStore {
    /// Fallible clone. Fails with write access to state.

    #[tracing::instrument(skip_all)]
    fn try_clone(&self) -> Result<Self> {
        let state = match &self.state {
            SharedState::Write(_) => {
                return Err(Error::MultipleWriteSharedState);
            }
            SharedState::Partial(partial) => match partial {
                PartialSharedState::Write(_) => {
                    return Err(Error::MultipleWriteSharedState);
                }
                PartialSharedState::Read(partial) => {
                    SharedState::Partial(PartialSharedState::Read(partial.clone()))
                }
            },
            SharedState::Read(state) => SharedState::Read(state.clone()),
            SharedState::None => SharedState::None,
        };
        Ok(Self {
            state,
            context: self.context.clone(),
        })
    }
}
