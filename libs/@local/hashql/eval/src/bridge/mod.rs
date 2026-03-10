// The bridge has the goal of bridging the two worlds, and coordinates the different sources and
// implementations.

use core::ops::{Bound, Index};
use std::alloc::Allocator;

use hashql_core::symbol::sym;
use hashql_mir::{
    body::{Body, basic_block::BasicBlockSlice, location::Location, terminator::GraphRead},
    def::{DefId, DefIdSet, DefIdSlice},
    interpret::{
        Locals, RuntimeError,
        value::{Int, Value},
    },
};

use crate::postgres::{PostgresCompiler, PreparedQuery};

mod postgres_serde;

struct PreparedQueries<'heap, A: Allocator> {
    offsets: Box<DefIdSlice<usize>, A>,
    queries: Vec<PreparedQuery<'heap, A>, A>,
}

impl<'heap, A: Allocator> PreparedQueries<'heap, A> {
    fn find(&self, body: DefId, location: Location) -> Option<&PreparedQuery<'heap, A>> {
        todo!()
    }
}

struct TemporalInterval {
    start: Bound<Int>,
    end: Bound<Int>,
}

impl TemporalInterval {
    fn point(value: Int) -> Self {
        Self {
            start: Bound::Included(value),
            end: Bound::Included(value),
        }
    }

    fn interval((start, end): (Bound<Int>, Bound<Int>)) -> Self {
        Self { start, end }
    }
}

struct TemporalAxesInterval {
    decision_time: TemporalInterval,
    transaction_time: TemporalInterval,
}

// TODO: location to query map
struct Bridge<'env, 'heap, A: Allocator> {
    bodies: &'env DefIdSlice<Body<'heap>>,
    queries: &'env DefIdSlice<Option<PreparedQuery<'heap, A>>>,
}

impl<'env, 'heap, A: Allocator> Bridge<'env, 'heap, A> {
    fn extract_timestamp<L: Allocator>(
        &self,
        value: &Value<'heap, L>,
    ) -> Result<Int, RuntimeError<'heap, L>> {
        let Value::Opaque(opaque) = value else {
            todo!("report error; ICE")
        };
        debug_assert_eq!(opaque.name(), sym::path::Timestamp);

        // The underlying value is a timestamp
        let &Value::Integer(timestamp) = opaque.value() else {
            todo!("report error; ICE")
        };

        Ok(timestamp)
    }

    fn extract_bound<L: Allocator>(
        &self,
        value: &Value<'heap, L>,
    ) -> Result<Bound<Int>, RuntimeError<'heap, L>> {
        let Value::Opaque(bound) = value else {
            todo!("report error; ICE")
        };

        let make_bound = match bound.name().as_constant() {
            Some(sym::path::UnboundedTemporalBound::CONST) => return Ok(Bound::Unbounded),
            Some(sym::path::InclusiveTemporalBound::CONST) => Bound::Included,
            Some(sym::path::ExclusiveTemporalBound::CONST) => Bound::Excluded,
            _ => todo!("report error; ICE"),
        };

        let value = self.extract_timestamp(bound.value())?;
        Ok(make_bound(value))
    }

    fn extract_interval<L: Allocator>(
        &self,
        value: &Value<'heap, L>,
    ) -> Result<(Bound<Int>, Bound<Int>), RuntimeError<'heap, L>> {
        let Value::Opaque(opaque) = value else {
            todo!("report error; ICE")
        };
        debug_assert_eq!(opaque.name(), sym::path::Interval);

        // The underlying value is an interval
        let Value::Struct(r#struct) = opaque.value() else {
            todo!("report error; ICE")
        };

        let Some(start) = r#struct.get_by_name(sym::start) else {
            todo!("report error; ICE")
        };
        let Some(end) = r#struct.get_by_name(sym::end) else {
            todo!("report error; ICE")
        };

        let start = self.extract_bound(start)?;
        let end = self.extract_bound(end)?;

        Ok((start, end))
    }

    fn extract_axis<L: Allocator>(
        &self,
        value: &Value<'heap, L>,
    ) -> Result<TemporalAxesInterval, RuntimeError<'heap, L>> {
        // The resulting value must be a `QueryTemporalAxes`, this means it's either a
        // `PinnedTransactionTimeTemporalAxes` or `PinnedDecisionTimeTemporalAxes`.
        let Value::Opaque(opaque) = value else {
            todo!("report error; ICE");
        };

        let (pinned, variable) = match opaque.name().as_constant() {
            Some(
                sym::path::PinnedTransactionTimeTemporalAxes::CONST
                | sym::path::PinnedDecisionTimeTemporalAxes::CONST,
            ) => {
                // Must be a struct of two fields: `pinned` and `variable`
                let Value::Struct(r#struct) = opaque.value() else {
                    todo!("report error; ICE");
                };

                let Some(pinned) = r#struct.get_by_name(sym::pinned) else {
                    todo!("report error; ICE");
                };
                let Some(variable) = r#struct.get_by_name(sym::variable) else {
                    todo!("report error; ICE");
                };

                (pinned, variable)
            }
            _ => {
                todo!("report error; ICE");
            }
        };

        let Value::Opaque(pinned) = pinned else {
            todo!("report error; ICE");
        };
        let Value::Opaque(variable) = variable else {
            todo!("report error; ICE");
        };

        let timestamp = self.extract_timestamp(pinned.value())?;
        let interval = self.extract_interval(variable.value())?;

        match pinned.name().as_constant() {
            Some(sym::path::TransactionTime::CONST) => Ok(TemporalAxesInterval {
                transaction_time: TemporalInterval::point(timestamp),
                decision_time: TemporalInterval::interval(interval),
            }),
            Some(sym::path::DecisionTime::CONST) => Ok(TemporalAxesInterval {
                transaction_time: TemporalInterval::interval(interval),
                decision_time: TemporalInterval::point(timestamp),
            }),
            _ => todo!("report error; ICE"),
        }
    }

    fn run<L: Allocator + Clone>(
        &self,
        locals: &Locals<'_, 'heap, L>,
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

        match tail {
            hashql_mir::body::terminator::GraphReadTail::Collect => {
                // currently the only one supported is getting all the data
            }
        }

        // TODO: execute the bodies in parallel
        todo!()
    }
}

// the goal of the bridge is it to coordinate the different sources and implementations, to allow
// for this, we use a "multi-pronged" approach, we are given the compiled queries, and all the
// bodies, and operate on them.
