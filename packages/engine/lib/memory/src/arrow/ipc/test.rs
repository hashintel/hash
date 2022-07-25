use std::{collections::BTreeMap, sync::Arc};

use arrow2::{
    array::BooleanArray,
    chunk::Chunk,
    datatypes::{DataType, Field, Schema},
    io::ipc::write::{default_ipc_fields, schema_to_bytes},
};
use uuid::Uuid;

use super::read_record_batch;
use crate::{
    arrow::{
        ipc::{
            calculate_ipc_data_size, write_record_batch_body, write_record_batch_message_header,
        },
        record_batch::RecordBatch,
    },
    shared_memory::{MemoryId, Segment},
};

#[test]
/// Tests that we can serialize a single column and then read it.
fn simple_roundtrip() {
    let schema = Arc::new(Schema {
        fields: vec![Field::new("field1", DataType::Boolean, false)],
        metadata: BTreeMap::new(),
    });
    let record_batch = RecordBatch::new(
        schema.clone(),
        Chunk::new(vec![
            BooleanArray::from_slice(&[true, true, true, true]).arced(),
        ]),
    );

    let schema_buffer = schema_to_bytes(schema.as_ref(), &default_ipc_fields(&schema.fields));
    let header_buffer = crate::shared_memory::Metaversion::default().to_le_bytes();
    let info = calculate_ipc_data_size(&record_batch);

    let mut metadata = vec![];
    write_record_batch_message_header(&mut metadata, &info).unwrap();

    let memory_id = MemoryId::new(Uuid::new_v4());

    let mut segment = Segment::from_sizes(
        memory_id,
        schema_buffer.len(),
        header_buffer.len(),
        metadata.len(),
        info.body_len,
        true,
    )
    .unwrap();

    let _ = segment.set_schema(&schema_buffer).unwrap();
    let _ = segment.set_header(&header_buffer).unwrap();
    let _ = segment.set_metadata(&metadata).unwrap();
    let data_buffer = segment.get_mut_data_buffer().unwrap();
    write_record_batch_body(&record_batch, data_buffer).unwrap();

    let read_record_batch = read_record_batch(&segment, schema).unwrap();

    assert_eq!(record_batch, read_record_batch);
}
