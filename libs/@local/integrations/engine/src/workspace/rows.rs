use duckdb::{
    arrow::datatypes::{DataType, IntervalUnit, TimeUnit},
    types::Value,
};

/// The rows a query returned.
#[derive(Debug)]
pub struct Rows {
    columns: Box<[Box<str>]>,
    rows: Vec<Box<[Value]>>,
}

impl Rows {
    pub(super) const fn new(columns: Box<[Box<str>]>, rows: Vec<Box<[Value]>>) -> Self {
        Self { columns, rows }
    }

    /// Returns whether the `duckdb` crate reads values of `data_type` without panicking.
    ///
    /// The `duckdb` crate panics on DuckDB's `TIME_NS`, which arrives as `Time64(Nanosecond)`, also
    /// inside a list, struct, map or union. The other types that return `false` are ones DuckDB
    /// does not return.
    pub(super) fn readable(data_type: &DataType) -> bool {
        match data_type {
            DataType::Utf8
            | DataType::LargeUtf8
            | DataType::Binary
            | DataType::LargeBinary
            | DataType::FixedSizeBinary(_)
            | DataType::Boolean
            | DataType::Int8
            | DataType::Int16
            | DataType::Int32
            | DataType::Int64
            | DataType::UInt8
            | DataType::UInt16
            | DataType::UInt32
            | DataType::UInt64
            | DataType::Float16
            | DataType::Float32
            | DataType::Float64
            | DataType::Decimal32(..)
            | DataType::Decimal64(..)
            | DataType::Decimal128(..)
            | DataType::Timestamp(..)
            | DataType::Date32
            | DataType::Time64(TimeUnit::Microsecond)
            | DataType::Interval(IntervalUnit::MonthDayNano) => true,
            DataType::List(item) | DataType::LargeList(item) | DataType::FixedSizeList(item, _) => {
                Self::readable(item.data_type())
            }
            DataType::Map(entry, _) => Self::readable(entry.data_type()),
            DataType::Struct(fields) => {
                fields.iter().all(|field| Self::readable(field.data_type()))
            }
            DataType::Union(fields, _) => fields
                .iter()
                .all(|(_, field)| Self::readable(field.data_type())),
            DataType::Dictionary(key, value) => {
                matches!(**key, DataType::UInt8 | DataType::UInt16 | DataType::UInt32)
                    && Self::readable(value)
            }
            DataType::Null
            | DataType::Date64
            | DataType::Time32(_)
            | DataType::Time64(_)
            | DataType::Duration(_)
            | DataType::Interval(_)
            | DataType::BinaryView
            | DataType::Utf8View
            | DataType::ListView(_)
            | DataType::LargeListView(_)
            | DataType::Decimal256(..)
            | DataType::RunEndEncoded(..) => false,
        }
    }

    /// Returns the column names, in the order the query returned them.
    #[must_use]
    pub const fn columns(&self) -> &[Box<str>] {
        &self.columns
    }

    /// Returns each row's values, in the order of [`columns`](Self::columns).
    pub fn iter(&self) -> impl ExactSizeIterator<Item = &[Value]> {
        self.rows.iter().map(|row| &**row)
    }
}
