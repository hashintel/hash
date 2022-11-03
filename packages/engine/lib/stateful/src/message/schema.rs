use std::sync::Arc;

use arrow2::datatypes::Schema;
use memory::arrow::{meta, meta::StaticMetadata};

use crate::message::arrow::MESSAGE_BATCH_SCHEMA;

/// Describes the memory format used for storing [`Message`]s.
///
/// It contains the dual representation of both the [`FieldSpec`] and the Arrow schema.
///
/// [`Message`]: crate::message::Message
/// [`FieldSpec`]: crate::field::FieldSpec
#[derive(Debug)]
pub struct MessageSchema {
    pub arrow: Arc<Schema>,
    pub static_meta: Arc<meta::StaticMetadata>,
}

impl Default for MessageSchema {
    fn default() -> Self {
        let arrow = Arc::new(MESSAGE_BATCH_SCHEMA.clone());
        let static_meta = Arc::new(StaticMetadata::from_schema(arrow.clone()));

        Self { arrow, static_meta }
    }
}

impl MessageSchema {
    pub fn new() -> Self {
        Self::default()
    }
}
