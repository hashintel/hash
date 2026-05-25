use alloc::{alloc::Global, rc::Rc};
use core::ops::Bound;

use bytes::BytesMut;
use hashql_core::heap::Heap;
use hashql_mir::{
    intern::Interner,
    interpret::{
        suspension::{TemporalInterval, Timestamp},
        value::{self, Value},
    },
};
use postgres_types::ToSql as _;

use super::{Postgres, Serde, serialize_value};

fn to_json_string(value: &Value<'_, Global>) -> String {
    serde_json::to_string(&Serde(value)).expect("should succeed")
}

#[test]
fn serialize_boolean_true() {
    let value = Value::<Global>::Integer(value::Int::from(true));
    assert_eq!(to_json_string(&value), "true");
}

#[test]
fn serialize_boolean_false() {
    let value = Value::<Global>::Integer(value::Int::from(false));
    assert_eq!(to_json_string(&value), "false");
}

#[test]
fn serialize_integer() {
    let value = Value::<Global>::Integer(value::Int::from(42_i128));
    assert_eq!(to_json_string(&value), "42");
}

#[test]
fn serialize_integer_one_not_as_bool() {
    // Int::from(1_i32) has size=128, not size=1.
    // Must serialize as numeric 1, not as boolean true.
    let value = Value::<Global>::Integer(value::Int::from(1_i32));
    assert_eq!(to_json_string(&value), "1");
}

#[test]
fn serialize_integer_zero_not_as_bool() {
    // Int::from(0_i32) has size=128, not size=1.
    // Must serialize as numeric 0, not as boolean false.
    let value = Value::<Global>::Integer(value::Int::from(0_i32));
    assert_eq!(to_json_string(&value), "0");
}

#[test]
fn serialize_number() {
    let value = Value::<Global>::Number(value::Num::from(2.72));
    assert_eq!(to_json_string(&value), "2.72");
}

#[test]
fn serialize_string() {
    let value = Value::<Global>::String(value::Str::from(Rc::<str>::from("hello")));
    assert_eq!(to_json_string(&value), "\"hello\"");
}

#[test]
fn serialize_unit() {
    let value = Value::<Global>::Unit;
    assert_eq!(to_json_string(&value), "null");
}

#[test]
fn serialize_opaque_unwraps() {
    let inner = Value::<Global>::Integer(value::Int::from(42_i128));
    let value = Value::Opaque(value::Opaque::new(
        hashql_core::symbol::sym::path::Entity,
        Rc::new(inner),
    ));
    assert_eq!(to_json_string(&value), "42");
}

#[test]
fn serialize_tuple_as_array() {
    let tuple = value::Tuple::new(alloc::vec![
        Value::<Global>::Integer(value::Int::from(1_i128)),
        Value::Integer(value::Int::from(2_i128)),
    ])
    .expect("should succeed");

    let value = Value::Tuple(tuple);
    assert_eq!(to_json_string(&value), "[1,2]");
}

#[test]
fn serialize_list() {
    let mut list = value::List::<Global>::new();
    list.push_back(Value::Integer(value::Int::from(1_i128)));
    list.push_back(Value::Integer(value::Int::from(2_i128)));

    let value = Value::List(list);
    assert_eq!(to_json_string(&value), "[1,2]");
}

#[test]
fn serialize_struct_as_map() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);

    let fields = interner
        .symbols
        .intern_slice(&[heap.intern_symbol("name"), heap.intern_symbol("value")]);

    let values = alloc::vec![
        Value::<Global>::String(value::Str::from(Rc::<str>::from("Alice"))),
        Value::Integer(value::Int::from(42_i128)),
    ];

    let struct_value = value::Struct::new(fields, values).expect("should succeed");
    let value = Value::Struct(struct_value);
    let json = to_json_string(&value);

    let parsed: serde_json::Value = serde_json::from_str(&json).expect("should succeed");
    let object = parsed.as_object().expect("should be an object");
    assert_eq!(object.len(), 2);
    assert_eq!(parsed["name"], "Alice");
    assert_eq!(parsed["value"], 42);
}

#[test]
fn serialize_pointer_fails() {
    let value = Value::<Global>::Pointer(value::Ptr::new(hashql_mir::def::DefId::new(0)));
    let result = serde_json::to_string(&Serde(&value));
    assert!(result.is_err(), "pointer values should not be serializable");
}

#[test]
fn serialize_value_produces_raw_json() {
    let value = Value::<Global>::Integer(value::Int::from(42_i128));
    let result = serialize_value(&value).expect("should succeed");
    assert_eq!(result.0.get(), "42");
}

#[test]
fn timestamp_to_sql_known_epoch() {
    let mut buffer = BytesMut::new();

    // 2000-01-01T00:00:00Z in milliseconds since Unix epoch = 946684800000
    let timestamp = Timestamp::from(value::Int::from(946_684_800_000_i128));
    Postgres(timestamp)
        .to_sql(&postgres_types::Type::TIMESTAMPTZ, &mut buffer)
        .expect("should succeed");

    // Should encode as 0 microseconds since the postgres epoch (2000-01-01)
    assert_eq!(buffer.len(), 8);
    #[expect(
        clippy::big_endian_bytes,
        reason = "postgres wire format is big-endian"
    )]
    let encoded = i64::from_be_bytes(buffer[..8].try_into().expect("should succeed"));
    assert_eq!(encoded, 0);
}

#[test]
fn timestamp_to_sql_one_second_after_epoch() {
    let mut buffer = BytesMut::new();

    // 2000-01-01T00:00:01Z = 946684801000 ms since Unix epoch
    let timestamp = Timestamp::from(value::Int::from(946_684_801_000_i128));
    Postgres(timestamp)
        .to_sql(&postgres_types::Type::TIMESTAMPTZ, &mut buffer)
        .expect("should succeed");

    #[expect(
        clippy::big_endian_bytes,
        reason = "postgres wire format is big-endian"
    )]
    let encoded = i64::from_be_bytes(buffer[..8].try_into().expect("should succeed"));
    // 1 second = 1_000_000 microseconds
    assert_eq!(encoded, 1_000_000);
}

#[test]
fn temporal_interval_point_encodes() {
    let mut buffer = BytesMut::new();

    let timestamp = Timestamp::from(value::Int::from(946_684_800_000_i128));
    let interval = TemporalInterval {
        start: Bound::Included(timestamp),
        end: Bound::Included(timestamp),
    };

    Postgres(interval)
        .to_sql(&postgres_types::Type::TSTZ_RANGE, &mut buffer)
        .expect("should succeed");

    // Range wire format: 1 byte flags + lower bound (4 byte len + 8 byte data) +
    // upper bound (4 byte len + 8 byte data) = 25 bytes for two inclusive timestamps
    assert_eq!(buffer.len(), 25);

    // Flags byte: bit 1 (has lower) | bit 2 (has upper) | bit 2 (lower inclusive) |
    // bit 3 (upper inclusive) = 0x06 for [inclusive, inclusive]
    // (postgres_protocol range encoding details)
    let flags = buffer[0];
    assert_ne!(flags, 0, "flags should indicate both bounds are present");
}

#[test]
fn temporal_interval_unbounded_encodes() {
    let mut buffer = BytesMut::new();

    let interval = TemporalInterval {
        start: Bound::Unbounded,
        end: Bound::Unbounded,
    };

    Postgres(interval)
        .to_sql(&postgres_types::Type::TSTZ_RANGE, &mut buffer)
        .expect("should succeed");

    // Fully unbounded range: only 1 byte for flags
    assert_eq!(buffer.len(), 1);
}
