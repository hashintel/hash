use crate::{
    config::{Distribution, Worker, WorkerAllocation},
    datastore::prelude::Result,
    simulation::task::handler::worker_pool::SplitConfig,
    worker::runner::comms::StateInterimSync,
};

use super::{
    context::ReadContext,
    proxy::{StateReadProxy, StateWriteProxy},
    state::{ReadState, WriteState},
};

#[derive(Debug, Default)]
pub struct TaskSharedStore {
    state: SharedState,
    context: SharedContext,
}

impl TaskSharedStore {
    pub fn state(&self) -> &SharedState {
        &self.state
    }

    pub fn context(&self) -> &SharedContext {
        &self.context
    }

    /// Update the metaversions of all the write
    /// batches in this shared store instance.
    pub fn update_metaversioning(&mut self, sync: &StateInterimSync) -> Result<()> {
        todo!()
    }
}

#[derive(Default)]
pub struct PartialStateWriteProxy {
    indices: Vec<usize>,
    inner: StateWriteProxy,
}

#[derive(Default)]
pub struct PartialStateReadProxy {
    indices: Vec<usize>,
    inner: StateReadProxy,
}

pub enum SharedState {
    Partial(PartialSharedState),
    Write(StateWriteProxy),
    Read(StateReadProxy),
    None,
}

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

#[derive(Debug, Default)]
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

    pub fn partial_write_state<K: WriteState>(
        mut self,
        state: &K,
        batch_indices: Vec<usize>,
    ) -> Result<Self> {
        self.inner.state =
            SharedState::Partial(PartialSharedState::new_write(state, batch_indices)?);

        Ok(self)
    }

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
    pub fn write_state<K: WriteState>(mut self, state: &K) -> Result<Self> {
        self.inner.state = SharedState::Write(StateWriteProxy::new(state)?);
        Ok(self)
    }

    /// Allow the task runners to have read access to all of agent state
    pub fn read_state<K: ReadState>(mut self, state: &K) -> Result<Self> {
        self.inner.state = SharedState::Read(StateReadProxy::new(state)?);
        Ok(self)
    }

    /// Allow the task runners to have read access to the context object
    pub fn read_context<K: ReadContext>(mut self, context: &K) -> Result<Self> {
        self.inner.context = SharedContext::Read;
        Ok(self)
    }
}

// Represents partial access to the State portion
// of the data store. Can have both write
// and read access to different (non-overlapping)
// subsets of the state pool
pub enum PartialSharedState {
    Write(PartialStateWriteProxy),
    Read(PartialStateReadProxy),
}

impl PartialSharedState {
    fn new_write<K: WriteState>(state: &K, indices: Vec<usize>) -> Result<PartialSharedState> {
        let inner = StateWriteProxy::new_partial(state, &indices)?;
        Ok(PartialSharedState::Write(PartialStateWriteProxy {
            indices,
            inner,
        }))
    }

    fn new_read<K: ReadState>(state: &K, indices: Vec<usize>) -> Result<PartialSharedState> {
        let inner = StateReadProxy::new_partial(state, &indices)?;
        Ok(PartialSharedState::Read(PartialStateReadProxy {
            indices,
            inner,
        }))
    }
}

impl TaskSharedStore {
    fn reads_state(&self) -> bool {
        matches!(&self.state, SharedState::Read(_))
            || matches!(
                &self.state,
                SharedState::Partial(PartialSharedState::Read(_))
            )
    }

    fn writes_state(&self) -> bool {
        matches!(&self.state, SharedState::Write(_))
            || matches!(
                &self.state,
                SharedState::Partial(PartialSharedState::Write(_))
            )
    }

    // TODO OS [14] - RUNTIME BLOCK - multiple branches are unimplemented
    pub fn distribute(
        self,
        distribution: &Distribution,
        worker_list: &WorkerAllocation,
    ) -> Result<(Vec<(Worker, Self)>, SplitConfig)> {
        let reads_state = self.reads_state();
        let writes_state = self.writes_state();

        if reads_state && distribution.single_read_access {
            // We take read access to state, but need to distribute
            // each batch to a single worker
            // TODO
            todo!()
        } else if writes_state {
            // We take write access to state so we need to distribute
            // each batch to a single worker
            // TODO
            todo!()
        } else {
            // No access to state or duplicate read access to state, trivial split:
            // Give every worker the same access
            return worker_list
                .iter()
                .map(|worker| Ok((worker.clone(), self.try_clone()?)))
                .collect::<Result<_>>(); // TODO split config
        }
    }
}

impl TaskSharedStore {
    /// Fallible clone. Fails with write access to state.
    fn try_clone(&self) -> Result<Self> {
        // TODO OS [15] - RUNTIME BLOCK - try_clone is unimplemented
        todo!()
    }
}
