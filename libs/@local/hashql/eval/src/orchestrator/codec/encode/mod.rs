use core::{alloc::Allocator, error, ops::Bound};

use bytes::BytesMut;
use hashql_core::{symbol::Symbol, value::Primitive};
use hashql_mir::{
    body::{local::Local, place::FieldIndex},
    interpret::{
        Inputs, RuntimeError,
        suspension::{TemporalAxesInterval, TemporalInterval, Timestamp},
        value::{Int, Value},
    },
};
use postgres_protocol::types::RangeBound;
use postgres_types::{Json, ToSql, accepts, to_sql_checked};
use serde::{
    Serialize,
    ser::{SerializeMap as _, SerializeSeq as _},
};
use serde_json::value::RawValue;

use super::{Postgres, Serde};
use crate::{
    orchestrator::error::BridgeError,
    postgres::{ParameterValue, TemporalAxis},
};

#[cfg(test)]
mod tests;

// timestamp is in ms
impl ToSql for Postgres<Timestamp> {
    accepts!(TIMESTAMPTZ);

    to_sql_checked!();

    #[expect(clippy::cast_possible_truncation)]
    fn to_sql(
        &self,
        _: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        // The value has been determined via `Date.UTC(2000, 0, 1)` in JS, and is the same as the one that jdbc uses: https://jdbc.postgresql.org/documentation/publicapi/constant-values.html
        const BASE: i128 = 946_684_800_000;

        // Our timestamp is milliseconds since Unix epoch (1970-01-01).
        // Postgres stores microseconds since 2000-01-01.
        let value = ((Int::from(self.0).as_int() - BASE) * 1000) as i64;

        postgres_protocol::types::timestamp_to_sql(value, out);
        Ok(postgres_types::IsNull::No)
    }
}

impl ToSql for Postgres<TemporalInterval> {
    accepts!(TSTZ_RANGE);

    to_sql_checked!();

    fn to_sql(
        &self,
        _: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        fn bound_to_sql(
            bound: Bound<Timestamp>,
            buf: &mut BytesMut,
        ) -> Result<RangeBound<postgres_protocol::IsNull>, Box<dyn error::Error + Sync + Send>>
        {
            Ok(match bound {
                Bound::Unbounded => RangeBound::Unbounded,
                Bound::Included(timestamp) => {
                    Postgres(timestamp).to_sql(&postgres_types::Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Inclusive(postgres_protocol::IsNull::No)
                }
                Bound::Excluded(timestamp) => {
                    Postgres(timestamp).to_sql(&postgres_types::Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Exclusive(postgres_protocol::IsNull::No)
                }
            })
        }

        postgres_protocol::types::range_to_sql(
            |buf| bound_to_sql(self.0.start, buf),
            |buf| bound_to_sql(self.0.end, buf),
            out,
        )?;

        Ok(postgres_types::IsNull::No)
    }
}

impl ToSql for Postgres<Symbol<'_>> {
    to_sql_checked!();

    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        self.0.as_str().to_sql(ty, out)
    }

    fn accepts(ty: &postgres_types::Type) -> bool
    where
        Self: Sized,
    {
        <&str>::accepts(ty)
    }
}

impl<A: Allocator> Serialize for Serde<&Value<'_, A>> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match &self.0 {
            Value::Unit => serializer.serialize_unit(),
            Value::Integer(int) => {
                if let Some(bool) = int.as_bool() {
                    serializer.serialize_bool(bool)
                } else {
                    serializer.serialize_i128(int.as_int())
                }
            }
            Value::Number(num) => serializer.serialize_f64(num.as_f64()),
            Value::String(str) => serializer.serialize_str(str.as_str()),
            Value::Pointer(_) => Err(serde::ser::Error::custom("pointer value not supported")),
            Value::Opaque(opaque) => Self(opaque.value()).serialize(serializer),
            Value::Struct(r#struct) => {
                let mut inner = serializer.serialize_map(Some(r#struct.len()))?;

                for (field, value) in r#struct.fields().iter().zip(r#struct.values()) {
                    inner.serialize_entry(&field.as_str(), &Self(value))?;
                }

                inner.end()
            }
            Value::Tuple(tuple) => {
                let mut inner = serializer.serialize_seq(Some(tuple.len().get()))?;

                for value in tuple.values() {
                    inner.serialize_element(&Self(value))?;
                }

                inner.end()
            }
            Value::List(list) => {
                let mut inner = serializer.serialize_seq(Some(list.len()))?;

                for value in list.iter() {
                    inner.serialize_element(&Self(value))?;
                }

                inner.end()
            }
            Value::Dict(dict) => {
                let mut inner = serializer.serialize_map(Some(dict.len()))?;

                for (key, value) in dict.iter() {
                    inner.serialize_entry(&Self(key), &Self(value))?;
                }

                inner.end()
            }
        }
    }
}

/// Serializes a runtime [`Value`] to a JSON [`RawValue`] suitable for use as
/// a PostgreSQL `JSONB` parameter.
///
/// # Errors
///
/// Returns [`BridgeError::ValueSerialization`] if the value contains
/// unsupported shapes (e.g. pointer values).
///
/// [`Value`]: hashql_mir::interpret::value::Value
pub(crate) fn serialize_value<'heap, V: Allocator>(
    value: &Value<'heap, V>,
) -> Result<Json<Box<RawValue>>, BridgeError<'heap>> {
    let string = serde_json::to_string(&Serde(value))
        .map_err(|source| BridgeError::ValueSerialization { source })?;

    RawValue::from_string(string)
        .map_err(|source| BridgeError::ValueSerialization { source })
        .map(Json)
}

/// Encodes a single query [`Parameter`] into a boxed [`ToSql`] value ready
/// for the PostgreSQL wire protocol.
///
/// Handles all parameter variants: user inputs (serialized to JSON), literal
/// integers and primitives, interned symbols, captured environment values,
/// and temporal axis intervals.
///
/// # Errors
///
/// Returns a [`RuntimeError`] if environment lookup fails or value
/// serialization fails.
///
/// [`ToSql`]: postgres_types::ToSql
pub(crate) fn encode_parameter_in<'ctx, 'heap, V: Allocator + 'ctx, A: Allocator>(
    parameter: &ParameterValue<'heap>,
    inputs: &'ctx Inputs<'heap, impl Allocator>,
    temporal_axes: &TemporalAxesInterval,
    env: impl FnOnce(
        Local,
        FieldIndex,
    ) -> Result<&'ctx Value<'heap, V>, RuntimeError<'heap, BridgeError<'heap>, V>>,
    alloc: A,
) -> Result<Box<dyn ToSql + Sync + 'heap, A>, RuntimeError<'heap, BridgeError<'heap>, V>> {
    match parameter {
        &ParameterValue::Input(symbol) => {
            let value = inputs
                .get(symbol)
                .map(|value| serialize_value(value).map_err(RuntimeError::Suspension))
                .transpose()?;
            Ok(Box::new_in(value, alloc))
        }
        ParameterValue::Int(int) => {
            let int = int.as_int();
            if let Ok(int) = i64::try_from(int) {
                Ok(Box::new_in(int, alloc))
            } else {
                // Too large to be represented as an i64, instead use JSONB
                Ok(Box::new_in(Json(int), alloc))
            }
        }
        ParameterValue::Primitive(primitive) => match primitive {
            Primitive::Null => Ok(Box::new_in(None::<Json<()>>, alloc)),
            &Primitive::Boolean(value) => Ok(Box::new_in(value, alloc)),
            Primitive::Float(float) => Ok(Box::new_in(float.as_f64(), alloc)),
            Primitive::Integer(integer) => {
                if let Some(int) = integer.as_i64() {
                    Ok(Box::new_in(int, alloc))
                } else {
                    // Too large to be represented as an i64, because that means we also
                    // **cannot** serialize it via serde, we fallback to
                    // using floats.
                    Ok(Box::new_in(integer.as_f64(), alloc))
                }
            }
            Primitive::String(value) => Ok(Box::new_in(Box::<str>::from(value.as_str()), alloc)),
        },
        &ParameterValue::Symbol(symbol) => Ok(Box::new_in(Postgres(symbol), alloc)),
        &ParameterValue::Env(local, field_index) => {
            let value = env(local, field_index)?;
            let serialized = serialize_value(value).map_err(RuntimeError::Suspension)?;
            Ok(Box::new_in(serialized, alloc) as Box<dyn ToSql + Sync, A>)
        }
        ParameterValue::TemporalAxis(TemporalAxis::Decision) => Ok(Box::new_in(
            Postgres(temporal_axes.decision_time.clone()),
            alloc,
        )),
        ParameterValue::TemporalAxis(TemporalAxis::Transaction) => Ok(Box::new_in(
            Postgres(temporal_axes.transaction_time.clone()),
            alloc,
        )),
    }
}
