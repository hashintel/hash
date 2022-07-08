use std::{io::BufReader, sync::Arc};

use arrow::{
    array::Array,
    chunk::Chunk,
    datatypes::Schema,
    io::ipc::read::{read_stream_metadata, StreamReader, StreamState},
};

use crate::shared_memory::Segment;

/// A [`RecordBatch`](https://arrow.apache.org/docs/format/Columnar.html#recordbatch-message).
pub struct RecordBatch {
    batches: Vec<arrow::chunk::Chunk<Arc<dyn arrow::array::Array>>>,
    schema: Schema,
}

impl RecordBatch {
    pub fn schema(&self) -> &Schema {
        &self.ipc_schema
    }

    /// Constructs a new [`RecordBatch`] from data in the provided [`Segment`].
    // todo: are we really not being supplied with data from outside the segment?
    pub fn load(segment: &Segment) -> Self {
        let header = segment.get_batch_buffers().unwrap().meta();
        let body = segment.get_batch_buffers().unwrap().data();

        let (schema, batches) = read_record_batch(header, body);

        Self { batches, schema }
    }

    pub fn num_rows(&self) -> usize {
        self.schema
    }

    /// Returns the number of columns the [`RecordBatch`] has.
    pub fn columns(&self) -> usize {
        self.columns.len()
    }

    pub fn batches(&self) -> &[Chunk<Arc<dyn Array>>] {
        self.batches.as_ref()
    }
}

/// Reads the information contained in a RecordBatch (message) received by the engine.
// todo: why does this load multiple batches whereas what came before suggests
// otherwise why would this other data be there?
// looks like we want to do something with `arrow_format::ipc`
fn read_record_batch(
    header: &[u8],
    record_batch_msg: &[u8],
) -> (Schema, Vec<Chunk<Arc<dyn Array>>>) {
    let mut header_stream = BufReader::new(header);
    let header = read_stream_metadata(&mut header_stream).unwrap();

    let body_stream = BufReader::new(record_batch_msg);
    let body = StreamReader::new(body_stream, header);

    let chunks = body
        .into_iter()
        .map(|item| match item {
            Ok(StreamState::Some(data)) => data,
            Ok(StreamState::Waiting) => {
                // we are reading from bufreaders over `&[u8]` so this should
                // not be possible
                unreachable!()
            }
            _ => item,
        })
        .collect::<arrow::error::Result<Vec<_>>>()
        .unwrap();

    (header.schema, chunks)
}

#[cfg(test)]
fn test_read_record_batches() {
    #[test]
    fn single_field() {
        todo!("add this")
    }

    #[test]
    fn multiple_fields() {
        todo!("add this")
    }
}
