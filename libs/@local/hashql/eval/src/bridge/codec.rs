use core::{alloc::Allocator, error, fmt::Debug};

use bytes::BytesMut;
use hashql_core::{collections::FastHashMap, symbol::Symbol, value::Primitive};
use hashql_mir::{
    body::place::FieldIndex,
    def::DefId,
    interpret::{RuntimeError, value::Value},
};
use postgres_types::{Json, ToSql, to_sql_checked};
use serde_json::value::RawValue;

use super::{Parameter, temporal::TemporalAxesInterval};
use crate::{bridge::postgres_serde::SerializeValue, postgres::TemporalAxis};

pub(crate) struct Inputs<'heap, A: Allocator> {
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

fn serialize_value<'heap, V: Allocator, R: Allocator>(
    value: &Value<'heap, V>,
) -> Result<Json<Box<RawValue>>, RuntimeError<'heap, R>> {
    let string =
        serde_json::to_string(&SerializeValue::new(value)).expect("TODO: into runtimeerror");

    RawValue::from_string(string)
        .map_err(|_err| todo!())
        .map(Json)
}

pub(crate) fn encode_parameter<'ctx, 'heap, A: Allocator + 'ctx>(
    parameter: &Parameter<'heap>,
    inputs: &'ctx Inputs<'heap, impl Allocator>,
    temporal_axes: &TemporalAxesInterval,
    env: impl FnOnce(DefId, FieldIndex) -> Result<&'ctx Value<'heap, A>, RuntimeError<'heap, A>>,
) -> Result<Box<dyn ToSql + Send + Sync>, RuntimeError<'heap, A>> {
    match parameter {
        &Parameter::Input(symbol) => {
            let value = inputs.get(symbol).map(serialize_value).transpose()?;
            Ok(Box::new(value))
        }
        Parameter::Int(int) => {
            let int = int.as_int();
            if let Ok(int) = i64::try_from(int) {
                Ok(Box::new(int))
            } else {
                // Too large to be represented as an i64, instead use JSONB
                Ok(Box::new(Json(int)))
            }
        }
        Parameter::Primitive(primitive) => match primitive {
            Primitive::Null => Ok(Box::new(None::<Json<()>>)),
            &Primitive::Boolean(value) => Ok(Box::new(value)),
            Primitive::Float(float) => Ok(Box::new(float.as_f64())),
            Primitive::Integer(integer) => {
                if let Some(int) = integer.as_i64() {
                    Ok(Box::new(int))
                } else {
                    // Too large to be represented as an i64, because that means we also **cannot**
                    // serialize it via serde, we fallback to using floats.
                    Ok(Box::new(integer.as_f64()))
                }
            }
            Primitive::String(value) => Ok(Box::new(Box::<str>::from(value.as_str()))),
        },
        &Parameter::Symbol(symbol) => Ok(Box::new(Box::<str>::from(symbol.as_str()))),
        &Parameter::Env(def_id, field_index) => env(def_id, field_index)
            .and_then(serialize_value)
            .map(|value| Box::new(value) as Box<dyn ToSql + Send + Sync>),
        Parameter::TemporalAxis(TemporalAxis::Decision) => {
            Ok(Box::new(temporal_axes.decision_time.clone()))
        }
        Parameter::TemporalAxis(TemporalAxis::Transaction) => {
            Ok(Box::new(temporal_axes.transaction_time.clone()))
        }
    }
}
