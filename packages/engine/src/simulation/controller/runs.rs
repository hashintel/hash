use futures::stream::{FuturesOrdered, StreamExt};
use simulation_structure::SimulationShortId;
use tokio::task::JoinHandle;

use crate::simulation::controller::Result;

#[derive(Default)]
pub struct SimulationRuns {
    inner: FuturesOrdered<JoinHandle<Result<SimulationShortId>>>,
}

impl SimulationRuns {
    pub fn new_run(&mut self, handle: JoinHandle<Result<SimulationShortId>>) {
        self.inner.push(handle);
    }

    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    pub async fn next(&mut self) -> Result<Option<Result<SimulationShortId>>>
    where
        Self: Unpin,
    {
        Ok(self.inner.next().await.transpose()?)
    }
}
