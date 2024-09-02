mod batch;
mod channel;

pub use self::batch::EntityTypeRowBatch;
pub(crate) use self::channel::{entity_type_channel, EntityTypeSender};
