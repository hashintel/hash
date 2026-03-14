use core::alloc::Allocator;

use hashql_core::heap::CollectIn as _;
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

pub(crate) struct PartialPostgresState<A: Allocator> {
    pub body: DefId,
    pub island: IslandId,

    target: Optional<BasicBlockId>,
    locals: Optional<Vec<Local, A>>,
    values: Optional<Vec<serde_json::Value>>,
}

impl<A: Allocator> PartialPostgresState<A> {
    pub(crate) fn new(body: DefId, island: IslandId) -> Self {
        Self {
            body,
            island,
            target: Optional::Skipped,
            locals: Optional::Skipped,
            values: Optional::Skipped,
        }
    }

    pub(crate) fn hydrate(
        &mut self,
        column: Indexed<ColumnDescriptor>,
        field: ContinuationField,
        row: &Row,
        alloc: A,
    ) -> Result<(), BridgeError> {
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
                        // TODO: we probably want a better error here?
                        let block_id = u32::try_from(block_id)
                            .map_err(|_| BridgeError::ValueDeserialization { column })?;

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
                        self.locals = Optional::Value(
                            locals
                                .into_iter()
                                .map(|local| Local::new(local as u32))
                                .collect_in(alloc),
                        );
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

    pub(crate) fn finish_in<'ctx, 'heap>(
        self,
        decoder: &Decoder<'_, 'heap, A>,
        body: &'ctx Body<'heap>,
        alloc: A,
    ) -> Result<Option<PostgresState<'heap, A>>, BridgeError>
    where
        A: Clone,
    {
        debug_assert_eq!(body.id, self.body);

        let target = match self.target {
            Hydrated::Null(()) => return Ok(None),
            Hydrated::Skipped => todo!("ICE; should never happen"),
            Hydrated::Value(target) => target,
        };

        let locals = match self.locals {
            Optional::Null(()) | Optional::Skipped => todo!("ICE; should never happen"),
            Optional::Value(locals) => locals,
        };
        let values = match self.values {
            Optional::Null(()) | Optional::Skipped => todo!("ICE; should never happen"),
            Optional::Value(values) => values,
        };
        debug_assert_eq!(locals.len(), values.len());

        let mut evaluated_locals = Vec::with_capacity_in(locals.len(), alloc);

        for (local, value) in locals.into_iter().zip(values) {
            let r#type = body.local_decls[local].r#type;

            let value = decoder.decode(r#type, (&value).into())?; // TODO: correct error handling
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

pub(crate) struct PostgresState<'heap, A: Allocator> {
    pub body: DefId,
    pub island: IslandId,

    target: BasicBlockId,
    locals: Vec<(Local, Value<'heap, A>), A>,
}

impl<'heap, A: Allocator> PostgresState<'heap, A> {
    pub fn flush<'ctx>(&self, callstack: &mut CallStack<'ctx, 'heap, A>)
    where
        A: Clone,
    {
        callstack.set_current_block_unchecked(self.target);

        // We must now advance the *last frame* (the current frame), with the current block
        // (unsafely)
        // And then get all locals and values into the frame
        let frame_locals = callstack
            .locals_mut()
            .unwrap_or_else(|_err: RuntimeError<'heap, !, A>| unreachable!());

        for (local, value) in &self.locals {
            *frame_locals.local_mut(*local) = value.clone();
        }
    }
}
