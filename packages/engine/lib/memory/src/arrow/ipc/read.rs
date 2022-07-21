//! This file loads data from memory into

use std::{collections::BTreeMap, io::Cursor, sync::Arc};

use arrow::{
    datatypes::{Metadata, Schema},
    io::ipc::read::{read_file_metadata, FileReader},
};

use super::RecordBatch;
use crate::shared_memory::Segment;

/// Reads the [`RecordBatch`] stored in the given [`Segment`].
///
/// If the data in the [`Segment`] is incorrectly formatted, this method will
/// return an error.
pub fn read_record_batch(segment: &Segment, schema: Arc<Schema>) -> crate::Result<RecordBatch> {
    let mut meta_reader = Cursor::new(segment.get_batch_buffers()?.meta());
    let mut data_reader = Cursor::new(segment.get_batch_buffers()?.data());

    // todo: handle error
    let metadata = read_file_metadata(&mut meta_reader).unwrap();

    let reader = FileReader::new(&mut data_reader, metadata, None);

    // todo: handle error
    let mut chunks = reader.collect::<arrow::error::Result<Vec<_>>>().unwrap();

    // note: although it is possible to have more than one RecordBatch in a file, inside the engine
    // we do not use this feature.
    debug_assert_eq!(chunks.len(), 1);

    Ok(RecordBatch {
        schema,
        columns: chunks.remove(0),
    })
}

/// Loads the Flatbuffers RecordBatch _message_ - i.e. the data in the header (_not_ the data in the
/// actual columns). You may also be interested in the [`record_batch`] function, which reads an
/// entire record batch (metadata and all).
///
/// Unfortunately, there is some confusing naming here:
/// - in arrow-rs (i.e. not `arrow2` which is what we use) there are two types: one in `ipc` called
///   `RecordBatch`, and another in `record_batch` called `RecordBatch`
///   - ipc RecordBatch refers only to the _header_ - i.e. the data at the start of the batch which
///     provides all the offsets at which the columns are in the file
///   - record_batch RecordBatch is what arrow-rs uses to store the entire
pub fn read_record_batch_message(
    segment: &Segment,
) -> crate::Result<arrow_format::ipc::RecordBatchRef<'_>> {
    todo!()
}

/// Converts a flatbuffers message into a [`arrow::datatypes::Schema`].
pub fn arrow_schema_from_fb(
    fb: arrow_format::ipc::SchemaRef,
) -> crate::Result<arrow::datatypes::Schema> {
    let mut fields = vec![];

    let fb_fields_tmp = fb.fields()?;
    let fb_fields = fb_fields_tmp.iter().next().unwrap();

    for fb_field in fb_fields.iter() {
        let fb_field = fb_field?;
        fields.push(arrow::datatypes::Field {
            name: fb_field.name()?.unwrap().to_string(),
            data_type: fb_type_2_arrow2_type(TryFrom::try_from(fb_field.type_()?.unwrap())?),
            is_nullable: fb_field.nullable()?,
            metadata: fb_field
                .custom_metadata()?
                .map(
                    |metadata| -> arrow_format::ipc::planus::Result<BTreeMap<String, String>> {
                        let mut map = BTreeMap::new();
                        for m in metadata.iter() {
                            let m = m?;
                            map.insert(
                                m.key()?.unwrap().to_string(),
                                m.value()?.unwrap().to_string(),
                            );
                        }
                        Ok(map)
                    },
                )
                .unwrap_or(Ok(BTreeMap::default()))?,
        })
    }

    Ok(arrow::datatypes::Schema {
        fields,
        metadata: Metadata::default(),
    })
}

/// Converts from the flatbuffers representation of an Arrow type into the interal Rust [`arrow`]2
/// representation.
fn fb_type_2_arrow2_type(ty: arrow_format::ipc::Type) -> arrow::datatypes::DataType {
    match ty {
        arrow_format::ipc::Type::Null(_) => todo!(),
        arrow_format::ipc::Type::Int(_) => todo!(),
        arrow_format::ipc::Type::FloatingPoint(_) => todo!(),
        arrow_format::ipc::Type::Binary(_) => todo!(),
        arrow_format::ipc::Type::Utf8(_) => todo!(),
        arrow_format::ipc::Type::Bool(_) => todo!(),
        arrow_format::ipc::Type::Decimal(_) => todo!(),
        arrow_format::ipc::Type::Date(_) => todo!(),
        arrow_format::ipc::Type::Time(_) => todo!(),
        arrow_format::ipc::Type::Timestamp(_) => todo!(),
        arrow_format::ipc::Type::Interval(_) => todo!(),
        arrow_format::ipc::Type::List(_) => todo!(),
        arrow_format::ipc::Type::Struct(_) => todo!(),
        arrow_format::ipc::Type::Union(_) => todo!(),
        arrow_format::ipc::Type::FixedSizeBinary(_) => todo!(),
        arrow_format::ipc::Type::FixedSizeList(_) => todo!(),
        arrow_format::ipc::Type::Map(_) => todo!(),
        arrow_format::ipc::Type::Duration(_) => todo!(),
        arrow_format::ipc::Type::LargeBinary(_) => todo!(),
        arrow_format::ipc::Type::LargeUtf8(_) => todo!(),
        arrow_format::ipc::Type::LargeList(_) => todo!(),
    }
}
