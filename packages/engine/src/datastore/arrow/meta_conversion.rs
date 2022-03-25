#![allow(
    clippy::or_fun_call,
    clippy::cast_sign_loss,
    clippy::option_as_ref_deref,
    clippy::needless_pass_by_value,
    clippy::doc_markdown,
    clippy::match_same_arms
)]

use std::sync::Arc;

use arrow::{
    datatypes::{DataType, Field, IntervalUnit, Schema, TimeUnit},
    ipc,
};
use flatbuffers::FlatBufferBuilder;

use crate::datastore::{
    meta::{self, Buffer, BufferType, Column, Node, NodeMapping},
    Error, Result,
};

pub enum SupportedDataTypes {
    Boolean,
    Utf8,
    Binary,
    FixedSizeBinary(i32),

    Int8,
    Int16,
    Int32,
    Int64,

    Uint8,
    Uint16,
    Uint32,
    Uint64,

    Float32,
    Float64,

    Time32(TimeUnit),
    Time64(TimeUnit),
    Timestamp(TimeUnit, Option<String>),

    Date32,
    Date64,

    Interval(IntervalUnit),
    Duration(TimeUnit),

    List(Box<SupportedDataTypes>),
    FixedSizeList(Box<SupportedDataTypes>, i32),
    Struct(Vec<Field>),
}

impl TryFrom<DataType> for SupportedDataTypes {
    type Error = Error;

    fn try_from(arrow_data_type: DataType) -> Result<Self, Self::Error> {
        match arrow_data_type {
            DataType::Boolean => Ok(Self::Boolean),
            DataType::Utf8 => Ok(Self::Utf8),
            DataType::Binary => Ok(Self::Binary),
            DataType::FixedSizeBinary(size) => Ok(Self::FixedSizeBinary(size)),

            DataType::Int8 => Ok(Self::Int8),
            DataType::Int16 => Ok(Self::Int16),
            DataType::Int32 => Ok(Self::Int32),
            DataType::Int64 => Ok(Self::Int64),

            DataType::UInt8 => Ok(Self::Uint8),
            DataType::UInt16 => Ok(Self::Uint16),
            DataType::UInt32 => Ok(Self::Uint32),
            DataType::UInt64 => Ok(Self::Uint64),

            DataType::Float32 => Ok(Self::Float32),
            DataType::Float64 => Ok(Self::Float64),

            DataType::Time32(elapsed) => Ok(Self::Time32(elapsed)),
            DataType::Time64(elapsed) => Ok(Self::Time64(elapsed)),
            DataType::Timestamp(elapsed, time_zone) => Ok(Self::Timestamp(elapsed, time_zone)),

            DataType::Date32 => Ok(Self::Date32),
            DataType::Date64 => Ok(Self::Date64),

            DataType::Interval(interval) => Ok(Self::Interval(interval)),
            DataType::Duration(elapsed) => Ok(Self::Duration(elapsed)),

            DataType::List(field) => Ok(Self::List(Box::new(Self::try_from(
                field.data_type().clone(),
            )?))),
            DataType::FixedSizeList(field, size) => Ok(Self::FixedSizeList(
                Box::new(Self::try_from(field.data_type().clone())?),
                size,
            )),
            DataType::Struct(fields) => Ok(Self::Struct(fields)),
            d_type => Err(Error::UnsupportedArrowDataType { d_type }),
        }
    }
}

pub trait HashStaticMeta {
    fn get_static_metadata(&self) -> meta::Static;
}

impl HashStaticMeta for Arc<Schema> {
    fn get_static_metadata(&self) -> meta::Static {
        let (indices, padding, data) = schema_to_column_hierarchy(self.clone());
        meta::Static::new(indices, padding, data)
    }
}

pub trait HashDynamicMeta {
    fn into_meta(&self, data_length: usize) -> Result<meta::Dynamic>;
}

impl HashDynamicMeta for ipc::RecordBatch<'_> {
    fn into_meta(&self, data_length: usize) -> Result<meta::Dynamic> {
        let nodes = self
            .nodes()
            .ok_or(Error::ArrowBatch("Missing field nodes".into()))?
            .iter()
            .map(|n| Node {
                length: n.length() as usize,
                null_count: n.null_count() as usize,
            })
            .collect();

        let buffers = self
            .buffers()
            .ok_or(Error::ArrowBatch("Missing buffers".into()))?;

        let buffers: Vec<Buffer> = buffers
            .iter()
            .enumerate()
            .map(|(i, b)| {
                let padding = buffers
                    .get(i + 1)
                    .map_or(data_length - (b.offset() + b.length()) as usize, |next| {
                        (next.offset() - b.offset() - b.length()) as usize
                    });

                Ok(Buffer {
                    offset: b.offset() as usize,
                    length: b.length() as usize,
                    padding,
                })
            })
            .collect::<Result<_>>()?;

        Ok(meta::Dynamic {
            length: self.length() as usize,
            data_length,
            nodes,
            buffers,
        })
    }
}

/// Computes the flat_buffers builder from the metadata, using this builder
/// the metadata of a shared batch can be modified
pub fn get_dynamic_meta_flatbuffers(meta: &meta::Dynamic) -> Result<Vec<u8>> {
    // TODO: OPTIM: Evaluate, if we want to return the flatbuffer instead to remove the slice-to-vec
    //   conversion.
    // Build Arrow Buffer and FieldNode messages
    let buffers: Vec<ipc::Buffer> = meta
        .buffers
        .iter()
        .map(|b| ipc::Buffer::new(b.offset as i64, b.length as i64))
        .collect();
    let nodes: Vec<ipc::FieldNode> = meta
        .nodes
        .iter()
        .map(|n| ipc::FieldNode::new(n.length as i64, n.null_count as i64))
        .collect();

    let mut fbb = FlatBufferBuilder::new();

    // Copied from `ipc.rs` from function `record_batch_to_bytes`
    // with some modifications:
    // - `meta.length` is used instead of `batch.num_rows()` (refers to the same thing)
    // - `meta.data_length ` is used instead of `arrow_data.len()` (same thing)
    let buffers = fbb.create_vector(&buffers);
    let nodes = fbb.create_vector(&nodes);

    let root = {
        let mut batch_builder = ipc::RecordBatchBuilder::new(&mut fbb);
        batch_builder.add_length(meta.length as i64);
        batch_builder.add_nodes(nodes);
        batch_builder.add_buffers(buffers);
        let b = batch_builder.finish();
        b.as_union_value()
    };
    // create an ipc::Message
    let mut message = ipc::MessageBuilder::new(&mut fbb);
    message.add_version(ipc::MetadataVersion::V4);
    message.add_header_type(ipc::MessageHeader::RecordBatch);
    message.add_bodyLength(meta.data_length as i64);
    message.add_header(root);
    let root = message.finish();
    fbb.finish(root, None);
    let finished_data = fbb.finished_data();

    Ok(finished_data.to_vec())
}

/// Column hierarchy is the mapping from column index to buffer and node indices.
/// This also returns information about which buffers are growable
fn schema_to_column_hierarchy(
    schema: Arc<Schema>,
) -> (Vec<Column>, Vec<bool>, Vec<meta::NodeStatic>) {
    let mut padding_meta = vec![];
    let mut node_meta = vec![];
    let column_indices =
        schema
            .fields()
            .iter()
            .fold((vec![], 0, 0), |mut accum, field| {
                let (
                    node_count,
                    buffer_count,
                    buffer_counts,
                    mut padding,
                    mut data,
                    root_node_mapping,
                ) = data_type_to_metadata(
                    &SupportedDataTypes::try_from((*field.data_type()).clone()).unwrap(),
                    false,
                    1,
                );

                padding_meta.append(&mut padding);
                node_meta.append(&mut data);
                // Nullable fields have the same buffer count as non-nullable
                // see `write_array_data` in `ipc.rs`. This means we don't have to check
                // for this here.
                accum.0.push(Column {
                    node_start: accum.1,
                    node_count,
                    root_node_mapping,
                    buffer_start: accum.2,
                    buffer_counts,
                    buffer_count,
                });
                accum.1 += node_count;
                accum.2 += buffer_count;
                accum
            })
            .0;

    (column_indices, padding_meta, node_meta)
}

// `data_type_to_metadata` is a recursive function which helps
// calculate every buffer count for every node for every column.
// The `is_parent_growable` parameter is required because for example
// a column with elements of type `Vec<[u64; 3]>` has the inner node for
// `[u64; 3]` data be growable due to `Vec` being growable, even though
// `[u64; 3]` itself if fixed-size.

/// Knowing the data type, can help us calculate the node and offset buffer counts in a column
#[allow(clippy::too_many_lines)]
#[must_use]
pub fn data_type_to_metadata(
    data_type: &SupportedDataTypes,
    is_parent_growable: bool,
    multiplier: usize,
) -> (
    usize,
    usize,
    Vec<usize>,
    Vec<bool>,
    Vec<meta::NodeStatic>,
    NodeMapping,
) {
    type D = SupportedDataTypes;
    match data_type {
        D::Utf8 | D::Binary => {
            let bit_map = BufferType::BitMap {
                is_null_bitmap: true,
            };
            let offsets = BufferType::Offset;
            let binary = BufferType::Data { unit_byte_size: 1 };
            let node_meta = meta::NodeStatic::new(multiplier, vec![bit_map, offsets, binary]);
            (
                1,
                3,
                vec![3],
                vec![is_parent_growable, is_parent_growable, true],
                vec![node_meta],
                NodeMapping::empty(),
            )
        }
        D::FixedSizeBinary(size) => (
            1,
            2,
            vec![2],
            vec![is_parent_growable, is_parent_growable],
            vec![meta::NodeStatic::new(multiplier, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
                BufferType::Data {
                    unit_byte_size: *size as usize,
                },
            ])],
            NodeMapping::empty(),
        ),
        D::List(ref list_data_type) => {
            let (n, buffer_count, mut b, mut p, mut c, node_mapping) =
                data_type_to_metadata(list_data_type, true, 1);
            let mut buffer_counts = vec![2];
            buffer_counts.append(&mut b);
            let mut padding_meta = vec![is_parent_growable, is_parent_growable];
            padding_meta.append(&mut p);
            let mut node_meta = vec![meta::NodeStatic::new(multiplier, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
                BufferType::Offset,
            ])];
            node_meta.append(&mut c);
            (
                n + 1,
                buffer_count + 2,
                buffer_counts,
                padding_meta,
                node_meta,
                NodeMapping::singleton(node_mapping),
            )
        }
        D::FixedSizeList(ref list_data_type, size) => {
            let (n, buffer_count, mut b, mut p, mut c, node_mapping) =
                data_type_to_metadata(list_data_type, is_parent_growable, *size as usize);
            let mut buffer_counts = vec![1];
            buffer_counts.append(&mut b);
            let mut padding_meta = vec![is_parent_growable];
            padding_meta.append(&mut p);
            let mut node_meta = vec![meta::NodeStatic::new(multiplier, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
            ])];
            node_meta.append(&mut c);
            (
                n + 1,
                buffer_count + 1,
                buffer_counts,
                padding_meta,
                node_meta,
                NodeMapping::singleton(node_mapping),
            )
        }
        D::Boolean => (
            1,
            2,
            vec![2],
            vec![is_parent_growable, is_parent_growable],
            vec![meta::NodeStatic::new(multiplier, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
                BufferType::BitMap {
                    is_null_bitmap: false,
                },
            ])],
            NodeMapping::empty(),
        ),
        // Sizes taken from https://docs.rs/arrow/1.0.1/src/arrow/datatypes.rs.html#688
        D::Int8 => data_type_metadata(is_parent_growable, multiplier, 1),
        D::Int16 => data_type_metadata(is_parent_growable, multiplier, 2),
        D::Int32 => data_type_metadata(is_parent_growable, multiplier, 4),
        D::Int64 => data_type_metadata(is_parent_growable, multiplier, 8),

        D::Uint8 => data_type_metadata(is_parent_growable, multiplier, 1),
        D::Uint16 => data_type_metadata(is_parent_growable, multiplier, 2),
        D::Uint32 => data_type_metadata(is_parent_growable, multiplier, 4),
        D::Uint64 => data_type_metadata(is_parent_growable, multiplier, 8),

        D::Float32 => data_type_metadata(is_parent_growable, multiplier, 4),
        D::Float64 => data_type_metadata(is_parent_growable, multiplier, 8),

        D::Time32(_) => data_type_metadata(is_parent_growable, multiplier, 4),
        D::Time64(_) => data_type_metadata(is_parent_growable, multiplier, 8),
        D::Timestamp(..) => data_type_metadata(is_parent_growable, multiplier, 8),

        D::Date32 => data_type_metadata(is_parent_growable, multiplier, 4),
        D::Date64 => data_type_metadata(is_parent_growable, multiplier, 8),

        D::Interval(arrow::datatypes::IntervalUnit::YearMonth) => {
            data_type_metadata(is_parent_growable, multiplier, 4)
        }
        D::Interval(arrow::datatypes::IntervalUnit::DayTime) => {
            data_type_metadata(is_parent_growable, multiplier, 8)
        }
        D::Interval(arrow::datatypes::IntervalUnit::MonthDayNano) => {
            data_type_metadata(is_parent_growable, multiplier, 16)
        }

        D::Duration(_) => data_type_metadata(is_parent_growable, multiplier, 8),

        D::Struct(ref fields) => {
            let mut node_count = 1;
            let mut buffer_counts = vec![1];
            let mut buffer_count = 1;
            let mut buffer_is_growable_values = vec![is_parent_growable];
            let mut node_meta = vec![meta::NodeStatic::new(multiplier, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
            ])];
            let mut child_node_mappings = Vec::with_capacity(fields.len());
            for field in fields {
                let (n, child_buffer_count, mut b, mut p, mut c, node_mapping) =
                    data_type_to_metadata(
                        &D::try_from((*field.data_type()).clone()).unwrap(),
                        is_parent_growable,
                        1,
                    );
                node_count += n;
                buffer_count += child_buffer_count;
                buffer_counts.append(&mut b);
                buffer_is_growable_values.append(&mut p);
                node_meta.append(&mut c);
                child_node_mappings.push(node_mapping);
            }
            (
                node_count,
                buffer_count,
                buffer_counts,
                buffer_is_growable_values,
                node_meta,
                NodeMapping(child_node_mappings),
            )
        }
    }
}

fn data_type_metadata(
    is_parent_growable: bool,
    multiplier: usize,
    unit_byte_size: usize,
) -> (
    usize,
    usize,
    Vec<usize>,
    Vec<bool>,
    Vec<meta::NodeStatic>,
    NodeMapping,
) {
    (
        1,
        2,
        vec![2],
        vec![is_parent_growable, is_parent_growable],
        vec![meta::NodeStatic::new(multiplier, vec![
            BufferType::BitMap {
                is_null_bitmap: true,
            },
            BufferType::Data { unit_byte_size },
        ])],
        NodeMapping::empty(),
    )
}

#[cfg(test)]
pub mod tests {
    use std::collections::HashMap;

    use arrow::{
        array::ArrayRef,
        datatypes::{IntervalUnit, TimeUnit},
    };

    type D = DataType;
    type ArrowArrayData = arrow::array::ArrayData;

    use super::*;

    fn get_dummy_metadata() -> HashMap<String, String> {
        [("Key".to_string(), "Value".to_string())]
            .iter()
            .cloned()
            .collect()
    }

    fn get_num_nodes_from_array_data(data: &ArrowArrayData) -> usize {
        data.child_data().iter().fold(0, |total_children, child| {
            total_children + get_num_nodes_from_array_data(child)
        }) + 1
    }

    fn get_buffer_counts_from_array_data<'a>(
        node_data: &ArrowArrayData,
        node_meta: &'a [meta::NodeStatic],
    ) -> (Vec<usize>, &'a [meta::NodeStatic]) {
        // check current node's bitmap, node_meta is created by pre-order traversal so ordering
        // should be same
        let has_null_bitmap = node_meta[0].get_data_types().iter().any(|buffer_type| {
            if let BufferType::BitMap { is_null_bitmap } = buffer_type {
                return *is_null_bitmap;
            }
            false
        });

        // for some nodes we add an additional buffer to the metadata that is present in the
        // underlying memory layout but isn't exposed within ArrowArrayData
        let mut buffers = if has_null_bitmap {
            vec![node_data.buffers().len() + 1]
        } else {
            vec![node_data.buffers().len()]
        };

        // pop the first element of the slice
        let mut node_meta = &node_meta[1..];

        for child_data in node_data.child_data() {
            let (child_buffers, new_node_meta) =
                get_buffer_counts_from_array_data(child_data, node_meta);
            node_meta = new_node_meta;
            buffers.extend(child_buffers);
        }

        // return the slice for use in next call and avoid need for a counter or mutable state
        // between recursive calls
        (buffers, node_meta)
    }

    fn get_node_mapping_from_array_data(data: &ArrowArrayData) -> NodeMapping {
        if data.child_data().is_empty() {
            NodeMapping::empty()
        } else {
            let child_node_mappings: Vec<NodeMapping> = data
                .child_data()
                .iter()
                .map(get_node_mapping_from_array_data)
                .collect();
            NodeMapping(child_node_mappings)
        }
    }

    // Extracts column hierarchy metadata from the Arrow Array data for a given FieldNode, and its
    // children
    fn get_col_hierarchy_from_arrow_array(
        arrow_array: &dyn ArrowArray,
        node_infos: &[meta::NodeStatic],
    ) -> (usize, Vec<usize>, NodeMapping) {
        let node_count = get_num_nodes_from_array_data(arrow_array.data_ref());
        let (buffer_counts, _) =
            get_buffer_counts_from_array_data(arrow_array.data_ref(), node_infos);
        let node_mapping = get_node_mapping_from_array_data(arrow_array.data_ref());

        (node_count, buffer_counts, node_mapping)
    }

    #[test]
    fn bool_dtype_schema_to_col_hierarchy() {
        let schema = Schema::new_with_metadata(
            vec![Field::new("c0", D::Boolean, false)],
            get_dummy_metadata(),
        );
        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        let num_buffers = 2;
        let expected_col_info = vec![ColumnMeta {
            node_start: 0,
            node_count: 1,
            buffer_start: 0,
            buffer_count: num_buffers,
            root_node_mapping: NodeMapping::empty(),
            buffer_counts: vec![num_buffers],
        }];

        let expected_buffer_info = vec![false; num_buffers]; // no growable parents

        let expected_node_info = vec![meta::NodeStatic::new(1, vec![
            BufferType::BitMap {
                is_null_bitmap: true,
            },
            BufferType::BitMap {
                is_null_bitmap: false,
            },
        ])];

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data column, entries don't matter as we're only interested in the structure,
        let bool_array = arrow::array::BooleanArray::from(vec![true, true, true, true, true]);

        for (arrow_array, column_meta) in [bool_array].iter().zip(expected_col_info.iter()) {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn num_dtypes_schema_to_col_hierarchy() {
        let fields = vec![
            Field::new("c1", D::Int8, false),
            Field::new("c2", D::Int16, false),
            Field::new("c3", D::Int32, false),
            Field::new("c4", D::Int64, false),
            Field::new("c5", D::UInt8, false),
            Field::new("c6", D::UInt16, false),
            Field::new("c7", D::UInt32, false),
            Field::new("c8", D::UInt64, false),
            Field::new("c9", D::Float32, false),
            Field::new("c10", D::Float64, false),
        ];
        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());

        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        // all fields are one node, with each node having 2 buffers
        let num_buffers = 2;
        let expected_col_info: Vec<ColumnMeta> = (0..10)
            .map(|idx| ColumnMeta {
                node_start: idx,
                node_count: 1,
                buffer_start: idx * num_buffers,
                buffer_count: num_buffers,
                root_node_mapping: NodeMapping::empty(),
                buffer_counts: vec![num_buffers],
            })
            .collect();

        // none of the nodes have growable components and therefore none of the buffers do
        let expected_buffer_info = vec![false; fields.len() * num_buffers];

        // all nodes have the same structure aside from size of data buffer
        let expected_node_info: Vec<meta::NodeStatic> = [1, 2, 4, 8, 1, 2, 4, 8, 4, 8]
            .iter()
            .map(|&unit_byte_size| {
                meta::NodeStatic::new(1, vec![
                    BufferType::BitMap {
                        is_null_bitmap: true,
                    },
                    BufferType::Data { unit_byte_size },
                ])
            })
            .collect();

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns
        let int8_array = arrow::array::Int8Array::from(vec![1, 2, 3, 4, 5, 6]);
        let int16_array = arrow::array::Int16Array::from(vec![1, 2, 3, 4, 5, 6]);
        let int32_array = arrow::array::Int32Array::from(vec![1, 2, 3, 4, 5, 6]);
        let int64_array = arrow::array::Int64Array::from(vec![1, 2, 3, 4, 5, 6]);
        let uint8_array = arrow::array::UInt8Array::from(vec![1, 2, 3, 4, 5, 6]);
        let uint16_array = arrow::array::UInt16Array::from(vec![1, 2, 3, 4, 5, 6]);
        let uint32_array = arrow::array::UInt32Array::from(vec![1, 2, 3, 4, 5, 6]);
        let uint64_array = arrow::array::UInt64Array::from(vec![1, 2, 3, 4, 5, 6]);
        let float32_array = arrow::array::Float32Array::from(vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
        let float64_array = arrow::array::Float64Array::from(vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);

        let dummy_data_arrays: Vec<&dyn ArrowArray> = vec![
            &int8_array,
            &int16_array,
            &int32_array,
            &int64_array,
            &uint8_array,
            &uint16_array,
            &uint32_array,
            &uint64_array,
            &float32_array,
            &float64_array,
        ];

        for (arrow_array, column_meta) in
            dummy_data_arrays.into_iter().zip(expected_col_info.iter())
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn time_dtypes_schema_to_col_hierarchy() {
        let mut fields = vec![];
        let mut unit_byte_sizes = vec![];

        for time_unit in [
            D::Time64(TimeUnit::Nanosecond),
            D::Time64(TimeUnit::Microsecond),
            D::Time32(TimeUnit::Millisecond),
            D::Time32(TimeUnit::Second),
        ] {
            match time_unit {
                // data buffer size is independent of TimeUnit
                D::Time32(_) => unit_byte_sizes.push(4),
                D::Time64(_) => unit_byte_sizes.push(8),
                _ => unimplemented!(),
            }

            fields.push(Field::new(&format!("c{}", fields.len()), time_unit, false));
        }

        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());
        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        // all fields are one node, with each node having 2 buffers
        let num_buffers = 2;
        let expected_col_info: Vec<ColumnMeta> = (0..fields.len())
            .map(|idx| ColumnMeta {
                node_start: idx,
                node_count: 1,
                buffer_start: idx * num_buffers,
                buffer_count: num_buffers,
                root_node_mapping: NodeMapping::empty(),
                buffer_counts: vec![num_buffers],
            })
            .collect();

        // none of the nodes have growable components and therefore none of the buffers do
        let expected_buffer_info = vec![false; fields.len() * num_buffers];

        // all nodes have same structure aside from data-size determined by if Time32 or Time64
        let expected_node_info: Vec<meta::NodeStatic> = unit_byte_sizes
            .iter()
            .map(|&unit_byte_size| {
                meta::NodeStatic::new(1, vec![
                    BufferType::BitMap {
                        is_null_bitmap: true,
                    },
                    BufferType::Data { unit_byte_size },
                ])
            })
            .collect();

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns, entries don't matter as we're only interested in the
        // structure, Arrow stores time data as i32 or i64's
        let time64_nanosecond_array =
            arrow::array::Time64NanosecondArray::from(vec![1, 2, 3, 4, 5, 6]);
        let time64_microsecond_array =
            arrow::array::Time64MicrosecondArray::from(vec![1, 2, 3, 4, 5, 6]);
        let time32_millisecond_array =
            arrow::array::Time32MillisecondArray::from(vec![1, 2, 3, 4, 5, 6]);
        let time32_second_array = arrow::array::Time32SecondArray::from(vec![1, 2, 3, 4, 5, 6]);

        let dummy_data_arrays: Vec<&dyn ArrowArray> = vec![
            &time64_nanosecond_array,
            &time64_microsecond_array,
            &time32_millisecond_array,
            &time32_second_array,
        ];

        for (arrow_array, column_meta) in
            dummy_data_arrays.into_iter().zip(expected_col_info.iter())
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn date_dtypes_schema_to_col_hierarchy() {
        let mut fields = vec![];
        let mut unit_byte_sizes = vec![];

        for date_dtype in [D::Date32, D::Date64] {
            match date_dtype {
                // data buffer size is independent of DateUnit
                D::Date32 => unit_byte_sizes.push(4),
                D::Date64 => unit_byte_sizes.push(8),
                _ => unimplemented!(),
            }

            fields.push(Field::new(&format!("c{}", fields.len()), date_dtype, false));
        }

        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());
        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        // all fields are one node, with each node having 2 buffers
        let num_buffers = 2;
        let expected_col_info: Vec<ColumnMeta> = (0..fields.len())
            .map(|idx| ColumnMeta {
                node_start: idx,
                node_count: 1,
                buffer_start: idx * num_buffers,
                buffer_count: num_buffers,
                root_node_mapping: NodeMapping::empty(),
                buffer_counts: vec![num_buffers],
            })
            .collect();

        // none of the nodes have growable components and therefore none of the buffers do
        let expected_buffer_info = vec![false; fields.len() * num_buffers];

        // all nodes have same structure aside from data-size determined by if Date32 or Date64
        let expected_node_info: Vec<meta::NodeStatic> = unit_byte_sizes
            .iter()
            .map(|&unit_byte_size| {
                meta::NodeStatic::new(1, vec![
                    BufferType::BitMap {
                        is_null_bitmap: true,
                    },
                    BufferType::Data { unit_byte_size },
                ])
            })
            .collect();

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns, entries don't matter as we're only interested in the
        // structure, Arrow stores date data as i32 or i64's
        let date32_array = arrow::array::Date32Array::from(vec![1, 2, 3, 4, 5, 6]);
        let date64_array = arrow::array::Date64Array::from(vec![1, 2, 3, 4, 5, 6]);

        let dummy_data_arrays: Vec<&dyn ArrowArray> = vec![
            &date32_array,
            &date32_array, /* duplicate to match schema as underlying unit doesn't affect memory
                            * layout */
            &date64_array,
            &date64_array,
        ];

        for (arrow_array, column_meta) in
            dummy_data_arrays.into_iter().zip(expected_col_info.iter())
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn duration_dtypes_schema_to_col_hierarchy() {
        let fields: Vec<Field> = [
            TimeUnit::Nanosecond,
            TimeUnit::Microsecond,
            TimeUnit::Millisecond,
            TimeUnit::Second,
        ]
        .iter()
        .enumerate()
        .map(|(idx, time_unit)| {
            let duration_type = D::Duration(time_unit.clone());
            Field::new(&format!("c{}", idx), duration_type, false)
        })
        .collect();

        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());
        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        // all fields are one node, with each node having 2 buffers
        let num_buffers = 2;
        let expected_col_info: Vec<ColumnMeta> = (0..fields.len())
            .map(|idx| ColumnMeta {
                node_start: idx,
                node_count: 1,
                buffer_start: idx * num_buffers,
                buffer_count: num_buffers,
                root_node_mapping: NodeMapping::empty(),
                buffer_counts: vec![num_buffers],
            })
            .collect();

        // none of the nodes have growable components and therefore none of the buffers do
        let expected_buffer_info = vec![false; fields.len() * num_buffers];

        // all nodes have same structure
        let expected_node_info: Vec<meta::NodeStatic> = (0..fields.len())
            .map(|_| {
                meta::NodeStatic::new(1, vec![
                    BufferType::BitMap {
                        is_null_bitmap: true,
                    },
                    BufferType::Data { unit_byte_size: 8 },
                ])
            })
            .collect();

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns, entries don't matter as we're only interested in the
        // structure, Arrow stores duration data as i64's
        let duration_nanosecond_array =
            arrow::array::DurationNanosecondArray::from(vec![1, 2, 3, 4, 5, 6]);
        let duration_microsecond_array =
            arrow::array::DurationMicrosecondArray::from(vec![1, 2, 3, 4, 5, 6]);
        let duration_millisecond_array =
            arrow::array::DurationMillisecondArray::from(vec![1, 2, 3, 4, 5, 6]);
        let duration_second_array = arrow::array::DurationSecondArray::from(vec![1, 2, 3, 4, 5, 6]);

        let dummy_data_arrays: Vec<&dyn ArrowArray> = vec![
            &duration_nanosecond_array,
            &duration_microsecond_array,
            &duration_millisecond_array,
            &duration_second_array,
        ];

        for (arrow_array, column_meta) in
            dummy_data_arrays.into_iter().zip(expected_col_info.iter())
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn interval_dtypes_schema_to_col_hierarchy() {
        let mut fields = vec![];
        let mut unit_byte_sizes = vec![];

        for interval_unit in [
            IntervalUnit::DayTime,
            IntervalUnit::YearMonth,
            IntervalUnit::MonthDayNano,
        ] {
            let interval_type = D::Interval(interval_unit.clone());
            fields.push(Field::new(
                &format!("c{}", fields.len()),
                interval_type,
                false,
            ));

            // databuffer size is dependent on IntervalUnit
            unit_byte_sizes.push(match interval_unit {
                IntervalUnit::YearMonth => 4,
                IntervalUnit::DayTime => 8,
                IntervalUnit::MonthDayNano => 16,
            })
        }

        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());
        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        // all fields are one node, with each node having 2 buffers
        let num_buffers = 2;
        let expected_col_info: Vec<ColumnMeta> = (0..fields.len())
            .map(|idx| ColumnMeta {
                node_start: idx,
                node_count: 1,
                buffer_start: idx * num_buffers,
                buffer_count: num_buffers,
                root_node_mapping: NodeMapping::empty(),
                buffer_counts: vec![num_buffers],
            })
            .collect();

        // none of the nodes have growable components and therefore none of the buffers do
        let expected_buffer_info = vec![false; fields.len() * num_buffers];

        // all nodes have same structure aside from data-size determined by interval unit
        let expected_node_info: Vec<meta::NodeStatic> = unit_byte_sizes
            .iter()
            .map(|&unit_byte_size| {
                meta::NodeStatic::new(1, vec![
                    BufferType::BitMap {
                        is_null_bitmap: true,
                    },
                    BufferType::Data { unit_byte_size },
                ])
            })
            .collect();

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns, entries don't matter as we're only interested in the
        // structure, Arrow stores interval data as i32 and i64's
        let interval_day_time_array =
            arrow::array::IntervalDayTimeArray::from(vec![1, 2, 3, 4, 5, 6]);
        let interval_year_month_array =
            arrow::array::IntervalYearMonthArray::from(vec![1, 2, 3, 4, 5, 6]);

        let dummy_data_arrays: Vec<&dyn ArrowArray> =
            vec![&interval_day_time_array, &interval_year_month_array];

        for (arrow_array, column_meta) in
            dummy_data_arrays.into_iter().zip(expected_col_info.iter())
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn timestamp_dtypes_schema_to_col_hierarchy() {
        let mut fields = vec![];

        for time_unit in [
            TimeUnit::Nanosecond,
            TimeUnit::Microsecond,
            TimeUnit::Millisecond,
            TimeUnit::Second,
        ] {
            for time_zone in [
                Some("UTC".to_string()),
                Some("Africa/Johannesburg".to_string()),
                None,
            ] {
                fields.push(Field::new(
                    &format!("c{}", fields.len()),
                    D::Timestamp(time_unit.clone(), time_zone),
                    false,
                ));
            }
        }

        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());
        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        // all fields are one node, with each node having 2 buffers
        let num_buffers = 2;
        let expected_col_info: Vec<ColumnMeta> = (0..fields.len())
            .map(|idx| ColumnMeta {
                node_start: idx,
                node_count: 1,
                buffer_start: idx * num_buffers,
                buffer_count: num_buffers,
                root_node_mapping: NodeMapping::empty(),
                buffer_counts: vec![num_buffers],
            })
            .collect();

        // all nodes have same structure
        let expected_node_info: Vec<meta::NodeStatic> = (0..fields.len())
            .map(|_| {
                meta::NodeStatic::new(1, vec![
                    BufferType::BitMap {
                        is_null_bitmap: true,
                    },
                    BufferType::Data { unit_byte_size: 8 },
                ])
            })
            .collect();

        let expected_buffer_info = vec![false; fields.len() * num_buffers];

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns, entries don't matter as we're only interested in the
        // structure, Arrow stores timestamp data as  i64's
        let timestamp_microsecond_array =
            arrow::array::TimestampMicrosecondArray::from(vec![1, 2, 3, 4, 5, 6]);
        let timestamp_millisecond_array =
            arrow::array::TimestampMillisecondArray::from(vec![1, 2, 3, 4, 5, 6]);

        // our version of arrow is missing calls to the macro to create the arrays from vec's
        let mut timestamp_nanosecond_buffer_builder =
            arrow::array::TimestampNanosecondBuilder::new(6);
        timestamp_nanosecond_buffer_builder
            .append_values(&vec![1, 2, 3, 4, 5, 6], &vec![true; 6])
            .unwrap();
        let timestamp_nanosecond_array = timestamp_nanosecond_buffer_builder.finish();

        let mut timestamp_second_buffer_builder = arrow::array::TimestampSecondBuilder::new(6);
        timestamp_second_buffer_builder
            .append_values(&vec![1, 2, 3, 4, 5, 6], &vec![true; 6])
            .unwrap();
        let timestamp_second_array = timestamp_second_buffer_builder.finish();

        let dummy_data_arrays: Vec<&dyn ArrowArray> = vec![
            &timestamp_nanosecond_array,
            &timestamp_microsecond_array,
            &timestamp_millisecond_array,
            &timestamp_second_array,
        ];

        for (arrow_array, column_meta) in
            dummy_data_arrays.into_iter().zip(expected_col_info.iter())
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn fixed_size_binary_dtype_schema_to_col_hierarchy() {
        // try a variety of sizes
        let fixed_sizes = [2, 3, 6, 8];
        let fields: Vec<Field> = fixed_sizes
            .iter()
            .enumerate()
            .map(|(idx, &size)| Field::new(&format!("c{}", idx), D::FixedSizeBinary(size), false))
            .collect();

        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());
        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        // all fields are one node, with each node having 2 buffers
        let num_buffers = 2;
        let expected_col_info: Vec<ColumnMeta> = (0..fields.len())
            .map(|idx| ColumnMeta {
                node_start: idx,
                node_count: 1,
                buffer_start: idx * num_buffers,
                buffer_count: num_buffers,
                root_node_mapping: NodeMapping::empty(),
                buffer_counts: vec![num_buffers],
            })
            .collect();

        // none of the nodes have growable components and therefore none of the buffers do
        let expected_buffer_info = vec![false; fields.len() * num_buffers];

        // all nodes have same structure aside from data-size which is determined by the fixed size
        let expected_node_info: Vec<meta::NodeStatic> = fixed_sizes
            .iter()
            .map(|&fixed_size| {
                meta::NodeStatic::new(1, vec![
                    BufferType::BitMap {
                        is_null_bitmap: true,
                    },
                    BufferType::Data {
                        unit_byte_size: fixed_size as usize,
                    },
                ])
            })
            .collect();

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns, entries don't matter as we're only interested in the
        // structure,
        let dummy_data_arrays: Vec<arrow::array::FixedSizeBinaryArray> = fixed_sizes
            .iter()
            .map(|&size| {
                let mut fixed_size_binary_builder =
                    arrow::array::FixedSizeBinaryBuilder::new(6, size);
                fixed_size_binary_builder
                    .append_value(&vec![3u8; size as usize])
                    .unwrap();
                fixed_size_binary_builder.finish()
            })
            .collect();

        for (arrow_array, (column_meta, node_info)) in dummy_data_arrays
            .into_iter()
            .zip(expected_col_info.iter().zip(expected_node_info.iter()))
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(&arrow_array, std::slice::from_ref(node_info));
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn variable_length_base_dtypes_schema_to_col_hierarchy() {
        let fields = vec![
            Field::new("c0", D::Utf8, false),
            Field::new("c1", D::Binary, false),
        ];
        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());

        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        // all fields are one node, with each node having 3 buffers
        let num_buffers = 3;
        let expected_col_info: Vec<ColumnMeta> = (0..fields.len())
            .map(|idx| ColumnMeta {
                node_start: idx,
                node_count: 1,
                buffer_start: idx * num_buffers,
                buffer_count: num_buffers,
                root_node_mapping: NodeMapping::empty(),
                buffer_counts: vec![num_buffers],
            })
            .collect();

        // we expect every third buffer to be resizeable
        let expected_buffer_info: Vec<bool> = (0..fields.len())
            .flat_map(|_| [false, false, true])
            .collect();

        // all nodes have the same structure
        let expected_node_info: Vec<meta::NodeStatic> = (0..fields.len())
            .map(|_| {
                meta::NodeStatic::new(1, vec![
                    BufferType::BitMap {
                        is_null_bitmap: true,
                    },
                    BufferType::Offset,
                    BufferType::Data { unit_byte_size: 1 },
                ])
            })
            .collect();

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns, entries don't matter as we're only interested in the
        // structure,
        let mut string_builder = arrow::array::StringBuilder::new(6);
        for string in ["one", "two", "three", "four", "five", "six"] {
            string_builder.append_value(string).unwrap();
        }
        let string_array = string_builder.finish();

        let mut binary_builder = arrow::array::BinaryBuilder::new(6);
        binary_builder.append_value(&vec![3u8; 6]).unwrap();
        let binary_array = binary_builder.finish();

        let dummy_data_arrays: Vec<&dyn ArrowArray> = vec![&string_array, &binary_array];

        for (arrow_array, column_meta) in
            dummy_data_arrays.into_iter().zip(expected_col_info.iter())
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn list_dtype_schema_to_col_hierarchy() {
        let fields = vec![
            Field::new(
                "c0",
                D::List(Box::new(Field::new("item", D::Boolean, true))),
                false,
            ),
            Field::new(
                "c1",
                D::List(Box::new(Field::new("item", D::UInt32, true))),
                false,
            ),
        ];

        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());

        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        // set up expected col hierarchy data

        // num nodes and buffers per field
        let num_nodes = 2; // each list has a node with a nested node
        let num_buffers_per_node = 2; // each selected node happens to have 2 buffers

        let expected_col_info: Vec<ColumnMeta> = (0..fields.len())
            .map(|idx| ColumnMeta {
                node_start: idx * num_nodes,
                node_count: num_nodes,
                buffer_start: idx * num_buffers_per_node * num_nodes,
                buffer_count: num_buffers_per_node * num_nodes,
                root_node_mapping: NodeMapping::singleton(NodeMapping::empty()),
                buffer_counts: (0..num_nodes)
                    .flat_map(|_| vec![num_buffers_per_node])
                    .collect(),
            })
            .collect();

        let expected_buffer_info: Vec<bool> = (0..fields.len())
            .flat_map(|_| {
                vec![
                    false, false, // parent list node has 2 buffers without growable parent
                    true, true, // child node has 2 buffers with growable parent
                ]
            })
            .collect();

        let expected_node_info: Vec<meta::NodeStatic> = vec![
            // List Node "c0"
            meta::NodeStatic::new(1, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
                BufferType::Offset,
            ]),
            // Bool Node
            meta::NodeStatic::new(1, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
                BufferType::BitMap {
                    is_null_bitmap: false,
                },
            ]),
            // List Node "c1"
            meta::NodeStatic::new(1, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
                BufferType::Offset,
            ]),
            // UInt32 Node
            meta::NodeStatic::new(1, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
                BufferType::Data { unit_byte_size: 4 },
            ]),
        ];

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns, entries don't matter as we're only interested in the
        // structure,
        let capacity = 6;
        let bool_builder = arrow::array::BooleanBuilder::new(capacity);
        let mut bool_list_builder = arrow::array::ListBuilder::new(bool_builder);
        for _ in 0..4 {
            for val in vec![true; capacity] {
                bool_list_builder.values().append_value(val).unwrap();
            }
            bool_list_builder.append(true).unwrap();
        }
        let bool_list = bool_list_builder.finish();

        let uint32_builder = arrow::array::UInt32Builder::new(capacity);
        let mut uint32_list_builder = arrow::array::ListBuilder::new(uint32_builder);
        for _ in 0..4 {
            for val in 0..capacity {
                uint32_list_builder
                    .values()
                    .append_value(val as u32)
                    .unwrap();
            }
            uint32_list_builder.append(true).unwrap();
        }
        let uint32_list = uint32_list_builder.finish();

        let dummy_data_arrays: Vec<&dyn ArrowArray> = vec![&bool_list, &uint32_list];

        for (arrow_array, column_meta) in
            dummy_data_arrays.into_iter().zip(expected_col_info.iter())
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }

    #[test]
    fn struct_dtypes_schema_to_col_hierarchy() {
        let fields = vec![
            Field::new(
                "c0",
                D::Struct(vec![
                    Field::new("a", D::Utf8, false),
                    Field::new("b", D::Boolean, false),
                ]),
                false,
            ),
            Field::new("c1", D::Struct(vec![]), false),
        ];

        let schema = Schema::new_with_metadata(fields.clone(), get_dummy_metadata());

        let (column_info, buffer_info, node_info) = schema_to_column_hierarchy(Arc::new(schema));

        let expected_col_info = vec![
            // "c0"
            ColumnMeta {
                node_start: 0,
                node_count: 3, // 1 parent struct node + 2 child nodes
                buffer_start: 0,
                buffer_count: 6,
                root_node_mapping: NodeMapping(vec![NodeMapping::empty(), NodeMapping::empty()]),
                buffer_counts: vec![
                    1, // struct "c0"
                    3, // utf8 "a"
                    2, // boolean "b"
                ],
            },
            // "c1"
            ColumnMeta {
                node_start: 3,
                node_count: 1, // 1 parent struct node
                buffer_start: 6,
                buffer_count: 1,
                root_node_mapping: NodeMapping::empty(),
                buffer_counts: vec![1],
            },
        ];

        let expected_buffer_info = vec![
            false, // struct "c0" doesn't have a growable parent
            false, false,
            true, // utf8 "a" doesn't have a growable parent but its child buffer does
            false, false, // boolean "b" doesn't have a growable parent
            false, // struct "c1" doesn't have a growable parent
        ];

        let expected_node_info = vec![
            // struct "c0"
            meta::NodeStatic::new(1, vec![BufferType::BitMap {
                is_null_bitmap: true,
            }]),
            // utf8 "a"
            meta::NodeStatic::new(1, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
                BufferType::Offset,
                BufferType::Data { unit_byte_size: 1 },
            ]),
            // bool "b"
            meta::NodeStatic::new(1, vec![
                BufferType::BitMap {
                    is_null_bitmap: true,
                },
                BufferType::BitMap {
                    is_null_bitmap: false,
                },
            ]),
            // struct "c1"
            meta::NodeStatic::new(1, vec![BufferType::BitMap {
                is_null_bitmap: true,
            }]),
        ];

        assert_eq!(column_info, expected_col_info);
        assert_eq!(buffer_info, expected_buffer_info);
        assert_eq!(node_info, expected_node_info);

        // Now check that the extracted column metadata for the schema matches the underlying Arrow
        // array's metadata once created

        // set up dummy data columns, entries don't matter as we're only interested in the
        // structure,
        let mut string_builder = arrow::array::StringBuilder::new(6);
        for string in ["one", "two", "three", "four", "five", "six"] {
            string_builder.append_value(string).unwrap();
        }
        let string_array = string_builder.finish();

        let bool_array = arrow::array::BooleanArray::from(vec![true, true, true, true, true, true]);

        let struct_c0 = arrow::array::StructArray::from(vec![
            (
                Field::new("a", D::Utf8, false),
                Arc::new(string_array) as ArrayRef,
            ),
            (
                Field::new("b", D::Boolean, false),
                Arc::new(bool_array) as ArrayRef,
            ),
        ]);

        let struct_c1 = arrow::array::StructArray::from(
            ArrowArrayData::builder(D::Struct(vec![])).build().unwrap(),
        );

        let dummy_data_arrays: Vec<&dyn ArrowArray> = vec![&struct_c0, &struct_c1];

        for (arrow_array, column_meta) in
            dummy_data_arrays.into_iter().zip(expected_col_info.iter())
        {
            let (node_count, buffer_counts, node_mapping) =
                get_col_hierarchy_from_arrow_array(arrow_array, expected_node_info.as_slice());
            let buffer_count: usize = buffer_counts.iter().sum();

            assert_eq!(node_count, column_meta.node_count);
            assert_eq!(buffer_count, column_meta.buffer_count);
            assert_eq!(buffer_counts, column_meta.buffer_counts);
            assert_eq!(node_mapping, column_meta.root_node_mapping);
        }
    }
}
