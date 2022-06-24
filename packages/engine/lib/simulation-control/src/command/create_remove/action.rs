use crate::command::create_remove::migration::BufferActions;

pub enum ExistingGroupBufferActions<'a> {
    Persist {
        worker_index: usize,
    },
    Remove,
    Update {
        actions: BufferActions<'a>,
        worker_index: usize,
    },
    Undefined,
}

#[derive(Debug)]
pub struct CreateActions<'a> {
    pub actions: BufferActions<'a>,
    pub worker_index: usize,
}

impl std::fmt::Debug for ExistingGroupBufferActions<'_> {
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
