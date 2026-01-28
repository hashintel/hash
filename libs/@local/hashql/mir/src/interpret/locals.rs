//! Local variable storage for interpreter frames.
//!
//! This module provides [`Locals`], the storage container for local variables
//! within a single call frame. It supports:
//!
//! - Reading and writing individual locals
//! - Place projection (field access, indexing)
//! - Operand evaluation (constants and places)
//! - Aggregate construction (structs, tuples, lists, dicts)

use alloc::{borrow::Cow, rc::Rc};
use core::{
    alloc::Allocator,
    mem::{self, MaybeUninit},
};

use hashql_core::{id::IdSlice, intern::Interned, symbol::Symbol};

use super::{error::RuntimeError, scratch::Scratch, value::Value};
use crate::{
    body::{
        Body,
        local::{Local, LocalDecl, LocalSlice, LocalVec},
        operand::Operand,
        place::{FieldIndex, Place, ProjectionKind},
        rvalue::{Aggregate, AggregateKind},
    },
    interpret::value::{Dict, List, Opaque, Struct, Tuple},
};

/// Local variable storage for a single call frame.
///
/// Stores the values of local variables during interpretation of a function.
/// Locals are indexed by [`Local`] and may be uninitialized.
pub(crate) struct Locals<'ctx, 'heap, A: Allocator> {
    /// Allocator for creating new values.
    alloc: A,
    /// Local variable declarations (for error reporting).
    decl: &'ctx LocalSlice<LocalDecl<'heap>>,
    /// Storage for local variable values.
    inner: LocalVec<Value<'heap, A>, A>,
}

impl<'ctx, 'heap, A: Allocator> Locals<'ctx, 'heap, A> {
    /// Creates a new locals storage with a custom allocator.
    ///
    /// Initializes the storage with the provided arguments as the first locals.
    /// The number of arguments must match the body's `args` count.
    ///
    /// # Panics
    ///
    /// Panics if the number of arguments is larger than the set of local declarations.
    #[inline]
    #[expect(clippy::panic_in_result_fn)]
    pub(crate) fn new_in<E>(
        body: &'ctx Body<'heap>,
        args: impl ExactSizeIterator<Item = Result<Value<'heap, A>, E>>,
        alloc: A,
    ) -> Result<Self, E>
    where
        A: Clone,
    {
        assert!(body.local_decls.len() >= args.len());

        let mut locals = LocalVec::with_capacity_in(body.local_decls.len(), alloc.clone());
        for arg in args {
            locals.push(arg?);
        }

        debug_assert_eq!(locals.len(), body.args);

        Ok(Self {
            alloc,
            decl: &body.local_decls,
            inner: locals,
        })
    }

    /// Inserts or updates a local variable value.
    #[inline]
    pub(crate) fn insert(&mut self, local: Local, value: Value<'heap, A>) {
        *self.inner.fill_until(local, || Value::Unit) = value;
    }

    /// Gets a reference to a local variable's value.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError::UninitializedLocal`] if the local has not been
    /// initialized.
    #[inline]
    pub(crate) fn local(&self, local: Local) -> Result<&Value<'heap, A>, RuntimeError<'heap, A>> {
        self.inner.get(local).ok_or_else(|| {
            let decl = self.decl[local];
            RuntimeError::UninitializedLocal { local, decl }
        })
    }

    /// Gets a mutable reference to a local variable's value.
    #[inline]
    pub(crate) fn local_mut(&mut self, local: Local) -> &mut Value<'heap, A> {
        self.inner.fill_until(local, || Value::Unit)
    }

    /// Evaluates a place expression to get a reference to the value.
    ///
    /// Follows the chain of projections (field access, indexing) to reach
    /// the final value.
    #[inline]
    pub(crate) fn place(
        &self,
        Place { local, projections }: &Place<'heap>,
    ) -> Result<&Value<'heap, A>, RuntimeError<'heap, A>> {
        let mut value = self.local(*local)?;

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

    /// Evaluates a place expression to get a mutable reference to the value.
    ///
    /// Follows the chain of projections (field access, indexing) to reach
    /// the final value. Index projections are evaluated before the mutable
    /// borrow to avoid borrowing conflicts.
    #[inline]
    pub(crate) fn place_mut(
        &mut self,
        place: Place<'heap>,
        scratch: &mut Scratch<'heap, A>,
    ) -> Result<&mut Value<'heap, A>, RuntimeError<'heap, A>>
    where
        A: Clone,
    {
        place
            .projections
            .iter()
            .rev()
            .filter_map(|projection| match projection.kind {
                ProjectionKind::Index(local) => Some(self.local(local).cloned()),
                ProjectionKind::Field(_) | ProjectionKind::FieldByName(_) => None,
            })
            .try_fold(&mut scratch.indices, |acc, index| {
                acc.push(index?);
                Ok(acc)
            })?;

        let mut value = self.local_mut(place.local);

        for projection in place.projections {
            match projection.kind {
                ProjectionKind::Field(field_index) => {
                    value = value.project_mut(field_index)?;
                }
                ProjectionKind::FieldByName(symbol) => {
                    value = value.project_by_name_mut(symbol)?;
                }
                ProjectionKind::Index(_) => {
                    let index = scratch.indices.pop().unwrap_or_else(|| unreachable!());
                    value = value.subscript_mut(&index)?;
                }
            }
        }

        debug_assert!(scratch.indices.is_empty());

        Ok(value)
    }

    /// Evaluates an operand to get its value.
    ///
    /// - For place operands: evaluates the place and borrows the value
    /// - For constant operands: converts the constant to a value
    pub(crate) fn operand(
        &self,
        operand: &Operand<'heap>,
    ) -> Result<Cow<'_, Value<'heap, A>>, RuntimeError<'heap, A>>
    where
        A: Clone,
    {
        match operand {
            Operand::Place(place) => self.place(place).map(Cow::Borrowed),
            Operand::Constant(constant) => Ok(Cow::Owned(Value::from(constant))),
        }
    }

    /// Writes operand values into an uninitialized slice.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `operands` and `slice` have the same length.
    #[expect(unsafe_code, clippy::mem_forget)]
    unsafe fn write_operands(
        &self,
        slice: &mut [MaybeUninit<Value<'heap, A>>],
        operands: &[Operand<'heap>],
    ) -> Result<(), RuntimeError<'heap, A>>
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

        for (element, operand) in guard.slice.iter_mut().zip(operands.iter()) {
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

    /// Constructs a tuple value from operands.
    ///
    /// Returns [`Value::Unit`] for empty tuples.
    #[expect(unsafe_code, clippy::panic_in_result_fn)]
    fn aggregate_tuple(
        &self,
        operands: &IdSlice<FieldIndex, Operand<'heap>>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, A>>
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

    /// Constructs a struct value from field names and operands.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeError::StructFieldLengthMismatch`] if the number of
    /// fields does not match the number of operands.
    #[expect(unsafe_code, clippy::panic_in_result_fn)]
    fn aggregate_struct(
        &self,
        fields: Interned<'heap, [Symbol<'heap>]>,
        operands: &IdSlice<FieldIndex, Operand<'heap>>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, A>>
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

    /// Constructs an aggregate value (tuple, struct, list, dict, opaque, closure).
    ///
    /// Dispatches to the appropriate construction method based on the aggregate
    /// kind and evaluates all operands to build the result.
    #[expect(clippy::integer_division_remainder_used)]
    pub(crate) fn aggregate(
        &self,
        Aggregate { kind, operands }: &Aggregate<'heap>,
    ) -> Result<Value<'heap, A>, RuntimeError<'heap, A>>
    where
        A: Clone,
    {
        match *kind {
            AggregateKind::Tuple => self.aggregate_tuple(operands),
            AggregateKind::Struct { fields } => self.aggregate_struct(fields, operands),
            AggregateKind::List => {
                let mut list = List::new();

                for operand in operands {
                    list.push_back(self.operand(operand)?.into_owned());
                }

                Ok(Value::List(list))
            }
            AggregateKind::Dict => {
                debug_assert_eq!(operands.len() % 2, 0);
                let mut dict = Dict::new();

                for [key, value] in operands[..].iter().array_chunks() {
                    let key = self.operand(key)?.into_owned();
                    let value = self.operand(value)?.into_owned();

                    dict.insert(key, value);
                }

                Ok(Value::Dict(dict))
            }
            AggregateKind::Opaque(name) => {
                debug_assert_eq!(operands.len(), 1);

                let value = self
                    .operand(&operands[FieldIndex::OPAQUE_VALUE])?
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
                        self.operand(&operands[FieldIndex::FN_PTR])?.into_owned(),
                        self.operand(&operands[FieldIndex::ENV])?.into_owned(),
                    ],
                    self.alloc.clone(),
                );

                Ok(Value::Tuple(Tuple::new_unchecked(operands)))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #![expect(unsafe_code)]
    use alloc::{alloc::Global, vec::Vec};
    use core::mem::MaybeUninit;
    use std::assert_matches::assert_matches;

    use hashql_core::{
        heap::Heap,
        id::{Id as _, IdSlice},
        span::SpanId,
        r#type::TypeId,
    };

    use super::Locals;
    use crate::{
        body::{
            constant::Constant,
            local::{Local, LocalDecl, LocalSlice, LocalVec},
            operand::Operand,
            place::{FieldIndex, Place},
        },
        intern::Interner,
        interpret::{
            error::RuntimeError,
            value::{Int, Value},
        },
    };

    fn fill_decl(decl: &mut LocalVec<LocalDecl<'_>>, max_index: Local) {
        decl.fill_until(max_index, || LocalDecl {
            span: SpanId::SYNTHETIC,
            r#type: TypeId::PLACEHOLDER,
            name: None,
        });
    }

    fn make_empty_locals<'ctx, 'heap>(
        decl: &'ctx LocalSlice<LocalDecl<'heap>>,
    ) -> Locals<'ctx, 'heap, Global> {
        Locals {
            alloc: Global,
            decl,
            inner: LocalVec::new(),
        }
    }

    fn make_locals_with_single_int<'ctx, 'heap>(
        decl: &'ctx mut LocalVec<LocalDecl<'heap>>,
        local: Local,
        value: i128,
    ) -> Locals<'ctx, 'heap, Global> {
        let mut inner = LocalVec::new();
        *inner.fill_until(local, || Value::Unit) = Value::Integer(Int::from(value));
        fill_decl(decl, local);

        Locals {
            alloc: Global,
            decl,
            inner,
        }
    }

    /// Normal success case: mix of constant and place operands.
    ///
    /// Verifies that:
    /// - values are written into the `MaybeUninit` slice correctly
    /// - both `Constant` and `Place` operands are handled
    #[test]
    fn write_operands_success_with_place_and_constant() {
        let mut decl = LocalVec::new();
        let place = Local::new(0);

        let locals = make_locals_with_single_int(&mut decl, place, 21);

        let operands = [
            Operand::Constant(Constant::Int(Int::from(1_i128))),
            Operand::Place(Place::local(place)),
        ];

        let mut buf = [MaybeUninit::uninit(), MaybeUninit::uninit()];

        // SAFETY: The buffer has not been written to yet and operands == buf
        unsafe {
            locals
                .write_operands(&mut buf, &operands)
                .expect("write_operands should not fail");
        }

        // SAFETY: `write_operands` has initialized all elements on success.
        let [v0, v1] = unsafe { MaybeUninit::array_assume_init(buf) };

        assert_eq!(v0, Value::Integer(Int::from(1_i128)));
        assert_eq!(v1, Value::Integer(Int::from(21_i128)));
    }

    /// Error / partial-init case:
    ///
    /// - First operand is a constant and is written successfully.
    /// - Second operand is a `Place` that refers to an uninitialized local and errors.
    ///
    /// This exercises the `Guard::drop` path that calls `assume_init_drop` on the
    /// already-initialized prefix of the slice. The test itself does not read from
    /// the slice after the error; under Miri this will catch any double-drop or
    /// use of uninitialized memory inside `write_operands`.
    #[test]
    fn write_operands_partial_init_error_drops_initialized() {
        // No locals initialized at all.
        let mut decl = LocalVec::new();
        fill_decl(&mut decl, Local::new(2));
        let locals = make_empty_locals(&decl);

        let operands = [
            // This will be written successfully.
            Operand::Constant(Constant::Int(Int::from(1_i128))),
            // This will attempt to read an uninitialized local and error.
            Operand::Place(Place::local(Local::new(1))),
            // This won't be written because the error occurs before it.
            Operand::Constant(Constant::Int(Int::from(2_i128))),
        ];

        let mut buf = [
            MaybeUninit::uninit(),
            MaybeUninit::uninit(),
            MaybeUninit::uninit(),
        ];

        // SAFETY: The buffer has not been written to yet and operands == buf
        let result = unsafe { locals.write_operands(&mut buf, &operands) };
        assert_matches!(result, Err(RuntimeError::UninitializedLocal{local, ..}) if local == Local::new(1));

        // IMPORTANT: Do not read from `buf` here. On error, the internal Guard has
        // already dropped all initialized elements using `assume_init_drop`, and the
        // memory is now logically uninitialized. Miri will verify that this path is
        // memory-safe.
    }

    /// Empty operands edge case:
    ///
    /// - Calls `write_operands` with an empty slice and empty operands (no-op).
    /// - Also constructs an empty `IdSlice<FieldIndex, Operand>` and uses `aggregate_tuple` to
    ///   ensure that the empty-aggregate fast path returns `Value::Unit`.
    #[test]
    fn write_operands_handles_empty_operands_and_id_slice() {
        let decl = LocalVec::new();
        let locals = make_empty_locals(&decl);

        // Direct call to `write_operands` on an empty slice.
        let mut buf: [_; 0] = [];
        let operands: [_; 0] = [];

        // SAFETY: The buffer is empty, so no writes are performed.
        unsafe {
            locals
                .write_operands(&mut buf, &operands)
                .expect("should not fail");
        }

        let value = locals
            .aggregate_tuple(IdSlice::from_raw(&[]))
            .expect("should not fail");
        assert_eq!(value, Value::Unit);
    }

    /// Success path through `aggregate_tuple` with non-empty operands.
    ///
    /// Exercises the full unsafe chain:
    /// - `Rc::new_uninit_slice_in`
    /// - `Rc::get_mut_unchecked`
    /// - `write_operands` (success path)
    /// - `Rc::assume_init`
    /// - `Tuple::new_unchecked`
    ///
    /// Miri will catch double-drop if `mem::forget(guard)` is missing, or
    /// uninitialized reads if the slice isn't fully written.
    #[test]
    fn aggregate_tuple_success_exercises_full_unsafe_chain() {
        let mut decl = LocalVec::new();
        let place = Local::new(0);

        let locals = make_locals_with_single_int(&mut decl, place, 42);

        let operands: Vec<Operand<'_>> = vec![
            Operand::Constant(Constant::Int(Int::from(1_i128))),
            Operand::Constant(Constant::Int(Int::from(2_i128))),
            Operand::Place(Place::local(place)),
        ];

        let value = locals
            .aggregate_tuple(IdSlice::from_raw(&operands))
            .expect("aggregate_tuple should succeed");

        let Value::Tuple(tuple) = value else {
            panic!("expected Value::Tuple, got {value:?}");
        };

        assert_eq!(tuple.len().get(), 3);
        assert_eq!(
            tuple.get(FieldIndex::from_usize(0)),
            Some(&Value::Integer(Int::from(1_i128)))
        );
        assert_eq!(
            tuple.get(FieldIndex::from_usize(1)),
            Some(&Value::Integer(Int::from(2_i128)))
        );
        assert_eq!(
            tuple.get(FieldIndex::from_usize(2)),
            Some(&Value::Integer(Int::from(42_i128)))
        );
    }

    /// Success path through `aggregate_struct` with non-empty operands.
    ///
    /// Exercises the same unsafe chain as `aggregate_tuple`, plus the field names handling.
    /// Miri will catch any memory safety issues in the struct aggregate path.
    #[test]
    fn aggregate_struct_success_exercises_full_unsafe_chain() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        let mut decl = LocalVec::new();
        let place = Local::new(0);

        let locals = make_locals_with_single_int(&mut decl, place, 99);

        let fields = interner
            .symbols
            .intern_slice(&[heap.intern_symbol("a"), heap.intern_symbol("b")]);

        let operands: Vec<Operand<'_>> = vec![
            Operand::Constant(Constant::Int(Int::from(10_i128))),
            Operand::Place(Place::local(place)),
        ];

        let value = locals
            .aggregate_struct(fields, IdSlice::from_raw(&operands))
            .expect("aggregate_struct should succeed");

        let Value::Struct(r#struct) = value else {
            panic!("expected Value::Struct, got {value:?}");
        };

        assert_eq!(r#struct.len(), 2);
        assert_eq!(
            r#struct.get_by_index(FieldIndex::from_usize(0)),
            Some(&Value::Integer(Int::from(10_i128)))
        );
        assert_eq!(
            r#struct.get_by_index(FieldIndex::from_usize(1)),
            Some(&Value::Integer(Int::from(99_i128)))
        );
    }
}
