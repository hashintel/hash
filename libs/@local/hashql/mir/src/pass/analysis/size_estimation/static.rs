use core::{alloc::Allocator, ops::ControlFlow};

use hashql_core::{
    collections::FastHashMap,
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

// The naive size estimation pass uses size estimation by checking if the type can be used for the
// data.
struct StaticSizeEstimation<'env, 'heap, A: Allocator> {
    env: &'env Environment<'heap>,
    cache: FastHashMap<TypeId, Option<InformationRange>, A>,
    dirty: bool,
}

impl<A: Allocator> StaticSizeEstimation<'_, '_, A> {
    fn run(&mut self, type_id: TypeId) -> ControlFlow<(), InformationRange> {
        // remove any `None` from the cache, as we're restarting evaluation
        if self.dirty {
            self.cache.retain(|_, value| value.is_some());
        }

        let result = self.eval(type_id);
        self.dirty = result.is_break();
        result
    }

    #[expect(unsafe_code)]
    fn eval(&mut self, type_id: TypeId) -> ControlFlow<(), InformationRange> {
        if let Some(&cached) = self.cache.get(&type_id) {
            return cached.map_or(ControlFlow::Break(()), ControlFlow::Continue);
        }

        // SAFETY: we just verified that the type is not in the cache
        unsafe {
            self.cache.insert_unique_unchecked(type_id, None);
        }
        let value = self.compute(type_id)?;
        self.cache.insert(type_id, Some(value));

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
