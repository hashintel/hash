use std::collections::HashMap;

use super::{Error, Result};
use crate::{simulation::task::Task, types::TaskId, Language};

#[allow(dead_code)]
pub enum CancelState {
    Active(Vec<Language>),
    None,
}

impl Default for CancelState {
    fn default() -> Self {
        CancelState::None
    }
}

// TODO: DOC
#[derive(derive_new::new)]
pub struct PendingWorkerTask {
    pub inner: Task,
    pub pending_groups: Vec<PendingGroup>,
    #[new(default)]
    pub cancelling: CancelState,
}

impl PendingWorkerTask {
    pub fn get_pending_group_mut(
        &mut self,
        group_index: Option<usize>,
    ) -> Result<&mut PendingGroup> {
        if let Some(index) = self
            .pending_groups
            .iter()
            .position(|group| group.group_index == group_index)
        {
            Ok(self.pending_groups.get_mut(index).unwrap())
        } else {
            Err(Error::from(
                "PendingWorkerTask didn't have the expected PendingGroup with index: {group_index}",
            ))
        }
    }
}

#[derive(Default)]
pub struct PendingWorkerTasks {
    pub inner: HashMap<TaskId, PendingWorkerTask>,
}

#[derive(Debug, Clone)]
pub struct PendingGroup {
    pub group_index: Option<usize>,
    pub active_runner: Language,
}
