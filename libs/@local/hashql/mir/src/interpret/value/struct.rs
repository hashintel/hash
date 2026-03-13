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

pub struct StructBuilder<'heap, A: Allocator, const N: usize> {
    initialized: usize,

    fields: [MaybeUninit<Symbol<'heap>>; N],
    values: [MaybeUninit<Value<'heap, A>>; N],
}

#[expect(unsafe_code)]
impl<'heap, A: Allocator, const N: usize> StructBuilder<'heap, A, N> {
    pub const fn new() -> Self {
        Self {
            initialized: 0,
            fields: MaybeUninit::uninit().transpose(),
            values: MaybeUninit::uninit().transpose(),
        }
    }

    pub fn fields(&self) -> &[Symbol<'heap>] {
        unsafe { self.fields[..self.initialized].assume_init_ref() }
    }

    fn fields_mut(&mut self) -> &mut [Symbol<'heap>] {
        unsafe { self.fields[..self.initialized].assume_init_mut() }
    }

    pub fn values(&self) -> &[Value<'heap, A>] {
        unsafe { self.values[..self.initialized].assume_init_ref() }
    }

    fn values_mut(&mut self) -> &mut [Value<'heap, A>] {
        unsafe { self.values[..self.initialized].assume_init_mut() }
    }

    pub const unsafe fn push_unchecked(&mut self, field: Symbol<'heap>, value: Value<'heap, A>) {
        let index = self.initialized;
        self.initialized += 1;

        self.fields[index].write(field);
        self.values[index].write(value);
    }

    pub fn push(&mut self, field: Symbol<'heap>, value: Value<'heap, A>) {
        assert_ne!(self.initialized, N, "struct is full");
        assert!(!self.fields().contains(&field), "field already exists");

        unsafe {
            self.push_unchecked(field, value);
        }
    }

    pub fn finish(mut self, interner: &Interner<'heap>, alloc: A) -> Struct<'heap, A> {
        let fields_mut = unsafe { self.fields[..self.initialized].assume_init_mut() };
        let values_mut = unsafe { self.values[..self.initialized].assume_init_mut() };

        // The `struct` expects that fields are sorted by their symbol.
        // TODO: should be enforced
        co_sort(fields_mut, values_mut);

        let fields = interner.symbols.intern_slice(self.fields());

        // We don't need a drop-guard here, because the only thing that can panic is the
        // `new_uninit_slice_in` call, in the case that it does `self.initialized` is still not set,
        // which leads to the drop correctly firing.
        let values = Rc::new_uninit_slice_in(self.initialized, alloc);

        unsafe {
            ptr::copy_nonoverlapping(
                self.values.as_mut_ptr(),
                Rc::as_ptr(&values) as *mut MaybeUninit<Value<'heap, A>>,
                self.initialized,
            );
        };

        // We must set the initialized count to 0, to avoid double-freeing
        // when the builder is dropped.
        self.initialized = 0;

        let values = unsafe { values.assume_init() };
        Struct { fields, values }
    }
}

#[expect(unsafe_code)]
impl<'heap, A: Allocator, const N: usize> Drop for StructBuilder<'heap, A, N> {
    fn drop(&mut self) {
        unsafe {
            self.fields[..self.initialized].assume_init_drop();
            self.values[..self.initialized].assume_init_drop();
        }
    }
}
