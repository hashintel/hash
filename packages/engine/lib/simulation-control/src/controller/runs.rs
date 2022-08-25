use execution::package::simulation::SimulationId;
use futures::stream::{FuturesOrdered, StreamExt};
use tokio::task::JoinHandle;

use crate::controller::Result;

#[derive(Default)]
pub struct SimulationRuns {
    inner: FuturesOrdered<JoinHandle<Result<SimulationId>>>,
}

impl SimulationRuns {
    pub fn new_run(&mut self, handle: JoinHandle<Result<SimulationId>>) {
        self.inner.push_back(handle);
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    pub async fn next(&mut self) -> Result<Option<Result<SimulationId>>>
    where
        Self: Unpin,
    {
        Ok(self.inner.next().await.transpose()?)
    }
}
