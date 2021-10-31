use std::collections::HashMap;

use crate::{config::WorkerConfig, types::TaskID, Language};

use super::task::WorkerTask;

pub enum CancelState {
    Active(Vec<Language>),
    None,
}

#[derive(new)]
pub struct PendingWorkerTask {
    pub inner: WorkerTask,
    pub active_runner: Language,
    #[new(default)]
    pub cancelling: CancelState,
}

impl PendingWorkerTask {
    pub fn initialize_cancelling(&mut self, config: &WorkerConfig) {
        let mut languages = config.spawn.spawned_languages();
        self.cancelling = CancelState::Active(languages);
    }
}

#[derive(Default)]
pub struct PendingWorkerTasks {
    pub inner: HashMap<TaskID, PendingWorkerTask>,
}
