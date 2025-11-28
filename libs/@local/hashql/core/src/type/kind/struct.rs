use core::ops::{ControlFlow, Deref};

use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    algorithms::cartesian_product,
    collections::FastHashMap,
    intern::Interned,
    symbol::{Ident, Symbol},
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        error::{
            UnsupportedSubscriptCategory, missing_struct_field, struct_field_mismatch,
            struct_field_not_found, unsupported_subscript,
        },
        inference::Inference,
        lattice::{Lattice, Projection, Subscript},
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructField<'heap> {
    pub name: Symbol<'heap>,
    pub value: TypeId,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructFields<'heap>(Option<Interned<'heap, [StructField<'heap>]>>);

impl<'heap> StructFields<'heap> {
    #[must_use]
    pub const fn empty() -> Self {
        Self(None)
    }

    /// Create a new `StructFields` from a slice of `StructField`s.
    ///
    /// The caller must ensure that the slice is sorted by key and contains no duplicates.
    ///
    /// You should probably use `Environment::intern_struct_fields` instead.
    #[must_use]
    pub const fn from_slice_unchecked(slice: Interned<'heap, [StructField<'heap>]>) -> Self {
        Self(Some(slice))
    }

    #[must_use]
    pub const fn as_slice(&self) -> &[StructField<'heap>] {
        match self.0 {
            Some(Interned(slice, _)) => slice,
            None => &[],
        }
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.as_slice().len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.as_slice().is_empty()
    }
}

impl<'heap> AsRef<[StructField<'heap>]> for StructFields<'heap> {
    fn as_ref(&self) -> &[StructField<'heap>] {
        self.as_slice()
    }
}

impl<'heap> Deref for StructFields<'heap> {
    type Target = [StructField<'heap>];

    fn deref(&self) -> &Self::Target {
        self.as_slice()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructType<'heap> {
    pub fields: StructFields<'heap>,
}

impl<'heap> StructType<'heap> {
    fn is_disjoint_by_keys(self: Type<'heap, Self>, other: Type<'heap, Self>) -> bool {
        // The keys are guaranteed to be ordered, therefore we can just check if they are the same
        self.kind
            .fields
            .iter()
            .zip(other.kind.fields.iter())
            .any(|(lhs, rhs)| lhs.name != rhs.name)
    }

    fn postprocess_distribution(
        self: Type<'heap, Self>,

        fields: &[SmallVec<StructField<'heap>, 16>],
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
            .map(|mut fields| {
                env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Struct(Self {
                        fields: env
                            .intern_struct_fields(&mut fields)
                            .unwrap_or_else(|_| unreachable!()),
                    })),
                })
            })
            .collect()
    }

    fn postprocess_lattice(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &Environment<'heap>,
        fields: &mut [StructField<'heap>],
    ) -> SmallVec<TypeId, 4> {
        // Check if we can opt-out into allocating a new type
        if *self.kind.fields == *fields {
            return SmallVec::from_slice_copy(&[self.id]);
        }

        // Check if we can opt-out into allocating a new type
        if *other.kind.fields == *fields {
            return SmallVec::from_slice_copy(&[other.id]);
        }

        let id = env.intern_type(PartialType {
            span: self.span,
            kind: env.intern_kind(TypeKind::Struct(Self {
                fields: env.intern_struct_fields(fields).unwrap_or_else(|_| {
                    // we've verified the fields are identical, so there will be no duplicates
                    unreachable!()
                }),
            })),
        });

        SmallVec::from_slice_copy(&[id])
    }
}

impl<'heap> Lattice<'heap> for StructType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // As we're covariant in respect to width, we join in the following way:
        // fields that are present in both structs are joined point-wise
        // fields that are only present in one struct are added as is
        let mut other_lookup: FastHashMap<_, _> = other
            .kind
            .fields
            .iter()
            .map(|field| (field.name, field))
            .collect();

        let mut fields = SmallVec::<_, 16>::with_capacity(self.kind.fields.len());

        for &self_field in &*self.kind.fields {
            // We can safely remove by name, as we assume that the struct is well-formed and has no
            // duplicate fields
            if let Some(&other_field) = other_lookup.remove(&self_field.name) {
                fields.push(StructField {
                    name: self_field.name,
                    value: env.join(self_field.value, other_field.value),
                });
            } else {
                fields.push(self_field);
            }
        }

        for (_, &other_field) in other_lookup {
            fields.push(other_field);
        }

        self.postprocess_lattice(other, env, &mut fields)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // As we're covariant in respect to width, we meet the following way:
        // fields that are present in both structs are met point-wise
        // fields that are present in only one struct are discarded
        let mut other_lookup: FastHashMap<_, _> = other
            .kind
            .fields
            .iter()
            .map(|field| (field.name, field))
            .collect();

        let mut fields = SmallVec::<_, 16>::with_capacity(usize::min(
            self.kind.fields.len(),
            other.kind.fields.len(),
        ));

        for &self_field in &*self.kind.fields {
            let Some(other_field) = other_lookup.remove(&self_field.name) else {
                continue;
            };

            fields.push(StructField {
                name: self_field.name,
                value: env.meet(self_field.value, other_field.value),
            });
        }

        self.postprocess_lattice(other, env, &mut fields)
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        if let Some(field) = self
            .kind
            .fields
            .iter()
            .find(|struct_field| struct_field.name == field.value)
        {
            return Projection::Resolved(field.value);
        }

        env.diagnostics.push(struct_field_not_found(
            self,
            field,
            self.kind.fields.iter().map(|field| field.name),
            env,
        ));

        Projection::Error
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
            UnsupportedSubscriptCategory::Struct,
            env,
        ));

        Subscript::Error
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        // bottom if any of the fields are bottom
        self.kind
            .fields
            .iter()
            .any(|field| env.is_bottom(field.value))
    }

    fn is_top(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind
            .fields
            .iter()
            .all(|field| env.is_concrete(field.value))
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind
            .fields
            .iter()
            .any(|&field| env.is_recursive(field.value))
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
            .map(|&field| {
                env.distribute_union(field.value)
                    .into_iter()
                    .map(|value| StructField {
                        name: field.name,
                        value,
                    })
                    .collect()
            })
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
            .map(|&field| {
                env.distribute_intersection(field.value)
                    .into_iter()
                    .map(|value| StructField {
                        name: field.name,
                        value,
                    })
                    .collect()
            })
            .collect();

        self.postprocess_distribution(&fields, env)
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Structs are width covariant
        // This means that a struct with more types is a subtype of a struct with less types
        let self_fields_by_key: FastHashMap<_, _> = self
            .kind
            .fields
            .iter()
            .map(|field| (field.name, field))
            .collect();

        let mut compatible = true;

        for &super_field in &*supertype.kind.fields {
            let Some(self_field) = self_fields_by_key.get(&super_field.name) else {
                if env
                    .record_diagnostic(|env| {
                        missing_struct_field(env.source, self, supertype, super_field.name)
                    })
                    .is_break()
                {
                    return false;
                }

                compatible = false;
                continue;
            };

            compatible &=
                env.is_subtype_of(Variance::Covariant, self_field.value, super_field.value);

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
        // Structs have the same number of fields for equivalence
        if self.kind.fields.len() != other.kind.fields.len() {
            // We always fail-fast here
            let _: ControlFlow<()> =
                env.record_diagnostic(|env| struct_field_mismatch(env.source, self, other));

            return false;
        }

        if self.is_disjoint_by_keys(other) {
            // We always fail-fast here
            let _: ControlFlow<()> =
                env.record_diagnostic(|env| struct_field_mismatch(env.source, self, other));

            return false;
        }

        let mut equivalent = true;

        // We checked that they share the same fields, as all fields are always sorted, we can just
        // zip them together
        for (lhs_field, rhs_field) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            equivalent &= env.is_equivalent(lhs_field.value, rhs_field.value);

            if !equivalent && env.is_fail_fast() {
                return false;
            }
        }

        equivalent
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let mut fields = SmallVec::<_, 16>::with_capacity(self.kind.fields.len());

        for &field in &*self.kind.fields {
            fields.push(StructField {
                name: field.name,
                value: env.simplify(field.value),
            });
        }

        // Check if any of the fields are uninhabited, in that case simplify down to never
        if fields.iter().any(|field| env.is_bottom(field.value)) {
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
                kind: env.intern_kind(TypeKind::Struct(Self {
                    fields: env
                        .intern_struct_fields(&mut fields)
                        .unwrap_or_else(|_| unreachable!()),
                })),
            },
        )
    }
}

impl<'heap> Inference<'heap> for StructType<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // Structs are width covariant
        // This means that a struct with more types is a subtype of a struct with less types
        let self_fields_by_key: FastHashMap<_, _> = self
            .kind
            .fields
            .iter()
            .map(|field| (field.name, field))
            .collect();

        for &super_field in &*supertype.kind.fields {
            let Some(self_field) = self_fields_by_key.get(&super_field.name) else {
                // During constraint collection we ignore any errors, as these will be caught during
                // `is_subtype_of` checking later
                continue;
            };

            env.collect_constraints(Variance::Covariant, self_field.value, super_field.value);
        }
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let mut fields = SmallVec::<_, 16>::with_capacity(self.kind.fields.len());
        for field in &*self.kind.fields {
            fields.push(StructField {
                name: field.name,
                value: env.instantiate(field.value),
            });
        }

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Struct(StructType {
                    fields: env
                        .intern_struct_fields(&mut fields)
                        .unwrap_or_else(|_| unreachable!()),
                })),
            },
        )
    }
}
