use arrow2::{array::Array, datatypes::UnionMode};

// only used in tests (at the moment)
/// As per <https://arrow.apache.org/docs/format/Columnar.html#buffer-listing-for-each-layout>
#[cfg_attr(not(test), allow(dead_code))]
// this is necessary, because GrowableArrayData is implemented for Box<dyn Array> but not
// &dyn Array
#[allow(clippy::borrowed_box)]
pub(crate) fn buffer_count_of_arrow_array(array: &Box<dyn Array>) -> usize {
    match array.data_type() {
        arrow2::datatypes::DataType::Null => 0,
        // primitive arrays
        arrow2::datatypes::DataType::Boolean
        | arrow2::datatypes::DataType::Int8
        | arrow2::datatypes::DataType::Int16
        | arrow2::datatypes::DataType::Int32
        | arrow2::datatypes::DataType::Int64
        | arrow2::datatypes::DataType::UInt8
        | arrow2::datatypes::DataType::UInt16
        | arrow2::datatypes::DataType::UInt32
        | arrow2::datatypes::DataType::UInt64
        | arrow2::datatypes::DataType::Float16
        | arrow2::datatypes::DataType::Float32
        | arrow2::datatypes::DataType::Float64 => 1,
        // variable sized binary
        arrow2::datatypes::DataType::Binary | arrow2::datatypes::DataType::LargeBinary => 2,
        // fixed-size binary only has a validity
        arrow2::datatypes::DataType::FixedSizeBinary(_) => 1,
        // lists have an offsets and a values buffer
        arrow2::datatypes::DataType::Utf8 | arrow2::datatypes::DataType::LargeUtf8 => 2,
        arrow2::datatypes::DataType::List(_) | arrow2::datatypes::DataType::LargeList(_) => 1,
        arrow2::datatypes::DataType::FixedSizeList(..) => 0,
        // struct arrays only have a validity buffer
        arrow2::datatypes::DataType::Struct(_) => 0,
        arrow2::datatypes::DataType::Union(_, _, UnionMode::Sparse) => 1,
        arrow2::datatypes::DataType::Union(_, _, UnionMode::Dense) => 2,
        arrow2::datatypes::DataType::Map(..) => todo!(),
        arrow2::datatypes::DataType::Dictionary(..) => 1,
        arrow2::datatypes::DataType::Decimal(..) => todo!(),
        arrow2::datatypes::DataType::Extension(..) => todo!(),
        // todo: implement
        arrow2::datatypes::DataType::Timestamp(..)
        | arrow2::datatypes::DataType::Date32
        | arrow2::datatypes::DataType::Date64
        | arrow2::datatypes::DataType::Time32(_)
        | arrow2::datatypes::DataType::Time64(_)
        | arrow2::datatypes::DataType::Duration(_)
        | arrow2::datatypes::DataType::Interval(_) => todo!(),
    }
}
