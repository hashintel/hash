use std::sync::Arc;

use arrow::datatypes::Schema as ArrowSchema;

use crate::datastore::{
    arrow::{message::MESSAGE_BATCH_SCHEMA, meta_conversion::HashStaticMeta},
    meta::Static as StaticMeta,
};

pub struct MessageSchema {
    pub arrow: Arc<ArrowSchema>,
    pub static_meta: Arc<StaticMeta>,
}

impl Default for MessageSchema {
    fn default() -> Self {
        let arrow = Arc::new(MESSAGE_BATCH_SCHEMA.clone());
        let static_meta = Arc::new(arrow.get_static_metadata());

        MessageSchema { arrow, static_meta }
    }
}

impl MessageSchema {
    pub fn new() -> Self {
        Self::default()
    }
}
