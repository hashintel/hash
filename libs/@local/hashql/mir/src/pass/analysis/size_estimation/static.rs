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

// The naive size estimation pass uses size estimation by checking if the type can be used for the
// data.
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
    pub(crate) fn run(&mut self, type_id: TypeId) -> Option<InformationRange> {
        // remove any `None` from the cache, as we're restarting evaluation
        if self.cache.dirty {
            self.cache.inner.retain(|_, value| value.is_some());
        }

        let result = self.eval(type_id);
        self.cache.dirty = result.is_break();

        result.continue_value()
    }

    #[expect(unsafe_code)]
    fn eval(&mut self, type_id: TypeId) -> ControlFlow<(), InformationRange> {
        if let Some(&cached) = self.cache.inner.get(&type_id) {
            return cached.map_or(ControlFlow::Break(()), ControlFlow::Continue);
        }

        // SAFETY: we just verified that the type is not in the cache
        unsafe {
            self.cache.inner.insert_unique_unchecked(type_id, None);
        }
        let value = self.compute(type_id)?;
        self.cache.inner.insert(type_id, Some(value));

        ControlFlow::Continue(value)
    }

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
            TypeKind::Intrinsic(_) | TypeKind::Unknown => ControlFlow::Break(()), // dynamic values
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
            // After simplification param and infer shouldn't survive and should have been
            // simplified away
            TypeKind::Param(_) | TypeKind::Infer(_) | TypeKind::Never => {
                ControlFlow::Continue(InformationRange::empty())
            }
        }
    }
}
