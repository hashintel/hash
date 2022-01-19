use std::collections::HashMap;

use crate::{simulation::task::Task, types::TaskId, Language};

pub enum CancelState {
    Active(Vec<Language>),
    None,
}

impl Default for CancelState {
    #[tracing::instrument(skip_all)]
    fn default() -> Self {
        CancelState::None
    }
}

#[derive(derive_new::new)]
pub struct PendingWorkerTask {
    pub inner: Task,
    pub active_runner: Language,
    #[new(default)]
    pub cancelling: CancelState,
}

#[derive(Default)]
pub struct PendingWorkerTasks {
    pub inner: HashMap<TaskId, PendingWorkerTask>,
}
