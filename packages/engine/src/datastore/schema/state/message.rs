use std::sync::Arc;

use crate::datastore::arrow::message::MESSAGE_BATCH_SCHEMA;
use crate::datastore::prelude::*;

pub struct MessageSchema {
    pub arrow: Arc<ArrowSchema>,
    pub static_meta: Arc<StaticMeta>,
}

impl MessageSchema {
    pub fn new() -> Self {
        let arrow = Arc::new(MESSAGE_BATCH_SCHEMA.clone());
        let static_meta = Arc::new(arrow.get_static_metadata());

        MessageSchema { arrow, static_meta }
    }
}
