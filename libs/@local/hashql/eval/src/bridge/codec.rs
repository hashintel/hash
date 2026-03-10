use core::{alloc::Allocator, fmt::Debug, ops::Bound};

use bytes::BytesMut;
use hashql_core::{collections::FastHashMap, symbol::Symbol, value::Primitive};
use hashql_mir::{body::place::FieldIndex, def::DefId, interpret::value::Value};
use postgres_protocol::types::RangeBound;
use postgres_types::{Json, ToSql, accepts, to_sql_checked};

use super::{Parameter, TemporalAxesInterval, TemporalInterval, Timestamp};
use crate::{bridge::postgres_serde::SerializeValue, postgres::TemporalAxis};

struct Inputs<'heap, A: Allocator> {
    inner: FastHashMap<Symbol<'heap>, Value<'heap, A>, A>,
}

impl<'heap, A: Allocator> Inputs<'heap, A> {
    fn get(&self, symbol: Symbol<'heap>) -> Option<&Value<'heap, A>> {
        self.inner.get(&symbol)
    }
}

#[derive(Debug)]
struct PostgresSymbol<'heap>(Symbol<'heap>);

impl ToSql for PostgresSymbol<'_> {
    to_sql_checked!();

    fn to_sql(
        &self,
        ty: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>>
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

// timestamp is in ms
impl ToSql for Timestamp {
    accepts!(TIMESTAMPTZ);

    to_sql_checked!();

    fn to_sql(
        &self,
        _: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        // The value has been determined via `Date.UTC(2000, 0, 1)` in JS, and is the same as the one that jdbc uses: https://jdbc.postgresql.org/documentation/publicapi/constant-values.html
        const BASE: i128 = 946_684_800_000;

        // Our timestamp is milliseconds since Unix epoch (1970-01-01).
        // Postgres stores microseconds since 2000-01-01.
        let value = ((self.0.as_int() - BASE) * 1000) as i64;

        postgres_protocol::types::timestamp_to_sql(value, out);
        Ok(postgres_types::IsNull::No)
    }
}

impl ToSql for TemporalInterval {
    accepts!(TSTZ_RANGE);

    to_sql_checked!();

    fn to_sql(
        &self,
        _: &postgres_types::Type,
        out: &mut BytesMut,
    ) -> Result<postgres_types::IsNull, Box<dyn std::error::Error + Sync + Send>>
    where
        Self: Sized,
    {
        fn bound_to_sql(
            bound: Bound<Timestamp>,
            buf: &mut BytesMut,
        ) -> Result<RangeBound<postgres_protocol::IsNull>, Box<dyn std::error::Error + Sync + Send>>
        {
            Ok(match bound {
                Bound::Unbounded => RangeBound::Unbounded,
                Bound::Included(timestamp) => {
                    timestamp.to_sql(&postgres_types::Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Inclusive(postgres_protocol::IsNull::No)
                }
                Bound::Excluded(timestamp) => {
                    timestamp.to_sql(&postgres_types::Type::TIMESTAMPTZ, buf)?;
                    RangeBound::Exclusive(postgres_protocol::IsNull::No)
                }
            })
        }

        postgres_protocol::types::range_to_sql(
            |buf| bound_to_sql(self.start, buf),
            |buf| bound_to_sql(self.end, buf),
            out,
        )?;

        Ok(postgres_types::IsNull::No)
    }
}

// TODO: get rid of the `Debug` bound for the allocator
fn encode_parameter_in<'ctx, 'heap: 'ctx, V: Allocator + Debug + 'ctx, A: Allocator>(
    parameter: &Parameter<'heap>,
    inputs: &'ctx Inputs<'heap, V>,
    temporal_axes: TemporalAxesInterval,
    env: impl FnOnce(DefId, FieldIndex) -> &'ctx Value<'heap, V>,
    alloc: A,
) -> Box<dyn ToSql + 'ctx, A> {
    match parameter {
        &Parameter::Input(symbol) => {
            let value = inputs
                .get(symbol)
                .map(|value| Json(SerializeValue::new(value)));

            Box::new_in(value, alloc)
        }
        Parameter::Int(int) => {
            let int = int.as_int();
            if let Ok(int) = i64::try_from(int) {
                Box::new_in(int, alloc)
            } else {
                // Too large to be represented as an i64, instead use JSONB
                Box::new_in(Json(int), alloc)
            }
        }
        Parameter::Primitive(primitive) => match primitive {
            Primitive::Null => Box::new_in(None::<Json<()>>, alloc),
            &Primitive::Boolean(value) => Box::new_in(value, alloc),
            Primitive::Float(float) => Box::new_in(float.as_f64(), alloc),
            Primitive::Integer(integer) => {
                if let Some(int) = integer.as_i64() {
                    Box::new_in(int, alloc)
                } else {
                    // Too large to be represented as an i64, because that means we also **cannot**
                    // serialize it via serde, we fallback to using floats.
                    Box::new_in(integer.as_f64(), alloc)
                }
            }
            Primitive::String(value) => Box::new_in(PostgresSymbol(value.as_symbol()), alloc),
        },
        &Parameter::Symbol(symbol) => Box::new_in(PostgresSymbol(symbol), alloc),
        &Parameter::Env(def_id, field_index) => {
            Box::new_in(Json(SerializeValue::new(env(def_id, field_index))), alloc)
        }
        Parameter::TemporalAxis(TemporalAxis::Decision) => {
            Box::new_in(temporal_axes.decision_time, alloc)
        }
        Parameter::TemporalAxis(TemporalAxis::Transaction) => {
            Box::new_in(temporal_axes.transaction_time, alloc)
        }
    }
}
