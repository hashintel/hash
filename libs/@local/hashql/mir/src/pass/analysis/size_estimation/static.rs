//! Static size estimation from type information.
//!
//! Computes size estimates purely from type structure, without dataflow analysis.
//! Returns `None` for types that cannot be statically sized (e.g., lists, dicts,
//! intrinsics), which signals that dynamic analysis is needed.

use core::{alloc::Allocator, ops::ControlFlow};

use hashql_core::{
    collections::{FastHashMap, fast_hash_map_in},
    r#type::{
        TypeId,
        environment::Environment,
        kind::{
            Apply, Generic, IntersectionType, OpaqueType, StructType, TupleType, TypeKind,
            UnionType, r#struct::StructField,
        },
    },
};

use super::{range::InformationRange, unit::InformationUnit};

/// Cache for memoizing static size computations.
///
/// Uses `None` as a sentinel during recursive evaluation to detect cycles.
/// The `dirty` flag tracks whether sentinels remain that need cleanup.
pub(crate) struct StaticSizeEstimationCache<A: Allocator> {
    inner: FastHashMap<TypeId, Option<InformationRange>, A>,
    dirty: bool,
}

impl<A: Allocator> StaticSizeEstimationCache<A> {
    pub(crate) fn new_in(alloc: A) -> Self {
        Self {
            inner: fast_hash_map_in(alloc),
            dirty: false,
        }
    }
}

/// Static size estimator that computes sizes from type structure.
///
/// Handles primitives, structs, tuples, unions (cover), and intersections (intersect).
/// Returns `None` for types requiring dynamic analysis.
pub(crate) struct StaticSizeEstimation<'cache, 'env, 'heap, A: Allocator> {
    env: &'env Environment<'heap>,
    cache: &'cache mut StaticSizeEstimationCache<A>,
}

impl<'cache, 'env, 'heap, A: Allocator> StaticSizeEstimation<'cache, 'env, 'heap, A> {
    pub(crate) const fn new(
        env: &'env Environment<'heap>,
        cache: &'cache mut StaticSizeEstimationCache<A>,
    ) -> Self {
        Self { env, cache }
    }
}

impl<A: Allocator> StaticSizeEstimation<'_, '_, '_, A> {
    /// Estimates the size of a type, returning `None` if it cannot be statically determined.
    pub(crate) fn run(&mut self, type_id: TypeId) -> Option<InformationRange> {
        if self.cache.dirty {
            self.cache.inner.retain(|_, value| value.is_some());
        }

        let result = self.eval(type_id);
        self.cache.dirty = result.is_break();

        result.continue_value()
    }

    /// Evaluates a type with cycle detection via sentinel values.
    #[expect(unsafe_code)]
    fn eval(&mut self, type_id: TypeId) -> ControlFlow<(), InformationRange> {
        if let Some(&cached) = self.cache.inner.get(&type_id) {
            return cached.map_or(ControlFlow::Break(()), ControlFlow::Continue);
        }

        // Insert sentinel to detect recursive references
        // SAFETY: we just verified that the type is not in the cache
        unsafe {
            self.cache.inner.insert_unique_unchecked(type_id, None);
        }
        let value = self.compute(type_id)?;
        self.cache.inner.insert(type_id, Some(value));

        ControlFlow::Continue(value)
    }

    /// Computes size for a type based on its structure.
    fn compute(&mut self, type_id: TypeId) -> ControlFlow<(), InformationRange> {
        let r#type = self.env.r#type(type_id);

        match r#type.kind {
            &TypeKind::Opaque(OpaqueType {
                name: _,
                repr: inner,
            })
            | &TypeKind::Apply(Apply {
                base: inner,
                substitutions: _,
            })
            | &TypeKind::Generic(Generic {
                base: inner,
                arguments: _,
            }) => self.eval(inner),
            TypeKind::Primitive(_) | TypeKind::Closure(_) => {
                ControlFlow::Continue(InformationUnit::new(1).into())
            }
            // Intrinsics and Unknown require dynamic analysis
            TypeKind::Intrinsic(_) | TypeKind::Unknown => ControlFlow::Break(()),
            TypeKind::Struct(StructType { fields }) => {
                let mut total = InformationRange::empty();

                for &StructField { name: _, value } in fields.as_ref() {
                    total += self.eval(value)?;
                }

                ControlFlow::Continue(total)
            }
            TypeKind::Tuple(TupleType { fields }) => {
                let mut total = InformationRange::empty();

                for &field in fields {
                    total += self.eval(field)?;
                }

                ControlFlow::Continue(total)
            }
            TypeKind::Union(UnionType { variants }) => {
                let mut total = InformationRange::empty();

                for &variant in variants {
                    total = total.cover(self.eval(variant)?);
                }

                ControlFlow::Continue(total)
            }
            TypeKind::Intersection(IntersectionType { variants }) => {
                let mut total = InformationRange::full();

                for &variant in variants {
                    total = total.intersect(self.eval(variant)?);
                }

                ControlFlow::Continue(total)
            }
            // Param/Infer/Never should be eliminated by type simplification; return empty
            // as a safe default (the typechecker would reject real occurrences)
            TypeKind::Param(_) | TypeKind::Infer(_) | TypeKind::Never => {
                ControlFlow::Continue(InformationRange::empty())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::alloc::Global;
    use core::ops::Bound;

    use hashql_core::{
        heap::Heap,
        r#type::{builder::TypeBuilder, environment::Environment},
    };

    use crate::pass::analysis::size_estimation::{
        InformationRange, InformationUnit,
        r#static::{StaticSizeEstimation, StaticSizeEstimationCache},
    };

    /// Helper to create an expected range of size `N..=N`.
    fn value(value: u32) -> InformationRange {
        InformationRange::value(InformationUnit::new(value))
    }

    /// Helper to create an expected range of `min..=max`.
    fn range(min: u32, max: u32) -> InformationRange {
        InformationRange::new(
            InformationUnit::new(min),
            Bound::Included(InformationUnit::new(max)),
        )
    }

    #[test]
    fn primitives_are_atomic() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        let int_type = builder.integer();
        let bool_type = builder.boolean();
        let num_type = builder.number();

        let int_result = analysis
            .run(int_type)
            .expect("integer should be statically sized");
        let bool_result = analysis
            .run(bool_type)
            .expect("boolean should be statically sized");
        let num_result = analysis
            .run(num_type)
            .expect("number should be statically sized");

        assert_eq!(int_result, value(1));
        assert_eq!(bool_result, value(1));
        assert_eq!(num_result, value(1));

        // Closure types also have size 1
        let closure_type = builder.closure([builder.integer()], builder.boolean());
        let closure_result = analysis
            .run(closure_type)
            .expect("closure should be statically sized");

        assert_eq!(closure_result, value(1));
    }

    #[test]
    fn struct_size_is_sum_of_fields() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        let int_type = builder.integer();
        let struct_type = builder.r#struct([("a", int_type), ("b", int_type)]);

        let result = analysis
            .run(struct_type)
            .expect("struct should be statically sized");

        // Two fields with size 1 each = total size 2
        assert_eq!(result, value(2));
    }

    #[test]
    fn tuple_size_is_sum_of_elements() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        let int_type = builder.integer();
        let bool_type = builder.boolean();
        let tuple_type = builder.tuple([int_type, bool_type]);

        let result = analysis
            .run(tuple_type)
            .expect("tuple should be statically sized");

        // Two elements with size 1 each = total size 2
        assert_eq!(result, value(2));
    }

    #[test]
    fn empty_tuple_is_zero() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        let unit_type = builder.tuple([] as [hashql_core::r#type::TypeId; 0]);

        let result = analysis
            .run(unit_type)
            .expect("empty tuple should be statically sized");

        // Empty tuple has size 0..0 (empty range)
        assert!(result.is_empty());
        assert_eq!(result, InformationRange::empty());
    }

    #[test]
    fn union_uses_cover() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        // Create types with different sizes
        let small_type = builder.integer(); // size 1
        let large_type = builder.tuple([builder.integer(), builder.integer(), builder.integer()]); // size 3

        let union_type = builder.union([small_type, large_type]);

        let result = analysis
            .run(union_type)
            .expect("union should be statically sized");

        // Union covers both ranges: min of mins (1), max of maxes (3)
        assert_eq!(result, range(1, 3));
    }

    #[test]
    fn intersection_uses_intersect() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        // Create two unions with overlapping size ranges
        // Union A: size 2 or size 4 → range 2..=4
        let size_2 = builder.tuple([builder.integer(), builder.integer()]);
        let size_4 = builder.tuple([
            builder.integer(),
            builder.integer(),
            builder.integer(),
            builder.integer(),
        ]);
        let union_a = builder.union([size_2, size_4]);

        // Union B: size 3 or size 5 → range 3..=5
        let size_3 = builder.tuple([builder.integer(), builder.integer(), builder.integer()]);
        let size_5 = builder.tuple([
            builder.integer(),
            builder.integer(),
            builder.integer(),
            builder.integer(),
            builder.integer(),
        ]);
        let union_b = builder.union([size_3, size_5]);

        let intersection_type = builder.intersection([union_a, union_b]);

        let result = analysis
            .run(intersection_type)
            .expect("intersection should be statically sized");

        // Union A has range 2..=4, Union B has range 3..=5
        // Intersection narrows: max of mins (3), min of maxes (4) → 3..=4
        assert_eq!(result, range(3, 4));
    }

    #[test]
    fn intrinsic_signals_dynamic() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        let list_type = builder.list(builder.integer());
        let dict_type = builder.dict(builder.string(), builder.integer());

        assert!(
            analysis.run(list_type).is_none(),
            "list should signal dynamic analysis"
        );
        assert!(
            analysis.run(dict_type).is_none(),
            "dict should signal dynamic analysis"
        );
    }

    #[test]
    fn unknown_signals_dynamic() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        let unknown_type = builder.unknown();

        assert!(
            analysis.run(unknown_type).is_none(),
            "unknown should signal dynamic analysis"
        );
    }

    #[test]
    fn param_infer_never_are_empty() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let mut builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        let arg_id = builder.fresh_argument("T");
        let param_type = builder.param(arg_id);

        let hole_id = builder.fresh_hole();
        let infer_type = builder.infer(hole_id);

        let never_type = builder.never();

        let param_result = analysis
            .run(param_type)
            .expect("param should return empty range");
        let infer_result = analysis
            .run(infer_type)
            .expect("infer should return empty range");
        let never_result = analysis
            .run(never_type)
            .expect("never should return empty range");

        assert!(param_result.is_empty());
        assert!(infer_result.is_empty());
        assert!(never_result.is_empty());
    }

    #[test]
    fn cache_prevents_redundant_computation() {
        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let int_type = builder.integer();

        // First query
        {
            let mut analysis = StaticSizeEstimation::new(&env, &mut cache);
            let result = analysis.run(int_type).expect("should be sized");
            assert_eq!(result, value(1));
        }

        assert!(cache.inner[&int_type].is_some());

        // Second query uses cache
        {
            let mut analysis = StaticSizeEstimation::new(&env, &mut cache);
            let result = analysis.run(int_type).expect("should be sized from cache");
            assert_eq!(result, value(1));
        }
    }

    #[test]
    fn recursive_type_detected() {
        use hashql_core::r#type::builder::lazy;

        let heap = Heap::new();
        let env = Environment::new(&heap);
        let builder = TypeBuilder::synthetic(&env);

        let mut cache = StaticSizeEstimationCache::new_in(Global);
        let mut analysis = StaticSizeEstimation::new(&env, &mut cache);

        // Create a recursive type: a tuple that contains itself
        let recursive_type = builder.tuple(lazy(|id, _| [id.value()]));

        let result = analysis.run(recursive_type);

        // Recursive types hit the sentinel during evaluation and return None
        assert!(
            result.is_none(),
            "recursive type should be detected and return None"
        );
    }
}
