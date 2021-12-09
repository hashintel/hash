use futures::stream::{FuturesOrdered, StreamExt};
use tokio::task::JoinHandle;

use super::Result;
use crate::proto::SimulationShortID;

#[derive(Default)]
pub struct SimulationRuns {
    inner: FuturesOrdered<JoinHandle<Result<SimulationShortID>>>,
}

impl SimulationRuns {
    pub fn new_run(&mut self, handle: JoinHandle<Result<SimulationShortID>>) {
        self.inner.push(handle);
    }

    pub async fn next(&mut self) -> Result<Option<Result<SimulationShortID>>>
    where
        Self: Unpin,
    {
        Ok(self.inner.next().await.transpose()?)
    }
}
