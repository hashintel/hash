use core::cmp::Ordering;

use smallvec::SmallVec;

use crate::r#type::{TypeId, environment::Environment};

/// Compares two pointers by their memory addresses.
///
/// This is safe for comparing interned values where pointer equality
/// corresponds to value equality, like interned values.
fn ptr_cmp<T: ?Sized>(lhs: *const T, rhs: *const T) -> Ordering {
    lhs.addr().cmp(&rhs.addr())
}

/// Checks if two pointers point to the same memory address.
///
/// This is safe for comparing interned values where pointer equality
/// corresponds to value equality, like interned values.
fn ptr_eq<T: ?Sized>(lhs: *const T, rhs: *const T) -> bool {
    lhs.addr() == rhs.addr()
}

/// A set-like collection for `TypeId` values that efficiently deduplicates based on
/// the underlying `TypeKind`.
///
/// Since `TypeKind` is interned, identical types will have the same memory address,
/// allowing for fast pointer-based comparisons and deduplication.
///
/// This collection uses `SmallVec` to avoid heap allocations for small sets
/// (up to `CAPACITY` items).
#[derive(Debug)]
pub(crate) struct TypeIdSet<'env, 'heap, const CAPACITY: usize> {
    env: &'env Environment<'heap>,
    items: SmallVec<TypeId, CAPACITY>,
}

impl<'env, 'heap, const CAPACITY: usize> TypeIdSet<'env, 'heap, CAPACITY> {
    /// Creates a new empty `TypeIdSet`.
    #[cfg(test)]
    pub(crate) const fn new(env: &'env Environment<'heap>) -> Self {
        Self {
            env,
            items: SmallVec::new(),
        }
    }

    /// Creates a new `TypeIdSet` with the specified capacity.
    ///
    /// This is useful when the expected number of items is known in advance
    /// to avoid reallocations.
    #[must_use]
    pub(crate) fn with_capacity(env: &'env Environment<'heap>, capacity: usize) -> Self {
        Self {
            env,
            items: SmallVec::with_capacity(capacity),
        }
    }

    /// Adds a single `TypeId` to the set.
    ///
    /// Note that deduplication happens during the `finish` operation,
    /// not when items are added.
    pub(crate) fn push(&mut self, item: TypeId) {
        self.items.push(item);
    }

    /// Adds multiple `TypeId` values from a slice to the set.
    pub(crate) fn extend_from_slice(&mut self, other: &[TypeId]) {
        self.items.extend_from_slice(other);
    }

    /// Finalizes the set by sorting and deduplicating the items.
    ///
    /// This method consumes the `TypeIdSet` and returns a `SmallVec`
    /// containing unique `TypeId` values sorted by their underlying `TypeKind`
    /// memory addresses.
    ///
    /// Deduplication is performed using pointer comparison of the underlying
    /// `TypeKind` values, which is safe because `TypeKind` is interned.
    ///
    /// # Performance Characteristics
    ///
    /// - Time Complexity: O(n log n) where n is the number of items
    ///   - O(n log n) for sorting via `sort_unstable_by`.
    ///   - O(n) for deduplication via `dedup_by`.
    /// - Space Complexity: O(1) auxiliary space (in-place operations)
    /// - Memory:
    ///   - No additional allocations beyond the original `SmallVec`
    ///   - For sets smaller than `CAPACITY`, no heap allocation occurs at all
    ///
    /// # Optimizations
    ///
    /// - Uses `sort_unstable_by` which is generally faster than stable sort
    /// - Leverages pointer comparison of interned `TypeKind` values for O(1) equality checks
    /// - Returns the internal `SmallVec` directly without copying
    pub(crate) fn finish(mut self) -> SmallVec<TypeId, CAPACITY> {
        // There are multiple possible optimizations here that could be implemented in the future:
        // - Hash based deduplication using a `HashSet` to track seen types.
        // - Cached deduplication using a variant of `(TypeId, *const TypeKind)`, which would incur
        //   an additional allocation, but would save on lookups.
        // - Sort on insertion via bookkeeping of seen types.
        // - Hybrid approach (> 32 e.g. via hashing, < 8 via current implementation, < 32 via
        //   caching).
        // As we expect the number of types to always be small (< 8), this seems sufficient, in case
        // in the future this leads to performance issues these are possible ways to optimize
        // further.

        // Due to the fact that some of the items might not yet be materialized (e.g. are
        // provisioned and referenced, but do not exist yet), we need to split the set into two
        // parts and partition and dedupe them separately.
        self.items
            .sort_unstable_by_key(|&id| self.env.types.contains(id));
        let partition_point = self
            .items
            .partition_point(|&id| !self.env.types.contains(id));

        let (provisioned, materialized) = self.items.split_at_mut(partition_point);

        // Handle provisioned types, which - unlike materialized types - can only be compared by
        // their ID.
        provisioned.sort_unstable();
        let len_provisioned = provisioned.len();
        let (_, removed) = provisioned.partition_dedup();
        let excess_provisioned = removed.len();

        // Handle materialized types, which can be compared by their kind, making deduplication
        // irrespective of the span.
        materialized.sort_unstable_by(|&lhs, &rhs| {
            ptr_cmp(self.env.r#type(lhs).kind, self.env.r#type(rhs).kind)
        });
        let len_materialized = materialized.len();
        let (_, removed) = materialized.partition_dedup_by(|lhs, rhs| {
            ptr_eq(self.env.r#type(*lhs).kind, self.env.r#type(*rhs).kind)
        });
        let excess_materialized = removed.len();

        // We're now at a place where we have the following layout:
        // [provisioned, excess, materialized, excess]
        // What we now need to do is shift the materialized items to the excess, and then cut the
        // excess items
        self.items.copy_within(
            len_provisioned..(len_provisioned + len_materialized - excess_materialized),
            len_provisioned - excess_provisioned,
        );

        self.items.truncate(
            len_provisioned + len_materialized - excess_provisioned - excess_materialized,
        );

        self.items
    }
}

impl<const CAPACITY: usize> Extend<TypeId> for TypeIdSet<'_, '_, CAPACITY> {
    fn extend<T: IntoIterator<Item = TypeId>>(&mut self, iter: T) {
        self.items.extend(iter);
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::min_ident_chars)]
    use crate::{
        heap::Heap,
        span::SpanId,
        r#type::{
            collection::TypeIdSet,
            environment::Environment,
            kind::{TypeKind, primitive::PrimitiveType, test::primitive},
            tests::instantiate,
        },
    };

    #[test]
    fn empty_set() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        let set = TypeIdSet::<16>::new(&env);
        let result = set.finish();
        assert_eq!(result.len(), 0);
    }

    #[test]
    fn single_item() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        let boolean = primitive!(env, PrimitiveType::Boolean);

        let mut set = TypeIdSet::<16>::new(&env);
        set.push(boolean);

        let result = set.finish();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], boolean);
    }

    #[test]
    fn multiple_items() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        let boolean = primitive!(env, PrimitiveType::Boolean);
        let integer = primitive!(env, PrimitiveType::Integer);
        let string = primitive!(env, PrimitiveType::String);

        let mut set = TypeIdSet::<16>::new(&env);
        set.push(string);
        set.push(boolean);
        set.push(integer);

        let result = set.finish();
        // Because we decided to create a non-prefilled version of the environment, the order of the
        // types is guaranteed to be reverse insertion order (bumpalo always bumps down)
        assert_eq!(result, [string, integer, boolean]);
    }

    #[test]
    fn deduplication() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        let a = primitive!(env, PrimitiveType::Boolean);
        let b = primitive!(env, PrimitiveType::Boolean);

        let mut set = TypeIdSet::<16>::new(&env);
        set.push(a);
        set.push(b);

        let result = set.finish();
        // Since both TypeIds point to the same kind, one should be deduplicated
        // We do not know or cannot guarantee which one will be deduplicated.
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn extend_from_slice() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        let boolean = primitive!(env, PrimitiveType::Boolean);
        let integer = primitive!(env, PrimitiveType::Integer);

        let mut set = TypeIdSet::<16>::new(&env);
        set.extend_from_slice(&[boolean, integer]);

        let result = set.finish();
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn with_capacity() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        // Create a set with specific capacity
        let set = TypeIdSet::<16>::with_capacity(&env, 32);
        let result = set.finish();

        assert_eq!(result.len(), 0);
        assert!(result.capacity() >= 32);
    }

    #[test]
    fn extend_trait() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        let boolean = primitive!(env, PrimitiveType::Boolean);
        let integer = primitive!(env, PrimitiveType::Integer);

        let mut set = TypeIdSet::<16>::new(&env);
        set.extend([boolean, integer]);

        let result = set.finish();
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn mixed_provisioned_and_materialized() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        // Create materialized types
        let boolean = primitive!(env, PrimitiveType::Boolean);
        let string = primitive!(env, PrimitiveType::String);

        // Create provisioned types (not yet materialized)
        let provisioned1 = env.types.provision();
        let provisioned2 = env.types.provision();

        let mut set = TypeIdSet::<16>::new(&env);
        set.push(boolean);
        set.push(provisioned1.value());
        set.push(string);
        set.push(provisioned2.value());

        let result = set.finish();

        // We should have 4 unique types: 2 materialized and 2 provisioned
        assert_eq!(result.len(), 4);

        // The result should be partitioned with provisioned types first, then materialized
        // We can verify this by checking if the first elements are not in the environment
        for i in 0..2 {
            assert!(!env.types.contains(result[i]));
        }

        for i in 2..4 {
            assert!(env.types.contains(result[i]));
        }
    }

    #[test]
    fn deduplication_of_provisioned() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        // Create a provisioned type and use it twice
        let provisioned = env.types.provision();

        let mut set = TypeIdSet::<16>::new(&env);
        set.push(provisioned.value());
        set.push(provisioned.value()); // Same provisioned id, should be deduplicated

        let result = set.finish();

        // Should have only one unique provisioned type
        assert_eq!(result.len(), 1);
        assert!(!env.types.contains(result[0]));
    }

    #[test]
    fn mixed_with_duplicates() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        // Create materialized types with some duplicates
        let boolean1 = primitive!(env, PrimitiveType::Boolean);
        let boolean2 = primitive!(env, PrimitiveType::Boolean); // Same kind, different id
        let string = primitive!(env, PrimitiveType::String);

        // Create provisioned types with some duplicates
        let provisioned1 = env.types.provision();
        let provisioned2 = env.types.provision();

        let mut set = TypeIdSet::<16>::new(&env);
        set.push(boolean1);
        set.push(provisioned1.value());
        set.push(string);
        set.push(boolean2); // Will be deduplicated (same kind as boolean1)
        set.push(provisioned2.value());
        set.push(provisioned1.value()); // Will be deduplicated (same id as provisioned1)

        let result = set.finish();

        // We should have 4 unique types: 2 provisioned and 2 materialized
        // (the duplicates should be removed)
        assert_eq!(result.len(), 4);

        // The result should have provisioned types first
        let provisioned_count = result.iter().filter(|&&id| !env.types.contains(id)).count();
        assert_eq!(provisioned_count, 2);

        // And then materialized types
        let materialized_count = result.iter().filter(|&&id| env.types.contains(id)).count();
        assert_eq!(materialized_count, 2);
    }

    #[expect(clippy::missing_asserts_for_indexing)]
    #[test]
    fn mostly_empty_with_few_types() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        // Just one materialized and one provisioned
        let boolean = primitive!(env, PrimitiveType::Boolean);
        let provisioned = env.types.provision();

        let mut set = TypeIdSet::<16>::new(&env);
        set.push(boolean);
        set.push(provisioned.value());

        let result = set.finish();

        // Should preserve both types
        assert_eq!(result.len(), 2);

        // The provisioned type should come first
        assert!(!env.types.contains(result[0]));
        assert!(env.types.contains(result[1]));
    }

    /// Tests with a larger number of items to ensure the algorithm scales.
    #[test]
    fn larger_collection() {
        let heap = Heap::new();
        let env = Environment::new_empty(SpanId::SYNTHETIC, &heap);

        // Create various materialized types
        let types = [
            primitive!(env, PrimitiveType::Boolean),
            primitive!(env, PrimitiveType::Integer),
            primitive!(env, PrimitiveType::Number),
            primitive!(env, PrimitiveType::String),
        ];

        // Create provisioned types
        let mut provisioned = Vec::with_capacity(5);
        for _ in 0..5 {
            provisioned.push(env.types.provision());
        }

        let mut set = TypeIdSet::<32>::new(&env);

        // Add with some duplication
        for &r#type in &types {
            set.push(r#type);
            set.push(r#type); // Add each materialized type twice
        }

        for &provisioned in &provisioned {
            set.push(provisioned.value());
        }

        // Add the first few again to test deduplication
        set.push(provisioned[0].value());
        set.push(provisioned[1].value());

        let result = set.finish();

        // Should have 10 unique types (5 materialized + 5 provisioned)
        assert_eq!(result.len(), 9);

        // Count of each type
        let provisioned_count = result.iter().filter(|&&id| !env.types.contains(id)).count();
        assert_eq!(provisioned_count, 5);

        let materialized_count = result.iter().filter(|&&id| env.types.contains(id)).count();
        assert_eq!(materialized_count, 4);
    }
}
