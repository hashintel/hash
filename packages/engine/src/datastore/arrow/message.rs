use std::sync::Arc;

use arrow::{array::Array, datatypes::Schema, record_batch::RecordBatch};
use stateful::message::arrow::array::OutboundArray;

use crate::datastore::error::{Error, Result};

pub const FROM_COLUMN_INDEX: usize = 0;

pub fn batch_from_json(
    schema: &Arc<Schema>,
    ids: Vec<&str>,
    messages: Option<Vec<serde_json::Value>>,
) -> Result<RecordBatch> {
    let agent_count = ids.len();
    let ids = Arc::new(super::batch_conversion::get_agent_id_array(ids)?);

    let messages: Arc<dyn Array> = messages.map_or_else(
        || OutboundArray::new(agent_count).map(Arc::new),
        |values| OutboundArray::from_json(values).map(Arc::new),
    )?;

    RecordBatch::try_new(schema.clone(), vec![ids, messages]).map_err(Error::from)
}
