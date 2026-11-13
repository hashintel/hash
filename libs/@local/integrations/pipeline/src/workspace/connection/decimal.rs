//! Validates checkpoint numeric representations before any file is published.

use arrow_array::{
    Array, RecordBatch,
    cast::AsArray as _,
    make_array,
    types::{Decimal32Type, Decimal64Type, Decimal128Type, Decimal256Type},
};
use duckdb::{
    arrow::datatypes::DataType,
    core::{LogicalTypeHandle, LogicalTypeId},
};
use error_stack::Report;

use crate::CaptureError;

/// Rejects unsigned 128-bit values while their logical type is still available.
pub(super) fn check_type(
    logical: &LogicalTypeHandle,
    path: &str,
) -> Result<(), Report<CaptureError>> {
    if logical.id() == LogicalTypeId::UHugeint {
        return Err(Report::new(CaptureError::InvalidData)
            .attach(format!("unsupported checkpoint type UHUGEINT at {path}")));
    }
    for index in 0..logical.num_children() {
        check_type(&logical.child(index), &format!("{path}.child[{index}]"))?;
    }
    Ok(())
}

pub(super) fn check_batch(batch: &RecordBatch) -> Result<(), Report<CaptureError>> {
    for (field, array) in batch.schema().fields().iter().zip(batch.columns()) {
        check_array(array.as_ref(), field.name())?;
    }
    Ok(())
}

fn check_array(array: &dyn Array, path: &str) -> Result<(), Report<CaptureError>> {
    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "non-decimal arrays are checked recursively through their child arrays"
    )]
    let result = match array.data_type() {
        DataType::Decimal32(precision, _) => array
            .as_primitive::<Decimal32Type>()
            .validate_decimal_precision(*precision),
        DataType::Decimal64(precision, _) => array
            .as_primitive::<Decimal64Type>()
            .validate_decimal_precision(*precision),
        DataType::Decimal128(precision, _) => array
            .as_primitive::<Decimal128Type>()
            .validate_decimal_precision(*precision),
        DataType::Decimal256(precision, _) => array
            .as_primitive::<Decimal256Type>()
            .validate_decimal_precision(*precision),
        _ => Ok(()),
    };
    // Arrow's diagnostic includes the offending value. Keep only its location and type.
    result.map_err(|_error| {
        Report::new(CaptureError::InvalidData).attach(format!(
            "invalid checkpoint decimal at {path}: {}",
            array.data_type()
        ))
    })?;
    for (index, child) in array.to_data().child_data().iter().enumerate() {
        check_array(
            make_array(child.clone()).as_ref(),
            &format!("{path}.child[{index}]"),
        )?;
    }
    Ok(())
}
