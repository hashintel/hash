//! The row values that have no property form.

/// Why a row value cannot be written as a property.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum UnsupportedValue {
    #[display("blob values cannot be written as properties")]
    Blob,
    #[display("geometry values cannot be written as properties")]
    Geometry,
    #[display("interval values cannot be written as properties")]
    Interval,
    #[display("infinite and `NaN` numbers cannot be written as properties")]
    NonFiniteNumber,
    #[display("the date or time is out of range")]
    DateTimeOutOfRange,
    #[display("map keys must be text")]
    NonTextMapKey,
    #[display("the DuckDB type is not supported")]
    Unknown,
}
