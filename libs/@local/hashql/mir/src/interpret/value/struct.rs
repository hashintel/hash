//! Struct aggregate for the MIR interpreter.

use alloc::rc::Rc;
use core::{
    alloc::Allocator,
    cmp,
    fmt::{self, Display},
    mem::MaybeUninit,
    ptr,
};

use hashql_core::{algorithms::co_sort, id::Id as _, intern::Interned, symbol::Symbol};

use super::Value;
use crate::{body::place::FieldIndex, intern::Interner};

/// A named-field struct value.
///
/// Contains field names (interned symbols) and their corresponding values.
/// Field order is preserved and significant for comparison.
///
/// # Invariants
///
/// - `fields.len() == values.len()`
/// - Field names should be unique (not enforced at construction)
#[derive(Debug, Clone)]
pub struct Struct<'heap, A: Allocator> {
    fields: Interned<'heap, [Symbol<'heap>]>,
    values: Rc<[Value<'heap, A>], A>,
}

impl<'heap, A: Allocator> Struct<'heap, A> {
    /// Creates a new struct without checking invariants.
    ///
    /// The caller must ensure that `fields` and `values` have the same length.
    pub fn new_unchecked(
        fields: Interned<'heap, [Symbol<'heap>]>,
        values: Rc<[Value<'heap, A>], A>,
    ) -> Self {
        debug_assert_eq!(fields.len(), values.len());
        debug_assert!(fields.is_sorted());

        Self { fields, values }
    }

    /// Creates a new struct from field names and values.
    ///
    /// Returns [`None`] if `fields` and `values` have different lengths.
    #[must_use]
    pub fn new(
        fields: Interned<'heap, [Symbol<'heap>]>,
        values: impl Into<Rc<[Value<'heap, A>], A>>,
    ) -> Option<Self> {
        let values = values.into();

        (fields.len() == values.len()).then(|| Self::new_unchecked(fields, values))
    }

    /// Returns the field names.
    #[must_use]
    pub const fn fields(&self) -> &Interned<'heap, [Symbol<'heap>]> {
        &self.fields
    }

    /// Returns the field values.
    #[must_use]
    pub fn values(&self) -> &[Value<'heap, A>] {
        &self.values
    }

    /// Returns the number of fields.
    #[must_use]
    pub fn len(&self) -> usize {
        self.fields.len()
    }

    /// Returns `true` if the struct has no fields.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }

    /// Returns the value for the given `field` name.
    #[must_use]
    pub fn get_by_name(&self, field: Symbol<'heap>) -> Option<&Value<'heap, A>> {
        self.fields
            .iter()
            .position(|&symbol| symbol == field)
            .map(|index| &self.values[index])
    }

    /// Returns a mutable reference to the value for the given `field` name.
    #[must_use]
    pub fn get_by_name_mut(&mut self, field: Symbol<'heap>) -> Option<&mut Value<'heap, A>>
    where
        A: Clone,
    {
        let values = Rc::make_mut(&mut self.values);
        self.fields
            .iter()
            .position(|&symbol| symbol == field)
            .map(|index| &mut values[index])
    }

    /// Returns a reference to the value at the given field `index`.
    #[must_use]
    pub fn get_by_index(&self, index: FieldIndex) -> Option<&Value<'heap, A>> {
        self.values.get(index.as_usize())
    }

    /// Returns a mutable reference to the value at the given field `index`.
    pub fn get_by_index_mut(&mut self, index: FieldIndex) -> Option<&mut Value<'heap, A>>
    where
        A: Clone,
    {
        let values = Rc::make_mut(&mut self.values);
        values.get_mut(index.as_usize())
    }

    /// Returns an iterator over (field name, value) pairs.
    pub fn iter(&self) -> StructIter<'_, 'heap, A> {
        StructIter {
            fields: self.fields.iter().copied(),
            values: self.values.iter(),
        }
    }

    /// Returns a displayable representation of this struct's type.
    pub fn type_name(&self) -> impl Display {
        fmt::from_fn(|fmt| {
            fmt.write_str("(")?;

            for (index, (key, value)) in self.fields.iter().zip(self.values.iter()).enumerate() {
                if index > 0 {
                    fmt.write_str(", ")?;
                }

                write!(fmt, "{}: {}", key, value.type_name())?;
            }

            fmt.write_str(")")?;

            Ok(())
        })
    }
}

impl<'this, 'heap, A: Allocator> IntoIterator for &'this Struct<'heap, A> {
    type IntoIter = StructIter<'this, 'heap, A>;
    type Item = (Symbol<'heap>, &'this Value<'heap, A>);

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<A: Allocator> PartialEq for Struct<'_, A> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        let Self { fields, values } = self;

        *fields == other.fields && *values == other.values
    }
}

impl<A: Allocator> Eq for Struct<'_, A> {}

impl<A: Allocator> PartialOrd for Struct<'_, A> {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<A: Allocator> Ord for Struct<'_, A> {
    #[inline]
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        let Self { fields, values } = self;

        fields
            .cmp(&other.fields)
            .then_with(|| values.cmp(&other.values))
    }
}

/// Iterator over (field name, value) pairs of a [`Struct`].
pub struct StructIter<'this, 'heap, A: Allocator> {
    fields: core::iter::Copied<core::slice::Iter<'this, Symbol<'heap>>>,
    values: core::slice::Iter<'this, Value<'heap, A>>,
}

impl<'this, 'heap, A: Allocator> Iterator for StructIter<'this, 'heap, A> {
    type Item = (Symbol<'heap>, &'this Value<'heap, A>);

    fn next(&mut self) -> Option<Self::Item> {
        Some((self.fields.next()?, self.values.next()?))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.fields.size_hint()
    }
}

impl<A: Allocator> DoubleEndedIterator for StructIter<'_, '_, A> {
    fn next_back(&mut self) -> Option<Self::Item> {
        Some((self.fields.next_back()?, self.values.next_back()?))
    }
}

impl<A: Allocator> ExactSizeIterator for StructIter<'_, '_, A> {}

/// A builder for [`Struct`] values with capacity for `N` fields.
pub struct StructBuilder<'heap, A: Allocator, const N: usize> {
    /// Number of initialized field-value pairs. Only elements in
    /// `[..initialized]` are considered live for dropping.
    initialized: usize,

    fields: [MaybeUninit<Symbol<'heap>>; N],
    values: [MaybeUninit<Value<'heap, A>>; N],
}

#[expect(unsafe_code)]
impl<'heap, A: Allocator, const N: usize> StructBuilder<'heap, A, N> {
    /// Creates an empty builder with capacity for `N` fields.
    #[must_use]
    pub const fn new() -> Self {
        Self {
            initialized: 0,
            fields: MaybeUninit::uninit().transpose(),
            values: MaybeUninit::uninit().transpose(),
        }
    }

    /// Returns the field names pushed so far.
    #[must_use]
    pub fn fields(&self) -> &[Symbol<'heap>] {
        // SAFETY: `fields[..initialized]` is fully initialized by invariant.
        unsafe { self.fields[..self.initialized].assume_init_ref() }
    }

    /// Returns the field values pushed so far.
    #[must_use]
    pub fn values(&self) -> &[Value<'heap, A>] {
        // SAFETY: `values[..initialized]` is fully initialized by invariant.
        unsafe { self.values[..self.initialized].assume_init_ref() }
    }

    /// Returns the number of fields pushed so far.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.initialized
    }

    /// Returns `true` if no fields have been pushed.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.initialized == 0
    }

    /// Pushes a field-value pair without checking capacity or uniqueness.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `self.initialized < N` (the builder is not full),
    /// and that `field` has not already been pushed.
    pub const unsafe fn push_unchecked(&mut self, field: Symbol<'heap>, value: Value<'heap, A>) {
        // Both `MaybeUninit::write` calls complete without panicking, so
        // incrementing `initialized` afterwards preserves the invariant.
        self.fields[self.initialized].write(field);
        self.values[self.initialized].write(value);

        self.initialized += 1;
    }

    /// Pushes a field-value pair.
    ///
    /// # Panics
    ///
    /// - If the builder is full (`initialized == N`)
    /// - If `field` has already been pushed
    pub fn push(&mut self, field: Symbol<'heap>, value: Value<'heap, A>) {
        assert_ne!(self.initialized, N, "struct is full");
        assert!(!self.fields().contains(&field), "field already exists");

        // SAFETY: we just asserted `initialized < N`.
        unsafe {
            self.push_unchecked(field, value);
        }
    }

    /// Consumes the builder and produces a [`Struct`].
    pub fn finish(mut self, interner: &Interner<'heap>, alloc: A) -> Struct<'heap, A> {
        // SAFETY: `fields[..initialized]` is fully initialized by invariant.
        let fields_mut = unsafe { self.fields[..self.initialized].assume_init_mut() };
        // SAFETY: `values[..initialized]` is fully initialized by invariant.
        let values_mut = unsafe { self.values[..self.initialized].assume_init_mut() };

        // The `Struct` expects that fields are sorted by their symbol.
        // `co_sort` only swaps elements in-place and never leaves holes, so the
        // initialization invariant is preserved even if it were to unwind.
        co_sort(fields_mut, values_mut);

        let fields = interner.symbols.intern_slice(self.fields());

        // Allocate an uninitialized Rc slice for the values.
        //
        // No drop guard is needed here because:
        // - Any panic before `copy_nonoverlapping` leaves ownership with `self`, and
        //   `self.initialized` is unchanged, so `Drop` frees everything.
        // - There is no panicking operation between `copy_nonoverlapping` and `self.initialized =
        //   0`.
        let mut values = Rc::new_uninit_slice_in(self.initialized, alloc);

        // SAFETY: `values` was just created so the refcount is 1 and no other references exist.
        let destination = unsafe { Rc::get_mut_unchecked(&mut values) };

        // SAFETY: we copy exactly `self.initialized` initialized elements from
        // the builder's stack array into the Rc allocation. The source and
        // destination do not overlap (stack vs heap).
        unsafe {
            ptr::copy_nonoverlapping(
                self.values.as_ptr(),
                destination.as_mut_ptr(),
                self.initialized,
            );
        };

        // Ownership of the values has been moved into the Rc via bitwise copy.
        // We must clear the drop frontier so `Drop` does not double-free them.
        self.initialized = 0;

        // SAFETY: all elements in the Rc slice were initialized by the
        // `copy_nonoverlapping` above.
        let values = unsafe { values.assume_init() };

        Struct { fields, values }
    }
}

impl<A: Allocator, const N: usize> Default for StructBuilder<'_, A, N> {
    fn default() -> Self {
        Self::new()
    }
}

#[expect(unsafe_code)]
impl<A: Allocator, const N: usize> Drop for StructBuilder<'_, A, N> {
    fn drop(&mut self) {
        // SAFETY: by invariant, `[..initialized]` is fully initialized.
        // After `finish()` sets `initialized = 0`, this is a no-op.
        unsafe {
            self.fields[..self.initialized].assume_init_drop();
            self.values[..self.initialized].assume_init_drop();
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::alloc::Global;

    use hashql_core::heap::Heap;

    use super::*;
    use crate::interpret::value::{Int, Str, Value};

    fn int(value: i128) -> Value<'static> {
        Value::Integer(Int::from(value))
    }

    fn string(value: &str) -> Value<'static> {
        Value::String(Str::from(Rc::<str>::from(value)))
    }

    #[test]
    fn finish_produces_sorted_fields() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        let sym_b = heap.intern_symbol("b");
        let sym_a = heap.intern_symbol("a");

        // Push in reverse order; finish must sort by symbol.
        let mut builder = StructBuilder::<'_, Global, 2>::new();
        builder.push(sym_b, int(2));
        builder.push(sym_a, int(1));

        let result = builder.finish(&interner, Global);

        // Fields should be sorted: a before b.
        assert_eq!(result.fields().len(), 2);
        assert_eq!(result.get_by_name(sym_a), Some(&int(1)));
        assert_eq!(result.get_by_name(sym_b), Some(&int(2)));
    }

    #[test]
    fn finish_empty_builder() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        let builder = StructBuilder::<'_, Global, 0>::new();
        let result = builder.finish(&interner, Global);

        assert!(result.is_empty());
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn finish_single_field() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        let sym = heap.intern_symbol("only");

        let mut builder = StructBuilder::<'_, Global, 1>::new();
        builder.push(sym, int(42));

        let result = builder.finish(&interner, Global);

        assert_eq!(result.len(), 1);
        assert_eq!(result.get_by_name(sym), Some(&int(42)));
    }

    #[test]
    fn drop_partial_builder_no_double_free() {
        let heap = Heap::new();

        let sym_x = heap.intern_symbol("x");
        let sym_y = heap.intern_symbol("y");

        // Push values with Drop (String contains Rc), then drop the
        // builder without finishing. Miri detects double-free or leak.
        let mut builder = StructBuilder::<'_, Global, 3>::new();
        builder.push(sym_x, string("hello"));
        builder.push(sym_y, string("world"));
        // Capacity is 3 but only 2 are filled; drop must handle this.
        drop(builder);
    }

    #[test]
    fn drop_empty_builder() {
        // Zero initialized elements; Drop should be a no-op.
        let _builder = StructBuilder::<'_, Global, 4>::new();
    }

    #[test]
    fn drop_full_builder_without_finish() {
        let heap = Heap::new();

        let sym_a = heap.intern_symbol("a");
        let sym_b = heap.intern_symbol("b");

        let mut builder = StructBuilder::<'_, Global, 2>::new();
        builder.push(sym_a, string("val_a"));
        builder.push(sym_b, string("val_b"));
        // Full but never finished; Drop must free both.
        drop(builder);
    }

    #[test]
    fn finish_with_drop_values_no_double_free() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        let sym_a = heap.intern_symbol("a");
        let sym_b = heap.intern_symbol("b");

        let mut builder = StructBuilder::<'_, Global, 2>::new();
        builder.push(sym_a, string("alpha"));
        builder.push(sym_b, string("beta"));

        // finish moves values into Rc; builder Drop must not re-drop them.
        let result = builder.finish(&interner, Global);

        assert_eq!(result.len(), 2);
        // Verify values survived the move.
        let Value::String(ref value) = *result.get_by_name(sym_a).expect("field should exist")
        else {
            panic!("expected String");
        };
        assert_eq!(value.as_str(), "alpha");
    }

    #[test]
    fn finish_sorts_drop_values_correctly() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        // Create symbols that sort in a known order.
        let sym_c = heap.intern_symbol("c");
        let sym_a = heap.intern_symbol("a");
        let sym_b = heap.intern_symbol("b");

        // Push in c, a, b order.
        let mut builder = StructBuilder::<'_, Global, 3>::new();
        builder.push(sym_c, string("charlie"));
        builder.push(sym_a, string("alpha"));
        builder.push(sym_b, string("bravo"));

        let result = builder.finish(&interner, Global);

        // After sorting: a, b, c.
        let pairs: Vec<_> = result.iter().collect();
        assert_eq!(pairs.len(), 3);
        assert_eq!(pairs[0].0, sym_a);
        assert_eq!(pairs[1].0, sym_b);
        assert_eq!(pairs[2].0, sym_c);

        // Values must follow their fields.
        let Value::String(ref value) = *pairs[0].1 else {
            panic!("expected String");
        };
        assert_eq!(value.as_str(), "alpha");
    }

    #[test]
    fn fields_and_values_reflect_push_count() {
        let heap = Heap::new();

        let sym_a = heap.intern_symbol("a");
        let sym_b = heap.intern_symbol("b");

        let mut builder = StructBuilder::<'_, Global, 3>::new();
        assert!(builder.is_empty());
        assert_eq!(builder.len(), 0);
        assert!(builder.fields().is_empty());
        assert!(builder.values().is_empty());

        builder.push(sym_a, int(1));
        assert_eq!(builder.len(), 1);
        assert_eq!(builder.fields(), &[sym_a]);
        assert_eq!(builder.values(), &[int(1)]);

        builder.push(sym_b, int(2));
        assert_eq!(builder.len(), 2);
    }

    #[test]
    #[should_panic(expected = "struct is full")]
    fn push_panics_when_full() {
        let heap = Heap::new();

        let sym_a = heap.intern_symbol("a");
        let sym_b = heap.intern_symbol("b");

        let mut builder = StructBuilder::<'_, Global, 1>::new();
        builder.push(sym_a, int(1));
        // This must panic, and the builder's Drop must still free sym_a's value.
        builder.push(sym_b, int(2));
    }

    #[test]
    #[should_panic(expected = "field already exists")]
    fn push_panics_on_duplicate_field() {
        let heap = Heap::new();

        let sym = heap.intern_symbol("dup");

        let mut builder = StructBuilder::<'_, Global, 2>::new();
        builder.push(sym, string("first"));
        // This must panic. "first" must still be freed by Drop.
        builder.push(sym, string("second"));
    }
}
