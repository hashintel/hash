//! Continuation state for resuming interpreter execution after a database
//! round-trip.
//!
//! When a compiled query returns continuation columns (target block, locals,
//! values), they arrive as flat nullable fields in the result row. This module
//! provides [`PartialPostgresState`] for accumulating those fields during
//! hydration, and [`PostgresState`] for the validated, decoded form that can
//! be flushed into a [`CallStack`] to resume interpretation at the correct
//! basic block with the correct local variable bindings.
//!
//! [`CallStack`]: hashql_mir::interpret::CallStack

use core::alloc::Allocator;

use hashql_mir::{
    body::{Body, basic_block::BasicBlockId, local::Local},
    def::DefId,
    interpret::{CallStack, RuntimeError, value::Value},
    pass::execution::IslandId,
};
use tokio_postgres::Row;

use super::{Indexed, codec::decode::Decoder, error::BridgeError, partial::Optional};
use crate::{
    orchestrator::partial::Hydrated,
    postgres::{ColumnDescriptor, ContinuationField},
};

/// In-progress continuation state being assembled from result row columns.
///
/// Each continuation is identified by a `(body, island)` pair. As columns are
/// encountered during hydration, [`hydrate`](Self::hydrate) populates the
/// target block, locals, and values fields. Once all columns for a row have
/// been processed, [`finish_in`](Self::finish_in) validates completeness and
/// decodes the JSON values into typed [`Value`]s, producing a
/// [`PostgresState`] (or `None` if the continuation target was `NULL`,
/// indicating no resumption is needed).
///
/// [`Value`]: hashql_mir::interpret::value::Value
pub(crate) struct PartialPostgresState<A: Allocator> {
    pub body: DefId,
    pub island: IslandId,

    target: Optional<BasicBlockId>,
    locals: Optional<Vec<Local, A>>,
    values: Optional<Vec<serde_json::Value>>,
}

impl<A: Allocator> PartialPostgresState<A> {
    pub(crate) const fn new(body: DefId, island: IslandId) -> Self {
        Self {
            body,
            island,
            target: Optional::Skipped,
            locals: Optional::Skipped,
            values: Optional::Skipped,
        }
    }

    pub(crate) fn hydrate<'heap>(
        &mut self,
        column: Indexed<ColumnDescriptor>,
        field: ContinuationField,
        row: &Row,
        alloc: A,
    ) -> Result<(), BridgeError<'heap>> {
        match field {
            ContinuationField::Block => {
                // row is a single (nullable) block id, encoded as an int
                let block_id: Option<i32> =
                    row.try_get(column.index)
                        .map_err(|error| BridgeError::RowHydration {
                            column,
                            source: error,
                        })?;

                match block_id {
                    Some(block_id) => {
                        let block_id = u32::try_from(block_id).map_err(|_err| {
                            BridgeError::InvalidContinuationBlockId {
                                body: self.body,
                                block_id,
                            }
                        })?;

                        self.target = Optional::Value(BasicBlockId::new(block_id));
                    }
                    None => {
                        self.target = Optional::Null(());
                    }
                }
            }
            ContinuationField::Locals => {
                let locals: Option<Vec<i32>> =
                    row.try_get(column.index)
                        .map_err(|error| BridgeError::RowHydration {
                            column,
                            source: error,
                        })?;

                match locals {
                    Some(locals) => {
                        let mut result = Vec::with_capacity_in(locals.len(), alloc);
                        for local in locals {
                            let local = u32::try_from(local).map(Local::new).map_err(|_err| {
                                BridgeError::InvalidContinuationLocal {
                                    body: self.body,
                                    local,
                                }
                            })?;
                            result.push(local);
                        }
                        self.locals = Optional::Value(result);
                    }
                    None => {
                        self.locals = Optional::Null(());
                    }
                }
            }
            ContinuationField::Values => {
                let values: Option<Vec<serde_json::Value>> =
                    row.try_get(column.index)
                        .map_err(|error| BridgeError::RowHydration {
                            column,
                            source: error,
                        })?;

                match values {
                    Some(values) => {
                        self.values = Optional::Value(values);
                    }
                    None => {
                        self.values = Optional::Null(());
                    }
                }
            }
        }

        Ok(())
    }

    pub(crate) fn finish_in<'heap>(
        self,
        decoder: &Decoder<'_, 'heap, A>,
        body: &Body<'heap>,
        alloc: A,
    ) -> Result<Option<PostgresState<'heap, A>>, BridgeError<'heap>>
    where
        A: Clone,
    {
        debug_assert_eq!(body.id, self.body);

        let target = match self.target {
            Hydrated::Null(()) => return Ok(None),
            Hydrated::Skipped => {
                return Err(BridgeError::IncompleteContinuation {
                    body: self.body,
                    field: "target",
                });
            }
            Hydrated::Value(target) => target,
        };

        let locals = match self.locals {
            Optional::Null(()) | Optional::Skipped => {
                return Err(BridgeError::IncompleteContinuation {
                    body: self.body,
                    field: "locals",
                });
            }
            Optional::Value(locals) => locals,
        };
        let values = match self.values {
            Optional::Null(()) | Optional::Skipped => {
                return Err(BridgeError::IncompleteContinuation {
                    body: self.body,
                    field: "values",
                });
            }
            Optional::Value(values) => values,
        };
        debug_assert_eq!(locals.len(), values.len());

        let mut evaluated_locals = Vec::with_capacity_in(locals.len(), alloc);

        for (local, value) in locals.into_iter().zip(values) {
            let r#type = body.local_decls[local].r#type;

            let value = decoder.decode(r#type, (&value).into()).map_err(|source| {
                BridgeError::ContinuationDeserialization {
                    body: self.body,
                    local,
                    source,
                }
            })?;
            evaluated_locals.push((local, value));
        }

        Ok(Some(PostgresState {
            body: self.body,
            island: self.island,

            target,
            locals: evaluated_locals,
        }))
    }
}

/// Validated continuation state ready to be applied to a [`CallStack`].
///
/// Contains the target [`BasicBlockId`] to jump to and the decoded local
/// variable bindings. Call [`flush`](Self::flush) to write these into the
/// callstack's current frame, advancing execution to the continuation point.
///
/// [`CallStack`]: hashql_mir::interpret::CallStack
pub(crate) struct PostgresState<'heap, A: Allocator> {
    pub body: DefId,
    pub island: IslandId,

    target: BasicBlockId,
    locals: Vec<(Local, Value<'heap, A>), A>,
}

impl<'heap, A: Allocator> PostgresState<'heap, A> {
    /// Writes the continuation state into `callstack`, setting the current
    /// block to the target and populating locals with the decoded values.
    pub(crate) fn flush<'ctx, E>(
        &self,
        callstack: &mut CallStack<'ctx, 'heap, A>,
    ) -> Result<(), RuntimeError<'heap, E, A>>
    where
        A: Clone,
    {
        callstack.set_current_block_unchecked(self.target)?;

        // We must now advance the *last frame* (the current frame), with the current block
        // (unsafely)
        // And then get all locals and values into the frame
        let frame_locals = callstack
            .locals_mut()
            .unwrap_or_else(|_err: RuntimeError<'heap, !, A>| unreachable!());

        for (local, value) in &self.locals {
            *frame_locals.local_mut(*local) = value.clone();
        }

        Ok(())
    }
}
