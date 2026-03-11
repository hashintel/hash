use core::{alloc::Allocator, ops::Bound};

use hashql_core::symbol::sym;

use super::temporal::{TemporalAxesInterval, TemporalInterval, Timestamp};
use crate::interpret::{RuntimeError, TypeName, value::Value};

fn extract_timestamp<'heap, A: Allocator>(
    value: &Value<'heap, A>,
) -> Result<Timestamp, RuntimeError<'heap, A>> {
    let Value::Opaque(opaque) = value else {
        return Err(RuntimeError::UnexpectedValueType {
            expected: TypeName::terse("Opaque"),
            actual: value.type_name().into(),
        });
    };
    debug_assert_eq!(opaque.name(), sym::path::Timestamp);

    let &Value::Integer(timestamp) = opaque.value() else {
        return Err(RuntimeError::UnexpectedValueType {
            expected: TypeName::terse("Integer"),
            actual: opaque.value().type_name().into(),
        });
    };

    Ok(Timestamp::from(timestamp))
}

fn extract_bound<'heap, A: Allocator>(
    value: &Value<'heap, A>,
) -> Result<Bound<Timestamp>, RuntimeError<'heap, A>> {
    let Value::Opaque(bound) = value else {
        return Err(RuntimeError::UnexpectedValueType {
            expected: TypeName::terse("Opaque"),
            actual: value.type_name().into(),
        });
    };

    let make_bound = match bound.name().as_constant() {
        Some(sym::path::UnboundedTemporalBound::CONST) => return Ok(Bound::Unbounded),
        Some(sym::path::InclusiveTemporalBound::CONST) => Bound::Included,
        Some(sym::path::ExclusiveTemporalBound::CONST) => Bound::Excluded,
        _ => {
            return Err(RuntimeError::InvalidConstructor { name: bound.name() });
        }
    };

    let value = extract_timestamp(bound.value())?;
    Ok(make_bound(value))
}

fn extract_interval<'heap, A: Allocator>(
    value: &Value<'heap, A>,
) -> Result<(Bound<Timestamp>, Bound<Timestamp>), RuntimeError<'heap, A>> {
    let Value::Opaque(opaque) = value else {
        return Err(RuntimeError::UnexpectedValueType {
            expected: TypeName::terse("Opaque"),
            actual: value.type_name().into(),
        });
    };
    debug_assert_eq!(opaque.name(), sym::path::Interval);

    let value = opaque.value();

    let start = value.project_by_name(sym::start)?;
    let end = value.project_by_name(sym::end)?;

    let start = extract_bound(start)?;
    let end = extract_bound(end)?;

    Ok((start, end))
}

pub(crate) fn extract_axis<'heap, A: Allocator>(
    value: &Value<'heap, A>,
) -> Result<TemporalAxesInterval, RuntimeError<'heap, A>> {
    let Value::Opaque(opaque) = value else {
        return Err(RuntimeError::UnexpectedValueType {
            expected: TypeName::terse("Opaque"),
            actual: value.type_name().into(),
        });
    };

    // The resulting value must be a `QueryTemporalAxes`, this means it's either a
    // `PinnedTransactionTimeTemporalAxes` or `PinnedDecisionTimeTemporalAxes`.
    let (pinned, variable) = match opaque.name().as_constant() {
        Some(
            sym::path::PinnedTransactionTimeTemporalAxes::CONST
            | sym::path::PinnedDecisionTimeTemporalAxes::CONST,
        ) => {
            let value = opaque.value();

            let pinned = value.project_by_name(sym::pinned)?;
            let variable = value.project_by_name(sym::variable)?;

            (pinned, variable)
        }
        _ => {
            return Err(RuntimeError::InvalidConstructor {
                name: opaque.name(),
            });
        }
    };

    let Value::Opaque(pinned) = pinned else {
        return Err(RuntimeError::UnexpectedValueType {
            expected: TypeName::terse("Opaque"),
            actual: pinned.type_name().into(),
        });
    };
    let Value::Opaque(variable) = variable else {
        return Err(RuntimeError::UnexpectedValueType {
            expected: TypeName::terse("Opaque"),
            actual: variable.type_name().into(),
        });
    };

    let timestamp = extract_timestamp(pinned.value())?;
    let interval = extract_interval(variable.value())?;

    match pinned.name().as_constant() {
        Some(sym::path::TransactionTime::CONST) => Ok(TemporalAxesInterval {
            transaction_time: TemporalInterval::point(timestamp),
            decision_time: TemporalInterval::interval(interval),
        }),
        Some(sym::path::DecisionTime::CONST) => Ok(TemporalAxesInterval {
            transaction_time: TemporalInterval::interval(interval),
            decision_time: TemporalInterval::point(timestamp),
        }),
        _ => Err(RuntimeError::InvalidConstructor {
            name: pinned.name(),
        }),
    }
}
