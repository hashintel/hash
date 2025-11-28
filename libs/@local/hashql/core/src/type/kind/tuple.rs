use core::ops::ControlFlow;

use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    algorithms::cartesian_product,
    intern::Interned,
    symbol::Ident,
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        error::{
            UnsupportedSubscriptCategory, invalid_tuple_index, tuple_index_out_of_bounds,
            tuple_length_mismatch, unsupported_subscript,
        },
        inference::Inference,
        lattice::{Lattice, Projection, Subscript},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TupleType<'heap> {
    pub fields: Interned<'heap, [TypeId]>,
}

impl<'heap> TupleType<'heap> {
    fn postprocess_distribution(
        self: Type<'heap, Self>,

        fields: &[SmallVec<TypeId, 16>],
        env: &Environment<'heap>,
    ) -> SmallVec<TypeId, 16> {
        let variants = cartesian_product::<_, _, 16>(fields);

        if variants.len() == 1 {
            let fields = &variants[0];
            debug_assert_eq!(fields.len(), self.kind.fields.len());

            // If we have a single variant, it's guaranteed that it's the same type, due to
            // distribution rules
            return SmallVec::from_slice_copy(&[self.id]);
        }

        // Create a new type kind for each
        variants
            .into_iter()
            .map(|fields| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Tuple(Self {
                        fields: env.intern_type_ids(&fields),
                    })),
                })
            })
            .collect()
    }

    fn postprocess_lattice(
        self: Type<'heap, Self>,
        env: &Environment<'heap>,
        fields: &[TypeId],
    ) -> SmallVec<TypeId, 4> {
        let kind = env.intern_kind(TypeKind::Tuple(Self {
            fields: env.intern_type_ids(fields),
        }));

        let id = env.intern_type(PartialType {
            span: self.span,
            kind,
        });

        SmallVec::from_slice_copy(&[id])
    }
}

impl<'heap> Lattice<'heap> for TupleType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::from_slice_copy(&[self.id, other.id]);
        }

        // join pointwise
        let mut fields = SmallVec::<_, 16>::with_capacity(self.kind.fields.len());
        for (&lhs, &rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(env.join(lhs, rhs));
        }

        self.postprocess_lattice(env, &fields)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::new();
        }

        // meet pointwise
        let mut fields = Vec::with_capacity(self.kind.fields.len());
        for (&lhs, &rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(env.meet(lhs, rhs));
        }

        self.postprocess_lattice(env, &fields)
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        // tuples can only be indexed by numbers, therefore check if the symbols is just made of
        // numbers
        let Ok(index) = field.value.as_str().parse::<usize>() else {
            env.diagnostics.push(invalid_tuple_index(self, field, env));
            return Projection::Error;
        };

        if index >= self.kind.fields.len() {
            env.diagnostics.push(tuple_index_out_of_bounds(
                self,
                field,
                self.kind.fields.len(),
                env,
            ));

            return Projection::Error;
        }

        Projection::Resolved(self.kind.fields[index])
    }

    fn subscript(
        self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        _: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        env.diagnostics.push(unsupported_subscript(
            self,
            index,
            UnsupportedSubscriptCategory::Tuple,
            env,
        ));

        Subscript::Error
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        // uninhabited if any of the fields are uninhabited
        self.kind.fields.iter().any(|&field| env.is_bottom(field))
    }

    fn is_top(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.fields.iter().all(|&field| env.is_concrete(field))
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind
            .fields
            .iter()
            .any(|&field| env.is_recursive(field))
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        if self.kind.fields.is_empty() {
            return SmallVec::from_slice_copy(&[self.id]);
        }

        let fields: Vec<_> = self
            .kind
            .fields
            .iter()
            .map(|&field| env.distribute_union(field))
            .collect();

        self.postprocess_distribution(&fields, env)
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        if self.kind.fields.is_empty() {
            return SmallVec::from_slice_copy(&[self.id]);
        }

        let fields: Vec<_> = self
            .kind
            .fields
            .iter()
            .map(|&field| env.distribute_intersection(field))
            .collect();

        self.postprocess_distribution(&fields, env)
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Tuples are width invariant
        if self.kind.fields.len() != supertype.kind.fields.len() {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                tuple_length_mismatch(
                    env.source,
                    self,
                    supertype,
                    self.kind.fields.len(),
                    supertype.kind.fields.len(),
                )
            });

            return false;
        }

        let mut compatible = true;

        // Each field in the subtype must be a subtype of the corresponding field in the supertype
        // Unify corresponding fields in each tuple
        for (&lhs_field, &rhs_field) in self.kind.fields.iter().zip(supertype.kind.fields.iter()) {
            // Fields are covariant
            compatible &= env.is_subtype_of(Variance::Covariant, lhs_field, rhs_field);

            if !compatible && env.is_fail_fast() {
                return false;
            }
        }

        compatible
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Tuples must have the same number of fields for equivalence
        if self.kind.fields.len() != other.kind.fields.len() {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                tuple_length_mismatch(
                    env.source,
                    self,
                    other,
                    self.kind.fields.len(),
                    other.kind.fields.len(),
                )
            });

            return false;
        }

        let mut equivalent = true;

        // Each field must be equivalent to the corresponding field in the other tuple
        // Unify corresponding fields in each tuple
        for (&lhs_field, &rhs_field) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            // Fields are covariant
            equivalent &= env.is_equivalent(lhs_field, rhs_field);

            if !equivalent && env.is_fail_fast() {
                return false;
            }
        }

        equivalent
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let mut fields = SmallVec::<_, 16>::with_capacity(self.kind.fields.len());

        for &field in self.kind.fields {
            fields.push(env.simplify(field));
        }

        // Check if any of the fields are uninhabited, if that is the case we simplify down to an
        // uninhabited type
        if fields.iter().any(|&field| env.is_bottom(field)) {
            return env.intern_provisioned(
                id,
                PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Never),
                },
            );
        }

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Tuple(Self {
                    fields: env.intern_type_ids(&fields),
                })),
            },
        )
    }
}

impl<'heap> Inference<'heap> for TupleType<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // During constraint collection we try to be as lax as possible, therefore even if we have a
        // mismatch in the number of parameters, we still try to collect constraints.
        // Further checks will fail, but at least we'll be able to guide the user better towards the
        // root cause.
        for (&field, &supertype_field) in self.kind.fields.iter().zip(supertype.kind.fields.iter())
        {
            env.collect_constraints(Variance::Covariant, field, supertype_field);
        }
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let mut fields = SmallVec::<_, 16>::with_capacity(self.kind.fields.len());

        for &field in self.kind.fields {
            fields.push(env.instantiate(field));
        }

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Tuple(TupleType {
                    fields: env.intern_type_ids(&fields),
                })),
            },
        )
    }
}
