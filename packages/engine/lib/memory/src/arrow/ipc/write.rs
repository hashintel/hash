/// Contains the data which [`record_batch_msg_offset`] computes. This struct exists to make it
/// impossible to call [`write_record_batch_data_to_bytes`] without first computing the necessary
/// information using [`record_batch_msg_offset`]. Previously we did allow this behaviour, but it
/// could lead to unsafety.
pub struct RecordBatchBytes {
    /// The length (in bytes) of the Arrow columns.
    pub data_len: usize,
    /// The data corresponding to the arrow message.
    pub msg_data: Vec<u8>,
    /// The total offset calculated.
    pub offset: i64,
}

impl RecordBatchBytes {
    /// Returns [`Self::msg_data`], replacing it with an empty vector.
    pub fn take_msg_data(&mut self) -> Vec<u8> {
        let mut empty = Vec::new();

        std::mem::swap(&mut empty, &mut self.msg_data);

        empty
    }
}

/// Writes the data section of the [`RecordBatch`] into the provided buffer.
pub fn write_record_batch_data_to_bytes(
    batch: &super::RecordBatch,
    buf: &mut [u8],
    info: RecordBatchBytes,
) {
    let mut arrow_data = Vec::with_capacity(info.data_len);
    let mut offset = 0;
    let mut buffers = vec![];
    let mut nodes = vec![];
    for array in batch.columns() {
        super::serialize::write(
            array.as_ref(),
            &mut buffers,
            &mut arrow_data,
            &mut nodes,
            &mut offset,
            true,
        );
    }
    buf.copy_from_slice(&arrow_data)
}

/// Converts part of a [`RecordBatch`] to bytes. This function *does not* write the whole of the
/// [`RecordBatch`]; instead it computes the offsets of the Arrow arrays, and then returns the
/// binary representation of the [`arrow_format::ipc::RecordBatch`] message for this
/// [`RecordBatch`]. This function also returns the offset of the data (were it to have been
/// written) relative to the start of the written [`RecordBatch`] (again, were the actual Arrow
/// arrays to have been written).
pub fn record_batch_msg_offset(
    record_batch: &super::RecordBatch,
) -> crate::Result<RecordBatchBytes> {
    let mut nodes = vec![];
    let mut buffers = vec![];
    let mut arrow_data = vec![];

    let mut offset = 0;

    for array in record_batch.columns() {
        super::serialize::write(
            array.as_ref(),
            &mut buffers,
            &mut arrow_data,
            &mut nodes,
            &mut offset,
            cfg!(target = "little_endian"),
        )
    }

    let mut flatbuffer_builder = arrow_format::ipc::planus::Builder::new();

    let res = arrow_format::ipc::RecordBatch::create(
        &mut flatbuffer_builder,
        record_batch.num_rows() as i64,
        nodes,
        buffers,
        Option::<arrow_format::ipc::BodyCompression>::None,
    );

    let data = flatbuffer_builder.finish(res, None).to_vec();

    Ok(RecordBatchBytes {
        data_len: arrow_data.len(),
        offset,
        msg_data: data,
    })
}
