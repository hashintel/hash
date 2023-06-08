//! TODO: DOC

use stateful::{
    context::Context,
    state::{StateReadProxy, StateWriteProxy},
};

use crate::{
    task::StateBatchDistribution,
    worker_pool::{SplitConfig, WorkerAllocation, WorkerIndex},
    Error, Result,
};

/// Holds proxies to access the state and information, if the context is readable.
///
/// If the `state` can accessed (i.e. `state` is not `SharedState::None`), it holds read-only,
/// read-write, partially borrowed proxies to agents and messages.
#[derive(Default, Debug)]
pub struct TaskSharedStore {
    pub state: SharedState,
    context: SharedContext,
}

impl TaskSharedStore {
    pub fn new(state: SharedState, context: SharedContext) -> Self {
        Self { state, context }
    }

    pub fn context(&self) -> &SharedContext {
        &self.context
    }

    /// Obtains the write proxies and group indices from [`TaskSharedStore`], returning an error if
    /// this fails.
    ///
    /// Note: we have a specific enum (rather than putting this into a big ball-of-mud enum, because
    /// we can handle the error if it fails).
    pub fn get_write_proxies(
        self: &mut TaskSharedStore,
    ) -> Result<(&mut StateWriteProxy, Vec<usize>), GetWriteProxiesError> {
        let (proxy, group_indices) = match &mut self.state {
            SharedState::None | SharedState::Read(_) => {
                return Err(GetWriteProxiesError::StateNotWritable);
            }
            SharedState::Write(state) => {
                let indices = (0..state.agent_pool().len()).collect();
                (state, indices)
            }
            SharedState::Partial(partial) => match partial {
                PartialSharedState::Read(_) => {
                    return Err(GetWriteProxiesError::StateNotWritable);
                }
                PartialSharedState::Write(state) => {
                    let indices = state.group_indices.clone();
                    (&mut state.state_proxy, indices)
                }
            },
        };
        Ok((proxy, group_indices))
    }
}

/// An error encountered when calling [`TaskSharedStore::get_write_proxies`].
pub enum GetWriteProxiesError {
    StateNotWritable,
}

impl From<GetWriteProxiesError> for crate::runner::JavaScriptError {
    fn from(_: GetWriteProxiesError) -> crate::runner::JavaScriptError {
        crate::runner::JavaScriptError::from("cannot obtain the state as writable")
    }
}

/// Partial write access to the agent pool and message pool.
///
/// This only holds a subset of the agent and message batches specified by `group_indices`. Used in
/// [`PartialSharedState`] to have read and write access to different batches.
#[derive(Debug)]
pub struct PartialStateWriteProxy {
    pub group_indices: Vec<usize>,
    pub state_proxy: StateWriteProxy,
}

/// Partial read access to the agent pool and message pool.
///
/// This only holds a subset of the agent and message batches specified by `group_indices`. Used in
/// [`PartialSharedState`] to have read and write access to different batches.
#[derive(Debug, Clone)]
pub struct PartialStateReadProxy {
    pub group_indices: Vec<usize>,
    pub state_proxy: StateReadProxy,
}

/// Fine-grained access to the agent pool and message pool.
///
/// Can either hold proxies for all batches (read or write) or partially borrow a subset of batches.
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
    fn default() -> Self {
        Self::None
    }
}

impl Default for SharedContext {
    fn default() -> Self {
        Self::None
    }
}

impl SharedState {
    /// Returns if the shared state is neither readable nor writable.
    pub fn is_disabled(&self) -> bool {
        matches!(self, SharedState::None)
    }

    /// Returns if the shared state is readable (fully or partially) but not writable.
    pub fn is_readonly(&self) -> bool {
        matches!(self, SharedState::Read(_))
            || matches!(self, SharedState::Partial(PartialSharedState::Read(_)))
    }

    /// Returns if the shared state is readable and writable (fully or partially).
    pub fn is_readwrite(&self) -> bool {
        matches!(self, SharedState::Write(_))
            || matches!(self, SharedState::Partial(PartialSharedState::Write(_)))
    }
}

impl SharedContext {
    /// Returns if the shared context is neither readable nor writable.
    pub fn is_disabled(&self) -> bool {
        matches!(self, SharedContext::None)
    }

    /// Returns if the shared context is readable but not writable.
    pub fn is_readonly(&self) -> bool {
        matches!(self, SharedContext::Read)
    }
}

#[derive(Default)]
pub struct TaskSharedStoreBuilder {
    inner: TaskSharedStore,
}

impl TaskSharedStoreBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn build(self) -> TaskSharedStore {
        self.inner
    }

    /// Allow the task runners to have write access to all of agent state
    pub fn write_state(mut self, state_proxy: StateWriteProxy) -> Result<Self> {
        self.inner.state = SharedState::Write(state_proxy);
        Ok(self)
    }

    /// Allow the task runners to have read access to the context object
    pub fn read_context(mut self, _context: &Context) -> Result<Self> {
        self.inner.context = SharedContext::Read;
        Ok(self)
    }
}

/// Partial read or write access to the agent pool and message pool.
///
/// This enables both read and write access to different non-overlapping subsets of the state.
#[derive(Debug)]
pub enum PartialSharedState {
    Write(PartialStateWriteProxy),
    Read(PartialStateReadProxy),
}

impl PartialSharedState {
    /// Partitions this `PartialSharedState` into many `PartialSharedState`s, one for each group
    /// index.
    pub fn split_into_individual_per_group(self) -> Vec<Self> {
        match self {
            Self::Read(partial_read_proxy) => {
                let (agent_proxies, message_proxies) = partial_read_proxy.state_proxy.deconstruct();
                partial_read_proxy
                    .group_indices
                    .into_iter()
                    .zip(agent_proxies.into_iter())
                    .zip(message_proxies.into_iter())
                    .map(|((group_index, agent_batch_proxy), message_batch_proxy)| {
                        Self::Read(PartialStateReadProxy {
                            group_indices: vec![group_index],
                            state_proxy: StateReadProxy::from((vec![agent_batch_proxy], vec![
                                message_batch_proxy,
                            ])),
                        })
                    })
                    .collect()
            }
            Self::Write(partial_write_proxy) => {
                let (agent_proxies, message_proxies) =
                    partial_write_proxy.state_proxy.deconstruct();
                partial_write_proxy
                    .group_indices
                    .into_iter()
                    .zip(agent_proxies.into_iter())
                    .zip(message_proxies.into_iter())
                    .map(|((group_index, agent_batch_proxy), message_batch_proxy)| {
                        Self::Write(PartialStateWriteProxy {
                            group_indices: vec![group_index],
                            state_proxy: StateWriteProxy::from((vec![agent_batch_proxy], vec![
                                message_batch_proxy,
                            ])),
                        })
                    })
                    .collect()
            }
        }
    }

    pub fn indices(&self) -> &[usize] {
        match self {
            PartialSharedState::Write(proxy) => &proxy.group_indices,
            PartialSharedState::Read(proxy) => &proxy.group_indices,
        }
    }
}

pub struct DistributedBatch<A, M> {
    worker_index: WorkerIndex,
    agent_batches: Vec<A>,
    message_batches: Vec<M>,
    group_indices: Vec<usize>,
}

/// TODO: DOC
fn distribute_batches<A, M>(
    worker_list: &WorkerAllocation,
    agent_batches: Vec<A>,
    msg_batches: Vec<M>,
    group_indices: Vec<usize>,
    group_sizes: Vec<usize>, // Number of agents in each group
) -> (Vec<DistributedBatch<A, M>>, SplitConfig) {
    // Initialize with empty distribution.
    let num_workers = worker_list.len();
    let mut agent_distribution = Vec::with_capacity(num_workers);
    let mut stores = Vec::with_capacity(num_workers);
    worker_list.iter().for_each(|worker| {
        agent_distribution.push(0);
        stores.push(DistributedBatch {
            worker_index: *worker,
            agent_batches: vec![],
            message_batches: vec![],
            group_indices: vec![],
        });
    });

    // Distribute batches.
    let iter = agent_batches
        .into_iter()
        .zip(msg_batches.into_iter())
        .enumerate();
    for (i_group, (agent_batch, msg_batch)) in iter {
        let i_worker = i_group % num_workers;
        agent_distribution[i_worker] += group_sizes[i_group];

        let store = &mut stores[i_worker];
        store.agent_batches.push(agent_batch);
        store.message_batches.push(msg_batch);
        store.group_indices.push(group_indices[i_group]);
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
    fn n_accessible_agents(&self) -> usize {
        match &self.state {
            SharedState::None => 0,
            SharedState::Write(state) => state.n_accessible_agents(),
            SharedState::Read(state) => state.n_accessible_agents(),
            SharedState::Partial(partial) => match partial {
                PartialSharedState::Read(partial) => partial.state_proxy.n_accessible_agents(),
                PartialSharedState::Write(partial) => partial.state_proxy.n_accessible_agents(),
            },
        }
    }

    /// TODO: DOC
    pub fn distribute(
        self,
        distribution: &StateBatchDistribution,
        worker_list: &WorkerAllocation,
    ) -> Result<(Vec<(WorkerIndex, Self)>, SplitConfig)> {
        let reads_state = self.state.is_readonly();
        let writes_state = self.state.is_readwrite();
        let context = self.context.clone();

        // TODO: Code duplication between read and write
        let split = if writes_state {
            // We take write access to state, but need to distribute
            // each batch to a single worker.
            // Note: This doesn't mean that each worker gets a single batch.
            //       A worker can also get multiple batches or zero batches.
            let ((agent_batches, msg_batches), group_indices) = match self.state {
                SharedState::Write(state) => {
                    let group_indices = (0..state.agent_pool().len()).collect();
                    (state.deconstruct(), group_indices)
                }
                SharedState::Partial(PartialSharedState::Write(partial)) => {
                    let (state, group_indices) = (partial.state_proxy, partial.group_indices);
                    (state.deconstruct(), group_indices)
                }
                _ => unreachable!(),
            };
            let group_sizes = agent_batches
                .iter()
                .map(|proxy| proxy.num_agents())
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
                .map(|batch_distribution| {
                    let store = Self {
                        state: SharedState::Partial(PartialSharedState::Write(
                            PartialStateWriteProxy {
                                group_indices: batch_distribution.group_indices,
                                state_proxy: StateWriteProxy::from((
                                    batch_distribution.agent_batches,
                                    batch_distribution.message_batches,
                                )),
                            },
                        )),
                        context: context.clone(),
                    };
                    (batch_distribution.worker_index, store)
                })
                .collect();
            (stores, split_config)
        } else if reads_state && distribution.partitioned_batches {
            // We take read access to state so we need to distribute
            // each batch to a single worker.
            // Note: This doesn't mean that each worker gets a single batch.
            //       A worker can also get multiple batches or zero batches.
            let ((agent_batches, msg_batches), group_indices) = match self.state {
                SharedState::Read(state) => {
                    let group_indices = (0..state.agent_pool().len()).collect();
                    (state.deconstruct(), group_indices)
                }
                SharedState::Partial(PartialSharedState::Read(partial)) => {
                    let (state, group_indices) = (partial.state_proxy, partial.group_indices);
                    (state.deconstruct(), group_indices)
                }
                _ => unreachable!(),
            };
            let group_sizes = agent_batches
                .iter()
                .map(|batch| batch.num_agents())
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
                .map(|batch_distribution| {
                    let store = Self {
                        state: SharedState::Partial(PartialSharedState::Read(
                            PartialStateReadProxy {
                                group_indices: batch_distribution.group_indices,
                                state_proxy: StateReadProxy::from((
                                    batch_distribution.agent_batches,
                                    batch_distribution.message_batches,
                                )),
                            },
                        )),
                        context: context.clone(),
                    };
                    (batch_distribution.worker_index, store)
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
