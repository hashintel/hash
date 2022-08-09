use std::{collections::BTreeMap, sync::Arc};

use arrow2::{
    array::{
        BooleanArray, FixedSizeBinaryArray, FixedSizeListArray, ListArray,
        MutableFixedSizeListArray, MutableListArray, MutablePrimitiveArray, PrimitiveArray,
        TryExtend, Utf8Array,
    },
    chunk::Chunk,
    datatypes::{DataType, Field, Schema},
};
use uuid::Uuid;

use super::read_record_batch;
use crate::{
    arrow::{ipc::write_record_batch_to_segment, record_batch::RecordBatch},
    shared_memory::MemoryId,
};

/// A test utility which serializes and deserializes a record batch, asserting
/// that the two record batches are the same.
fn round_trip(schema: Arc<Schema>, record_batch: RecordBatch) {
    let segment =
        write_record_batch_to_segment(&record_batch, &schema, MemoryId::new(Uuid::new_v4()))
            .unwrap();

    let read_record_batch =
        read_record_batch(&segment, schema).expect("failed to read the written record batch");
    // we could just use the `PartialEq` method on `RecordBatch`, but this results in nicer error
    // messages (sometimes the `Debug` representations of different arrays are identical, because
    // their datatypes are different.)
    assert_eq!(record_batch.schema(), read_record_batch.schema());
    for (before, after) in record_batch
        .columns()
        .iter()
        .zip(read_record_batch.columns())
    {
        assert_eq!(before.data_type(), after.data_type());
        assert_eq!(before, after);
    }
}

#[test]
/// Tests that we can serialize a single column and then read it.
fn simple_roundtrip() {
    let schema = Arc::new(Schema {
        fields: vec![Field::new("field1", DataType::Boolean, true)],
        metadata: BTreeMap::new(),
    });
    let record_batch = RecordBatch::new(
        schema.clone(),
        Chunk::new(vec![
            BooleanArray::from_slice(&[true, true, true, true, true]).arced(),
        ]),
    );

    round_trip(schema, record_batch);
}

#[test]
fn integer_roundtrip() {
    let schema = Arc::new(Schema {
        fields: vec![Field::new("field1", DataType::UInt32, false)],
        metadata: BTreeMap::new(),
    });
    let record_batch = RecordBatch::new(
        schema.clone(),
        Chunk::new(vec![
            PrimitiveArray::<u32>::from_slice(&[1, 2, 1, 2]).arced(),
        ]),
    );

    round_trip(schema, record_batch);
}

#[test]
fn fixed_sized_list_roundtrip() {
    let schema = Arc::new(Schema {
        fields: vec![Field::new(
            "field1",
            DataType::FixedSizeList(Box::new(Field::new("item", DataType::Int32, true)), 3),
            true,
        )],
        metadata: BTreeMap::new(),
    });
    let list_data = vec![Some(vec![Some(1), Some(1), Some(1)])];
    let mut list_array: MutableFixedSizeListArray<MutablePrimitiveArray<i32>> =
        MutableFixedSizeListArray::new(MutablePrimitiveArray::new(), 3);
    list_array.try_extend(list_data).unwrap();
    let list_array: FixedSizeListArray = list_array.into();

    let record_batch = RecordBatch::new(schema.clone(), Chunk::new(vec![list_array.arced()]));

    round_trip(schema, record_batch)
}

#[test]
fn utf8_roundrip() {
    let schema = Arc::new(Schema {
        fields: vec![Field::new("field1", DataType::Utf8, false)],
        metadata: BTreeMap::new(),
    });

    let record_batch = RecordBatch {
        schema: schema.clone(),
        columns: Chunk::new(vec![
            Utf8Array::<i32>::from_slice(&["one", "two", "three"]).arced(),
        ]),
    };

    round_trip(schema, record_batch);
}

#[test]
fn list_roundtrip() {
    let schema = Arc::new(Schema {
        fields: vec![Field::new(
            "field1",
            DataType::List(Box::new(Field::new("item", DataType::Int32, true))),
            true,
        )],
        metadata: BTreeMap::new(),
    });
    let list_data = vec![Some(vec![Some(1)])];
    let mut list_array: MutableListArray<i32, MutablePrimitiveArray<i32>> = MutableListArray::new();
    list_array.try_extend(list_data).unwrap();
    let list_array: ListArray<i32> = list_array.into();

    list_array
        .offsets()
        .as_slice()
        .iter()
        .fold(0, |previous, current| {
            assert!(*current >= previous);
            *current
        });

    let record_batch = RecordBatch::new(schema.clone(), Chunk::new(vec![list_array.arced()]));

    round_trip(schema, record_batch)
}

#[test]
fn fixed_size_binary_roundrip() {
    let schema = Arc::new(Schema {
        fields: vec![Field::new("field1", DataType::FixedSizeBinary(5), false)],
        metadata: BTreeMap::new(),
    });

    let record_batch = RecordBatch {
        schema: schema.clone(),
        columns: Chunk::new(vec![
            FixedSizeBinaryArray::from_slice(&[
                [0u8, 1u8, 12u8, 59u8, 212u8],
                [0u8, 121u8, 12u8, 59u8, 212u8],
                [0u8, 104u8, 202u8, 59u8, 212u8],
                [0u8, 122u8, 12u8, 59u8, 212u8],
            ])
            .arced(),
        ]),
    };

    round_trip(schema, record_batch)
}

#[test]
fn single_fixed_size_binary_roundtrip() {
    let schema = Arc::new(Schema {
        fields: vec![Field::new("field1", DataType::FixedSizeBinary(16), false)],
        metadata: BTreeMap::new(),
    });

    let record_batch = RecordBatch {
        schema: schema.clone(),
        columns: Chunk::new(vec![
            FixedSizeBinaryArray::from_slice(&[[
                44, 76, 252, 210, 92, 141, 68, 36, 129, 235, 57, 157, 47, 231, 116, 103,
            ]])
            .arced(),
        ]),
    };

    round_trip(schema, record_batch)
}

#[test]
fn multiple_columns() {
    let schema = Arc::new(Schema {
        fields: vec![
            Field::new("field2", DataType::Boolean, false),
            Field::new(
                "field1",
                DataType::List(Box::new(Field::new("item", DataType::Int32, true))),
                false,
            ),
        ],
        metadata: BTreeMap::new(),
    });

    let list_data = vec![
        Some(vec![Some(1), Some(2), Some(3), Some(5)]),
        Some(vec![Some(5), Some(2), Some(1), Some(1)]),
        Some(vec![
            Some(1),
            Some(1),
            Some(1),
            Some(2),
            Some(5),
            Some(16),
            Some(61),
            Some(272),
        ]),
        Some(vec![Some(1)]),
    ];
    let mut list_array: MutableListArray<i32, MutablePrimitiveArray<i32>> = MutableListArray::new();
    list_array.try_extend(list_data).unwrap();
    let list_array: ListArray<i32> = list_array.into();

    let record_batch = RecordBatch::new(
        schema.clone(),
        Chunk::new(vec![
            BooleanArray::from_slice(&[true, true, true, true]).arced(),
            list_array.arced(),
        ]),
    );

    round_trip(schema, record_batch);
}
