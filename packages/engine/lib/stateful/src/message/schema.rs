use std::sync::Arc;

use arrow::datatypes::Schema;
use memory::arrow::{meta, meta::conversion::HashStaticMeta};

use crate::message::arrow::MESSAGE_BATCH_SCHEMA;

pub struct MessageSchema {
    pub arrow: Arc<Schema>,
    pub static_meta: Arc<meta::Static>,
}

impl Default for MessageSchema {
    fn default() -> Self {
        let arrow = Arc::new(MESSAGE_BATCH_SCHEMA.clone());
        let static_meta = Arc::new(arrow.get_static_metadata());

        Self { arrow, static_meta }
    }
}

impl MessageSchema {
    pub fn new() -> Self {
        Self::default()
    }
}
