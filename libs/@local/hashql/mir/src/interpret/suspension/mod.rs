mod graph_read;
mod temporal;

use core::alloc::Allocator;

pub(crate) use self::graph_read::extract_axis;
pub use self::temporal::{TemporalAxesInterval, TemporalInterval, Timestamp};
use super::value::Value;
use crate::body::terminator::GraphRead;

pub enum Suspension<'ctx, 'heap> {
    GraphRead(GraphReadSuspension<'ctx, 'heap>),
}

pub struct GraphReadSuspension<'ctx, 'heap> {
    pub read: &'ctx GraphRead<'heap>,
    pub axis: TemporalAxesInterval,
}

impl<'ctx, 'heap> GraphReadSuspension<'ctx, 'heap> {
    pub const fn resolve<A: Allocator>(
        self,
        value: Value<'heap, A>,
    ) -> Continuation<'ctx, 'heap, A> {
        Continuation::GraphRead(GraphReadContinuation {
            read: self.read,
            value,
        })
    }
}

pub enum Continuation<'ctx, 'heap, A: Allocator> {
    GraphRead(GraphReadContinuation<'ctx, 'heap, A>),
}

#[expect(clippy::field_scoped_visibility_modifiers)]
pub struct GraphReadContinuation<'ctx, 'heap, A: Allocator> {
    pub(crate) read: &'ctx GraphRead<'heap>,
    pub(crate) value: Value<'heap, A>,
}
