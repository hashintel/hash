use arrow2::datatypes::UnionMode;

/// Converts from an [`arrow::datatypes::DataType`] to an [`arrow2::datatypes::DataType`].
pub(crate) fn arrow2_datatype_of_arrow_datatype(
    arrow: arrow::datatypes::DataType,
) -> arrow2::datatypes::DataType {
    match arrow {
        arrow::datatypes::DataType::Null => arrow2::datatypes::DataType::Null,
        arrow::datatypes::DataType::Boolean => arrow2::datatypes::DataType::Boolean,
        arrow::datatypes::DataType::Int8 => arrow2::datatypes::DataType::Int8,
        arrow::datatypes::DataType::Int16 => arrow2::datatypes::DataType::Int16,
        arrow::datatypes::DataType::Int32 => arrow2::datatypes::DataType::Int32,
        arrow::datatypes::DataType::Int64 => arrow2::datatypes::DataType::Int64,
        arrow::datatypes::DataType::UInt8 => arrow2::datatypes::DataType::UInt8,
        arrow::datatypes::DataType::UInt16 => arrow2::datatypes::DataType::UInt16,
        arrow::datatypes::DataType::UInt32 => arrow2::datatypes::DataType::UInt32,
        arrow::datatypes::DataType::UInt64 => arrow2::datatypes::DataType::UInt64,
        arrow::datatypes::DataType::Float16 => arrow2::datatypes::DataType::Float16,
        arrow::datatypes::DataType::Float32 => arrow2::datatypes::DataType::Float32,
        arrow::datatypes::DataType::Float64 => arrow2::datatypes::DataType::Float64,
        arrow::datatypes::DataType::Timestamp(timestamp, name) => {
            arrow2::datatypes::DataType::Timestamp(
                arrow2_timestamp_of_arrow_timestamp(timestamp),
                name,
            )
        }
        arrow::datatypes::DataType::Date32 => arrow2::datatypes::DataType::Date32,
        arrow::datatypes::DataType::Date64 => arrow2::datatypes::DataType::Date64,
        arrow::datatypes::DataType::Time32(t) => {
            arrow2::datatypes::DataType::Time32(arrow2_timestamp_of_arrow_timestamp(t))
        }
        arrow::datatypes::DataType::Time64(t) => {
            arrow2::datatypes::DataType::Time64(arrow2_timestamp_of_arrow_timestamp(t))
        }
        arrow::datatypes::DataType::Duration(duration) => {
            arrow2::datatypes::DataType::Duration(arrow2_timestamp_of_arrow_timestamp(duration))
        }
        arrow::datatypes::DataType::Interval(_) => {
            todo!()
        }
        arrow::datatypes::DataType::Binary => arrow2::datatypes::DataType::Binary,
        arrow::datatypes::DataType::FixedSizeBinary(size) => {
            arrow2::datatypes::DataType::FixedSizeBinary(size as usize)
        }
        arrow::datatypes::DataType::LargeBinary => arrow2::datatypes::DataType::LargeBinary,
        arrow::datatypes::DataType::Utf8 => arrow2::datatypes::DataType::Utf8,
        arrow::datatypes::DataType::LargeUtf8 => arrow2::datatypes::DataType::LargeUtf8,
        arrow::datatypes::DataType::List(list) => {
            arrow2::datatypes::DataType::List(Box::new(arrow2_field_of_arrow_field(list.as_ref())))
        }
        arrow::datatypes::DataType::FixedSizeList(field, size) => {
            arrow2::datatypes::DataType::FixedSizeList(
                Box::new(arrow2_field_of_arrow_field(field.as_ref())),
                size as usize,
            )
        }
        arrow::datatypes::DataType::LargeList(field) => arrow2::datatypes::DataType::LargeList(
            Box::new(arrow2_field_of_arrow_field(field.as_ref())),
        ),
        arrow::datatypes::DataType::Struct(s) => {
            arrow2::datatypes::DataType::Struct(s.iter().map(arrow2_field_of_arrow_field).collect())
        }
        arrow::datatypes::DataType::Union(union, _, mode) => {
            // todo: this is definitey wrong (but we don't currently use it)
            arrow2::datatypes::DataType::Union(
                union.iter().map(arrow2_field_of_arrow_field).collect(),
                None,
                match mode {
                    arrow::datatypes::UnionMode::Sparse => UnionMode::Sparse,
                    arrow::datatypes::UnionMode::Dense => UnionMode::Dense,
                },
            )
        }
        arrow::datatypes::DataType::Dictionary(..) => {
            todo!()
        }
        arrow::datatypes::DataType::Decimal128(precision, scale) => {
            arrow2::datatypes::DataType::Decimal(precision, scale)
        }
        arrow::datatypes::DataType::Decimal256(precision, scale) => {
            arrow2::datatypes::DataType::Decimal(precision, scale)
        }
        arrow::datatypes::DataType::Map(field, sorted) => arrow2::datatypes::DataType::Map(
            Box::new(arrow2_field_of_arrow_field(field.as_ref())),
            sorted,
        ),
    }
}

fn arrow2_field_of_arrow_field(field: &arrow::datatypes::Field) -> arrow2::datatypes::Field {
    arrow2::datatypes::Field::new(
        field.name(),
        arrow2_datatype_of_arrow_datatype(field.data_type().clone()),
        field.is_nullable(),
    )
}

fn arrow2_timestamp_of_arrow_timestamp(
    timestamp: arrow::datatypes::TimeUnit,
) -> arrow2::datatypes::TimeUnit {
    match timestamp {
        arrow::datatypes::TimeUnit::Second => arrow2::datatypes::TimeUnit::Second,
        arrow::datatypes::TimeUnit::Millisecond => arrow2::datatypes::TimeUnit::Millisecond,
        arrow::datatypes::TimeUnit::Microsecond => arrow2::datatypes::TimeUnit::Microsecond,
        arrow::datatypes::TimeUnit::Nanosecond => arrow2::datatypes::TimeUnit::Nanosecond,
    }
}
