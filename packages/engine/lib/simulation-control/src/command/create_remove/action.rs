use crate::command::create_remove::migration::BufferActions;

pub enum ExistingGroupBufferActions {
    Persist {
        worker_index: usize,
    },
    Remove,
    Update {
        actions: BufferActions,
        worker_index: usize,
    },
    Undefined,
}

#[derive(Debug)]
pub struct CreateActions {
    pub actions: BufferActions,
    pub worker_index: usize,
}

impl std::fmt::Debug for ExistingGroupBufferActions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExistingGroupBufferActions::Persist { worker_index } => f
                .debug_struct("Persist")
                .field("worker_index", worker_index)
                .finish(),
            ExistingGroupBufferActions::Remove => f.debug_struct("Remove").finish(),
            ExistingGroupBufferActions::Update {
                actions: _,
                worker_index,
            } => f
                .debug_struct("Update")
                .field("worker_index", worker_index)
                .finish(),
            ExistingGroupBufferActions::Undefined => f.debug_struct("Undefined").finish(),
        }
    }
}
