use std::collections::HashMap;

use crate::{types::TaskID, Language};
use crate::simulation::task::Task;

use super::task::WorkerTask;

pub enum CancelState {
    Active(Vec<Language>),
    None,
}

impl Default for CancelState {
    fn default() -> Self {
        CancelState::None
    }
}

#[derive(new)]
pub struct PendingWorkerTask {
    pub inner: Task,
    pub active_runner: Language,
    #[new(default)]
    pub cancelling: CancelState,
}

#[derive(Default)]
pub struct PendingWorkerTasks {
    pub inner: HashMap<TaskID, PendingWorkerTask>,
}
