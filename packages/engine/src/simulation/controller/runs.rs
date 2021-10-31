use tokio::task::JoinHandle;

use futures::stream::{FuturesUnordered, StreamExt};

use crate::proto::SimulationShortID;

use super::Result;

#[derive(Default)]
pub struct SimulationRuns {
    inner: FuturesUnordered<JoinHandle<Result<SimulationShortID>>>,
}

impl SimulationRuns {
    pub fn new_run(&mut self, handle: JoinHandle<Result<SimulationShortID>>) {
        self.inner.push(handle);
    }

    pub async fn next(&mut self) -> Option<Result<SimulationShortID>>
    where
        Self: Unpin,
    {
        self.inner.next().await.transpose()?
    }
}
