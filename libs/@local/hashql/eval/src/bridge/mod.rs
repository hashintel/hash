// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

use core::{alloc::Allocator, ops::Bound};
use std::alloc::Global;

use hashql_core::symbol::sym;
use hashql_mir::{
    body::{
        Body,
        location::Location,
        terminator::{GraphRead, GraphReadBody},
    },
    def::{DefId, DefIdSlice},
    interpret::{Locals, RuntimeError, TypeName, value::Value},
};

use self::{
    codec::{Inputs, encode_parameter},
    exec::Ipc,
    temporal::{TemporalAxesInterval, TemporalInterval, Timestamp},
};
use crate::postgres::{Parameter, PreparedQuery};

mod codec;
mod exec;
mod postgres_serde;
mod temporal;

struct PreparedQueries<'heap, A: Allocator> {
    offsets: Box<DefIdSlice<usize>, A>,
    queries: Vec<PreparedQuery<'heap, A>, A>,
}

impl<'heap, A: Allocator> PreparedQueries<'heap, A> {
    fn find(&self, body: DefId, location: Location) -> &PreparedQuery<'heap, A> {
        todo!()
    }
}

struct Bridge<'env, 'heap, A: Allocator> {
    bodies: &'env DefIdSlice<Body<'heap>>,
    queries: &'env PreparedQueries<'heap, A>,
    inputs: &'env Inputs<'heap, A>,
    ipc: Ipc,
}

impl<'env, 'heap, A: Allocator> Bridge<'env, 'heap, A> {
    fn extract_timestamp<L: Allocator>(
        value: &Value<'heap, L>,
    ) -> Result<Timestamp, RuntimeError<'heap, L>> {
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

    fn extract_bound<L: Allocator>(
        value: &Value<'heap, L>,
    ) -> Result<Bound<Timestamp>, RuntimeError<'heap, L>> {
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

        let value = Self::extract_timestamp(bound.value())?;
        Ok(make_bound(value))
    }

    fn extract_interval<L: Allocator>(
        value: &Value<'heap, L>,
    ) -> Result<(Bound<Timestamp>, Bound<Timestamp>), RuntimeError<'heap, L>> {
        let Value::Opaque(opaque) = value else {
            return Err(RuntimeError::UnexpectedValueType {
                expected: TypeName::terse("Opaque"),
                actual: value.type_name().into(),
            });
        };
        debug_assert_eq!(opaque.name(), sym::path::Interval);

        let Value::Struct(r#struct) = opaque.value() else {
            return Err(RuntimeError::InvalidProjectionByNameType {
                base: opaque.value().type_name().into(),
            });
        };

        let Some(start) = r#struct.get_by_name(sym::start) else {
            return Err(RuntimeError::UnknownFieldByName {
                base: value.type_name().into(),
                field: sym::start,
            });
        };
        let Some(end) = r#struct.get_by_name(sym::end) else {
            return Err(RuntimeError::UnknownFieldByName {
                base: value.type_name().into(),
                field: sym::end,
            });
        };

        let start = Self::extract_bound(start)?;
        let end = Self::extract_bound(end)?;

        Ok((start, end))
    }

    fn extract_axis<L: Allocator>(
        &self,
        value: &Value<'heap, L>,
    ) -> Result<TemporalAxesInterval, RuntimeError<'heap, L>> {
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
                let Value::Struct(r#struct) = opaque.value() else {
                    return Err(RuntimeError::InvalidProjectionByNameType {
                        base: opaque.value().type_name().into(),
                    });
                };

                let Some(pinned) = r#struct.get_by_name(sym::pinned) else {
                    return Err(RuntimeError::UnknownFieldByName {
                        base: value.type_name().into(),
                        field: sym::pinned,
                    });
                };
                let Some(variable) = r#struct.get_by_name(sym::variable) else {
                    return Err(RuntimeError::UnknownFieldByName {
                        base: value.type_name().into(),
                        field: sym::variable,
                    });
                };

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

        let timestamp = Self::extract_timestamp(pinned.value())?;
        let interval = Self::extract_interval(variable.value())?;

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

    fn run<L: Allocator + Clone>(
        &self,
        locals: &Locals<'_, 'heap, L>,
        def: DefId,
        location: Location,
        GraphRead {
            head,
            body,
            tail,
            target,
        }: &GraphRead<'heap>,
    ) -> Result<(), RuntimeError<'heap, L>> {
        let axis = match head {
            hashql_mir::body::terminator::GraphReadHead::Entity { axis } => locals.operand(axis)?,
        };

        let axis = self.extract_axis(&axis)?;
        let query = self.queries.find(def, location);

        // TODO: We must ensure that there's *always* a query, in case nothing is given we fallback
        // to a prepared one, that just fetches the data required.
        // We should either do this inside of the bridge computation, or when running the postgres
        // compiler. I am thinking the postgres compiler, where we just have a "nonsensical" output.
        let transpiled = query.transpile();
        let params = query
            .parameters
            .iter()
            .map(|parameter| {
                encode_parameter(parameter, self.inputs, &axis, |def, field| {
                    let local = body
                        .iter()
                        .find_map(|body| match body {
                            &GraphReadBody::Filter(filter_def, filter_local)
                                if filter_def == def =>
                            {
                                Some(filter_local)
                            }
                            GraphReadBody::Filter(..) => None,
                        })
                        .unwrap_or_else(|| unreachable!());

                    let value = locals.local(local)?;
                    value.project(field)
                })
            })
            .try_collect()?;

        self.ipc.execute_query(transpiled.to_string(), params);

        // TODO: entity hydration + interpolation

        // TODO: execute the bodies in parallel
        todo!()
    }
}

// the goal of the bridge is it to coordinate the different sources and implementations, to allow
// for this, we use a "multi-pronged" approach, we are given the compiled queries, and all the
// bodies, and operate on them.
