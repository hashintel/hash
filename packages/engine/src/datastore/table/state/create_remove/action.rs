use crate::datastore::batch::migration::BufferActions;

pub enum ExistingGroupBufferActions<'a> {
    Persist {
        affinity: usize,
    },
    Remove,
    Update {
        actions: BufferActions<'a>,
        affinity: usize,
    },
    Undefined,
}

#[derive(Debug)]
pub struct CreateActions<'a> {
    pub actions: BufferActions<'a>,
    pub affinity: usize,
}

impl std::fmt::Debug for ExistingGroupBufferActions<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExistingGroupBufferActions::Persist { affinity } => f
                .debug_struct("Persist")
                .field("affinity", affinity)
                .finish(),
            ExistingGroupBufferActions::Remove => f.debug_struct("Remove").finish(),
            ExistingGroupBufferActions::Update {
                actions: _,
                affinity,
            } => f
                .debug_struct("Update")
                .field("affinity", affinity)
                .finish(),
            ExistingGroupBufferActions::Undefined => f.debug_struct("Undefined").finish(),
        }
    }
}
