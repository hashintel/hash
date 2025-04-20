#![expect(clippy::type_repetition_in_bounds)]
use core::{fmt::Debug, hash::Hash};

use scc::HashSet;

use super::{
    TypeId,
    kind::{
        TypeKind,
        generic_argument::{GenericArgument, GenericArguments},
        primitive::PrimitiveType,
        r#struct::{StructField, StructFields},
    },
};
use crate::heap::Heap;

#[derive(derive_more::Debug)]
#[debug(bound(T: Eq))]
struct InternSet<'heap, T: ?Sized> {
    inner: HashSet<&'heap T, foldhash::fast::RandomState>,
    heap: &'heap Heap,
}

impl<'heap, T: ?Sized> InternSet<'heap, T> {
    fn new(heap: &'heap Heap) -> Self {
        Self {
            inner: HashSet::with_hasher(foldhash::fast::RandomState::default()),
            heap,
        }
    }
}

impl<'heap, T: ?Sized + Eq + Hash> InternSet<'heap, T> {
    fn insert(&self, value: &'heap T) -> &'heap T
    where
        T: Debug,
    {
        if self.inner.insert(value) == Ok(()) {
            value
        } else {
            tracing::debug!(
                ?value,
                "concurrent insertion detected, using existing value"
            );

            // We never remove so we know this is going to work
            self.inner
                .read(value, |kind| *kind)
                .unwrap_or_else(|| unreachable!())
        }
    }
}

impl<'heap, T> InternSet<'heap, T>
where
    T: Debug + Eq + Hash,
{
    #[expect(clippy::option_if_let_else, reason = "readability")]
    fn intern(&self, value: T) -> &'heap T {
        const { assert!(!core::mem::needs_drop::<T>()) };
        const { assert!(core::mem::size_of::<T>() != 0) };

        if let Some(value) = self.inner.read(&value, |value| *value) {
            value
        } else {
            let value = self.heap.alloc(value);

            self.insert(value)
        }
    }
}

impl<'heap, T> InternSet<'heap, [T]>
where
    T: Debug + Copy + Eq + Hash,
{
    #[expect(clippy::option_if_let_else, reason = "readability")]
    fn intern_slice(&self, value: &[T]) -> &'heap [T] {
        const { assert!(!core::mem::needs_drop::<T>()) };
        const { assert!(core::mem::size_of::<T>() != 0) };

        if let Some(value) = self.inner.read(value, |value| *value) {
            value
        } else {
            let value = self.heap.slice(value);

            self.insert(value)
        }
    }
}

#[derive(Debug)]
pub struct Interner<'heap> {
    // There are some interesting optimizations that can be done here, refer to
    // https://github.com/rust-lang/rust/blob/master/compiler/rustc_middle/src/ty/list.rs#L31
    // for more information.
    kinds: InternSet<'heap, TypeKind<'heap>>,
    type_ids: InternSet<'heap, [TypeId]>,
    generic_arguments: InternSet<'heap, [GenericArgument]>,
    struct_fields: InternSet<'heap, [StructField<'heap>]>,
}

impl<'heap> Interner<'heap> {
    pub(crate) fn new_empty(heap: &'heap Heap) -> Self {
        Self {
            kinds: InternSet::new(heap),
            type_ids: InternSet::new(heap),
            generic_arguments: InternSet::new(heap),
            struct_fields: InternSet::new(heap),
        }
    }

    pub fn new(heap: &'heap Heap) -> Self {
        let this = Self::new_empty(heap);

        this.prefill();

        this
    }

    #[inline]
    fn prefill(&self) {
        self.kinds.intern(TypeKind::Never);
        self.kinds.intern(TypeKind::Unknown);
        self.kinds.intern(TypeKind::Infer);

        self.kinds
            .intern(TypeKind::Primitive(PrimitiveType::Number));
        self.kinds
            .intern(TypeKind::Primitive(PrimitiveType::Integer));
        self.kinds
            .intern(TypeKind::Primitive(PrimitiveType::String));
        self.kinds
            .intern(TypeKind::Primitive(PrimitiveType::Boolean));
        self.kinds.intern(TypeKind::Primitive(PrimitiveType::Null));
    }

    #[inline]
    pub fn intern_kind(&self, kind: TypeKind<'heap>) -> &'heap TypeKind<'heap> {
        self.kinds.intern(kind)
    }

    #[inline]
    pub fn intern_type_ids(&self, ids: &[TypeId]) -> &'heap [TypeId] {
        self.type_ids.intern_slice(ids)
    }

    #[inline]
    pub fn intern_generic_arguments(
        &self,
        arguments: &mut [GenericArgument],
    ) -> GenericArguments<'heap> {
        arguments.sort_unstable_by(|lhs, rhs| lhs.id.cmp(&rhs.id));
        // Unlike `intern_struct_fields`, where we error out on duplicates, we simply remove them
        // here, as any duplicate means they're the same argument and therefore not necessarily an
        // error.
        let (dedupe, _) = arguments.partition_dedup_by_key(|argument| argument.id);

        GenericArguments::from_slice_unchecked(self.generic_arguments.intern_slice(dedupe))
    }

    #[inline]
    pub fn intern_struct_fields<'fields>(
        &self,
        fields: &'fields mut [StructField<'heap>],
    ) -> Result<StructFields<'heap>, &'fields mut [StructField<'heap>]> {
        fields.sort_unstable_by(|lhs, rhs| lhs.key.cmp(&rhs.key));

        let (dedup, duplicates) = fields.partition_dedup_by_key(|field| field.key);

        if !duplicates.is_empty() {
            return Err(duplicates);
        }

        Ok(StructFields::from_slice_unchecked(
            self.struct_fields.intern_slice(dedup),
        ))
    }
}

#[cfg(test)]
mod test {
    use core::ptr;

    use crate::{
        heap::Heap,
        r#type::{
            TypeId,
            intern::Interner,
            kind::{
                TypeKind, generic_argument::GenericArguments, primitive::PrimitiveType,
                tuple::TupleType,
            },
        },
    };

    #[test]
    fn intern_identity_preservation() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        // Intern the same type twice
        let type1 = interner.intern_kind(TypeKind::Primitive(PrimitiveType::String));
        let type2 = interner.intern_kind(TypeKind::Primitive(PrimitiveType::String));

        // They should be the same object (pointer equality)
        assert!(
            ptr::eq(type1, type2),
            "Interned types should have the same address"
        );

        // And of course they should be equal
        assert_eq!(type1, type2, "Interned types should be equal");
    }

    #[test]
    fn intern_different_types() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        // Intern different types
        let string_type = interner.intern_kind(TypeKind::Primitive(PrimitiveType::String));
        let number_type = interner.intern_kind(TypeKind::Primitive(PrimitiveType::Number));

        // They should be different objects
        assert!(
            !ptr::eq(string_type, number_type),
            "Different types should have different addresses"
        );
        assert_ne!(
            string_type, number_type,
            "Different types should not be equal"
        );
    }

    #[test]
    fn intern_slices() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        // Create some TypeIds for testing
        let type_ids1 = [TypeId::new(1), TypeId::new(2), TypeId::new(3)];
        let type_ids2 = [TypeId::new(1), TypeId::new(2), TypeId::new(3)]; // Same content
        let type_ids3 = [TypeId::new(4), TypeId::new(5)]; // Different content

        // Intern the slices
        let interned1 = interner.intern_type_ids(&type_ids1);
        let interned2 = interner.intern_type_ids(&type_ids2);
        let interned3 = interner.intern_type_ids(&type_ids3);

        // Check identity preservation for same content
        assert!(
            ptr::eq(interned1, interned2),
            "Same content slices should have the same address"
        );
        assert_eq!(interned1, interned2, "Same content slices should be equal");

        // Check different slices
        assert!(
            !ptr::eq(interned1, interned3),
            "Different content slices should have different addresses"
        );
        assert_ne!(
            interned1, interned3,
            "Different content slices should not be equal"
        );
    }

    #[test]
    fn prefilled_types() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        // Check that prefilled types are accessible and maintain identity
        let never1 = interner.intern_kind(TypeKind::Never);
        let never2 = interner.intern_kind(TypeKind::Never);
        assert!(
            ptr::eq(never1, never2),
            "Prefilled types should maintain identity"
        );

        // Check all other prefilled primitive types
        let number1 = interner.intern_kind(TypeKind::Primitive(PrimitiveType::Number));
        let number2 = interner.intern_kind(TypeKind::Primitive(PrimitiveType::Number));
        assert!(
            ptr::eq(number1, number2),
            "Prefilled primitive types should maintain identity"
        );

        let string1 = interner.intern_kind(TypeKind::Primitive(PrimitiveType::String));
        let string2 = interner.intern_kind(TypeKind::Primitive(PrimitiveType::String));
        assert!(
            ptr::eq(string1, string2),
            "Prefilled primitive types should maintain identity"
        );
    }

    #[test]
    fn complex_interning() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);

        // First create some type IDs to use in the tuple
        let string_id = TypeId::new(1); // Note: In a real scenario, you would get a proper TypeId
        let number_id = TypeId::new(2); // Note: In a real scenario, you would get a proper TypeId

        // Create type IDs slice and intern it
        let field_ids = [string_id, number_id];
        let interned_ids = interner.intern_type_ids(&field_ids);

        // Create tuple type 1
        let tuple_type1 = TypeKind::Tuple(TupleType {
            fields: interned_ids,
            arguments: GenericArguments::empty(),
        });

        // Create tuple type 2 (same structure)
        let tuple_type2 = TypeKind::Tuple(TupleType {
            fields: interned_ids, // Reuse the same interned IDs
            arguments: GenericArguments::empty(),
        });

        // Intern both tuple types
        let interned_tuple1 = interner.intern_kind(tuple_type1);
        let interned_tuple2 = interner.intern_kind(tuple_type2);

        // Check identity preservation for complex types
        assert!(
            ptr::eq(interned_tuple1, interned_tuple2),
            "Complex types with same structure should have the same address"
        );
    }
}
