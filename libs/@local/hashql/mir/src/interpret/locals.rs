use alloc::{alloc::Global, borrow::Cow, rc::Rc};
use core::{
    alloc::Allocator,
    mem::{self, MaybeUninit},
};

use hashql_core::{id::IdSlice, intern::Interned, symbol::Symbol};

use super::{error::RuntimeError, value::Value};
use crate::{
    body::{
        Body,
        local::{Local, LocalVec},
        operand::Operand,
        place::{FieldIndex, Place, ProjectionKind},
        rvalue::{Aggregate, AggregateKind},
    },
    interpret::value::{Dict, List, Opaque, Struct, Tuple},
};

pub(crate) struct Locals<'heap, A: Allocator = Global> {
    alloc: A,
    inner: LocalVec<Option<Value<'heap, A>>, A>,
}

impl<'heap> Locals<'heap> {
    pub(crate) fn new<E>(
        body: &Body<'heap>,
        args: impl IntoIterator<Item = Result<Value<'heap>, E>>,
    ) -> Result<Self, E> {
        Self::new_in(body, args, Global)
    }
}

impl<'heap, A: Allocator> Locals<'heap, A> {
    pub(crate) fn new_in<E>(
        body: &Body<'heap>,
        args: impl IntoIterator<Item = Result<Value<'heap, A>, E>>,
        alloc: A,
    ) -> Result<Self, E>
    where
        A: Clone,
    {
        let mut locals = LocalVec::with_capacity_in(body.local_decls.len(), alloc.clone());
        for arg in args {
            locals.push(Some(arg?));
        }

        debug_assert_eq!(locals.len(), body.args);

        Ok(Self {
            alloc,
            inner: locals,
        })
    }

    pub(crate) fn insert(&mut self, local: Local, value: Value<'heap, A>) {
        self.inner.insert(local, value);
    }

    pub(crate) fn local(&self, local: Local) -> Result<&Value<'heap, A>, RuntimeError<'heap>> {
        self.inner
            .lookup(local)
            .ok_or(RuntimeError::UninitializedLocal(local))
    }

    pub(crate) fn local_mut(
        &mut self,
        local: Local,
    ) -> Result<&mut Value<'heap, A>, RuntimeError<'heap>> {
        self.inner
            .lookup_mut(local)
            .ok_or(RuntimeError::UninitializedLocal(local))
    }

    pub(crate) fn place(
        &self,
        Place { local, projections }: Place<'heap>,
    ) -> Result<&Value<'heap, A>, RuntimeError<'heap>> {
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

    pub(crate) fn place_mut(
        &mut self,
        place: Place<'heap>,
    ) -> Result<&mut Value<'heap, A>, RuntimeError<'heap>>
    where
        A: Clone,
    {
        let index_projections = place
            .projections
            .iter()
            .filter(|projection| matches!(projection.kind, ProjectionKind::Index(_)))
            .count();
        let mut indices = Vec::with_capacity_in(index_projections, self.alloc.clone());
        place
            .projections
            .iter()
            .filter_map(|projection| match projection.kind {
                ProjectionKind::Index(local) => Some(self.local(local).cloned()),
                _ => None,
            })
            .collect_into(&mut indices);
        // They're in order of operations, but we need to reverse them to actually use them
        indices.reverse();

        let mut value = self.local_mut(place.local)?;

        for projection in place.projections {
            match projection.kind {
                ProjectionKind::Field(field_index) => {
                    value = value.project_mut(field_index)?;
                }
                ProjectionKind::FieldByName(symbol) => {
                    value = value.project_by_name_mut(symbol)?;
                }
                ProjectionKind::Index(_) => {
                    let index = indices.pop().unwrap_or_else(|| unreachable!())?;
                    value = value.subscript_mut(index)?;
                }
            }
        }

        Ok(value)
    }

    pub(crate) fn operand(
        &self,
        operand: Operand<'heap>,
    ) -> Result<Cow<'_, Value<'heap, A>>, RuntimeError<'heap>>
    where
        A: Clone,
    {
        match operand {
            Operand::Place(place) => self.place(place).map(Cow::Borrowed),
            Operand::Constant(constant) => Ok(Cow::Owned(Value::from(constant))),
        }
    }

    // SAFETY: the caller must ensure that operands and slice have the same length.
    #[expect(unsafe_code, clippy::mem_forget)]
    unsafe fn write_operands(
        &self,
        slice: &mut [MaybeUninit<Value<'heap, A>>],
        operands: &[Operand<'heap>],
    ) -> Result<(), RuntimeError<'heap>>
    where
        A: Clone,
    {
        struct Guard<'a, T> {
            slice: &'a mut [MaybeUninit<T>],
            initialized: usize,
        }

        impl<T> Drop for Guard<'_, T> {
            fn drop(&mut self) {
                let initialized_part = &mut self.slice[..self.initialized];
                // SAFETY: this raw sub-slice will contain only initialized objects.
                unsafe {
                    initialized_part.assume_init_drop();
                }
            }
        }

        debug_assert_eq!(
            slice.len(),
            operands.len(),
            "write_operands requires slice and operands to have same length"
        );

        let mut guard = Guard {
            slice,
            initialized: 0,
        };

        for (element, &operand) in guard.slice.iter_mut().zip(operands.iter()) {
            // Returning a value here is fine, we do not return anything from the actual operand,
            // just an error from existing data!
            let value = self.operand(operand)?.into_owned();

            element.write(value);
            guard.initialized += 1;
        }

        // We have successfully written everything, so don't need to drop the guard.
        mem::forget(guard);

        Ok(())
    }

    #[expect(unsafe_code, clippy::panic_in_result_fn)]
    fn aggregate_tuple(
        &self,
        operands: &IdSlice<FieldIndex, Operand<'heap>>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap>>
    where
        A: Clone,
    {
        if operands.is_empty() {
            return Ok(Value::Unit);
        }

        let mut values = Rc::new_uninit_slice_in(operands.len(), self.alloc.clone());
        assert_eq!(values.len(), operands.len());

        // SAFETY: We have exclusive access to the values slice.
        let slice = unsafe { Rc::get_mut_unchecked(&mut values) };

        // SAFETY: operands and slice have the same length by construction.
        unsafe {
            self.write_operands(slice, &operands[..])?;
        }

        // SAFETY: We have just filled the slice with values, and no errors have occurred.
        let values = unsafe { values.assume_init() };
        Ok(Value::Tuple(Tuple::new_unchecked(values)))
    }

    #[expect(unsafe_code, clippy::panic_in_result_fn)]
    fn aggregate_struct(
        &self,
        fields: Interned<'heap, [Symbol<'heap>]>,
        operands: &IdSlice<FieldIndex, Operand<'heap>>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap>>
    where
        A: Clone,
    {
        if fields.len() != operands.len() {
            return Err(RuntimeError::StructFieldLengthMismatch {
                values: operands.len(),
                fields: fields.len(),
            });
        }

        let mut values = Rc::new_uninit_slice_in(operands.len(), self.alloc.clone());
        assert_eq!(values.len(), operands.len());

        // SAFETY: We have exclusive access to the values slice.
        let slice = unsafe { Rc::get_mut_unchecked(&mut values) };

        // SAFETY: operands and slice have the same length by construction.
        unsafe {
            self.write_operands(slice, &operands[..])?;
        }

        // SAFETY: We have just filled the slice with values, and no errors have occurred.
        let values = unsafe { values.assume_init() };
        Ok(Value::Struct(Struct::new_unchecked(fields, values)))
    }

    #[expect(clippy::integer_division_remainder_used)]
    pub(crate) fn aggregate(
        &self,
        Aggregate { kind, operands }: &Aggregate<'heap>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap>>
    where
        A: Clone,
    {
        match *kind {
            AggregateKind::Tuple => self.aggregate_tuple(operands),
            AggregateKind::Struct { fields } => self.aggregate_struct(fields, operands),
            AggregateKind::List => {
                let mut list = List::new();

                for &operand in operands {
                    list.push_back(self.operand(operand)?.into_owned());
                }

                Ok(Value::List(list))
            }
            AggregateKind::Dict => {
                debug_assert_eq!(operands.len() % 2, 0);
                let mut dict = Dict::new();

                for &[key, value] in operands[..].array_windows() {
                    let key = self.operand(key)?.into_owned();
                    let value = self.operand(value)?.into_owned();

                    dict.insert(key, value);
                }

                Ok(Value::Dict(dict))
            }
            AggregateKind::Opaque(name) => {
                debug_assert_eq!(operands.len(), 1);

                let value = self
                    .operand(operands[FieldIndex::OPAQUE_VALUE])?
                    .into_owned();

                Ok(Value::Opaque(Opaque::new(
                    name,
                    Rc::new_in(value, self.alloc.clone()),
                )))
            }
            AggregateKind::Closure => {
                debug_assert_eq!(operands.len(), 2);

                // For the interpreter, a closure is nothing more than a two element tuple. This may
                // change in the future, but is done to simplify the implementation, especially
                // around projection, which is required to return reference values, which isn't
                // possible with a dedicated type easily.
                let operands = Rc::new_in(
                    [
                        self.operand(operands[FieldIndex::FN_PTR])?.into_owned(),
                        self.operand(operands[FieldIndex::ENV])?.into_owned(),
                    ],
                    self.alloc.clone(),
                );

                Ok(Value::Tuple(Tuple::new_unchecked(operands)))
            }
        }
    }
}
