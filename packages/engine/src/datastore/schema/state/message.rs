use std::sync::Arc;

use crate::datastore::{arrow::message::MESSAGE_BATCH_SCHEMA, prelude::*};

pub struct MessageSchema {
    pub arrow: Arc<ArrowSchema>,
    pub static_meta: Arc<StaticMeta>,
}

impl Default for MessageSchema {
    #[tracing::instrument(skip_all)]
    fn default() -> Self {
        let arrow = Arc::new(MESSAGE_BATCH_SCHEMA.clone());
        let static_meta = Arc::new(arrow.get_static_metadata());

        MessageSchema { arrow, static_meta }
    }
}

impl MessageSchema {
    #[tracing::instrument(skip_all)]
    pub fn new() -> Self {
        Self::default()
    }
}
