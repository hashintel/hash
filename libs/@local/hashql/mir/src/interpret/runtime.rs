use alloc::alloc::Global;
use core::alloc::Allocator;
use std::{borrow::Cow, rc::Rc};

use super::{error::RuntimeError, value::Value};
use crate::body::{
    Body,
    basic_block::BasicBlock,
    local::{Local, LocalVec},
    operand::Operand,
    place::{Place, ProjectionKind},
    rvalue::{Aggregate, AggregateKind},
};

struct Locals<'heap, A: Allocator = Global> {
    inner: LocalVec<Option<Value<'heap>>, A>,
}

impl<'heap, A: Allocator> Locals<'heap, A> {
    fn local<'this, 'index>(
        &self,
        local: Local,
    ) -> Result<&Value<'heap>, RuntimeError<'this, 'index, 'heap>> {
        self.inner
            .lookup(local)
            .ok_or(RuntimeError::UninitializedLocal(local))
    }

    fn place(
        &self,
        Place { local, projections }: Place<'heap>,
    ) -> Result<&Value<'heap>, RuntimeError<'_, '_, 'heap>> {
        let mut value = self.local(local)?;

        for projection in projections {
            match projection.kind {
                ProjectionKind::Field(field_index) => {
                    value = value.project(field_index)?;
                }
                ProjectionKind::FieldByName(symbol) => {
                    value = value.project_by_name(symbol)?;
                }
                ProjectionKind::Index(local) => {
                    let index = self.local(local)?;
                    value = value.subscript(index)?;
                }
            }
        }

        Ok(value)
    }

    fn operand(
        &self,
        operand: Operand<'heap>,
    ) -> Result<Cow<'_, Value<'heap>>, RuntimeError<'_, '_, 'heap>> {
        match operand {
            Operand::Place(place) => self.place(place).map(Cow::Borrowed),
            Operand::Constant(constant) => Ok(Cow::Owned(Value::from(constant))),
        }
    }

    // fn aggregate(
    //     &self,
    //     Aggregate { kind, operands }: &Aggregate<'heap>,
    // ) -> Result<Cow<'_, Value<'heap>>, RuntimeError<'_, '_, 'heap>> {
    //     match kind {
    //         AggregateKind::Tuple => {
    //             let mut values = Rc::new_uninit_slice(value);
    //         }
    //         AggregateKind::Struct { fields } => todo!(),
    //         AggregateKind::List => todo!(),
    //         AggregateKind::Dict => todo!(),
    //         AggregateKind::Opaque(symbol) => todo!(),
    //         AggregateKind::Closure => todo!(),
    //     }
    // }
}

struct Frame<'ctx, 'heap> {
    locals: Locals<'heap>,

    body: &'ctx Body<'heap>,
    current_block: &'ctx BasicBlock<'heap>,
    current_statement: usize,
}

impl<'ctx, 'heap> Frame<'ctx, 'heap> {}
