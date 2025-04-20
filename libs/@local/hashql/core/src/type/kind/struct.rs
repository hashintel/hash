use core::ops::{ControlFlow, Deref};
use std::collections::HashMap;

use pretty::RcDoc;
use smallvec::SmallVec;

use super::{TypeKind, generic_argument::GenericArguments};
use crate::{
    math::cartesian_product,
    symbol::InternedSymbol,
    r#type::{
        Type, TypeId,
        environment::{
            Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment,
        },
        lattice::Lattice,
        pretty_print::PrettyPrint,
        recursion::RecursionDepthBoundary,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructField<'heap> {
    pub name: InternedSymbol<'heap>,
    pub value: TypeId,
}

impl PrettyPrint for StructField<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        RcDoc::text(self.name.as_str().to_owned())
            .append(RcDoc::text(":"))
            .append(RcDoc::line())
            .append(limit.pretty(env, self.value))
            .group()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructFields<'heap>(&'heap [StructField<'heap>]);

impl<'heap> StructFields<'heap> {
    #[must_use]
    pub const fn empty() -> Self {
        Self(&[])
    }

    /// Create a new `StructFields` from a slice of `StructField`s.
    ///
    /// The caller must ensure that the slice is sorted by key and contains no duplicates.
    ///
    /// You should probably use `Environment::intern_struct_fields` instead.
    #[must_use]
    pub const fn from_slice_unchecked(slice: &'heap [StructField<'heap>]) -> Self {
        Self(slice)
    }

    #[must_use]
    pub const fn as_slice(&self) -> &[StructField<'heap>] {
        self.0
    }
}

impl<'heap> AsRef<[StructField<'heap>]> for StructFields<'heap> {
    fn as_ref(&self) -> &[StructField<'heap>] {
        self.0
    }
}

impl<'heap> Deref for StructFields<'heap> {
    type Target = [StructField<'heap>];

    fn deref(&self) -> &Self::Target {
        self.0
    }
}

impl PrettyPrint for StructFields<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        if self.0.is_empty() {
            RcDoc::text(":")
        } else {
            RcDoc::intersperse(
                self.0.iter().map(|field| field.pretty(env, limit)),
                RcDoc::text(",").append(RcDoc::line()),
            )
            .nest(1)
            .group()
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructType<'heap> {
    pub fields: StructFields<'heap>,
    pub arguments: GenericArguments<'heap>,
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
            return SmallVec::from_slice(&[self.id]);
        }

        // Create a new type kind for each
        variants
            .into_iter()
            .map(|mut fields| {
                env.alloc(|id| Type {
                    id,
                    span: self.span,
                    kind: env.intern_kind(TypeKind::Struct(Self {
                        fields: env
                            .intern_struct_fields(&mut fields)
                            .unwrap_or_else(|_| unreachable!()),
                        arguments: self.kind.arguments,
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
            return SmallVec::from_slice(&[self.id]);
        }

        // Check if we can opt-out into allocating a new type
        if *other.kind.fields == *fields {
            return SmallVec::from_slice(&[other.id]);
        }

        let id = env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Struct(Self {
                fields: env.intern_struct_fields(fields).unwrap_or_else(|_| {
                    // we've verified the fields are identical, so there will be no duplicates
                    unreachable!()
                }),
                // merge the two arguments together, as some of the fields may refer to either
                arguments: self.kind.arguments.merge(&other.kind.arguments, env),
            })),
        });

        SmallVec::from_slice(&[id])
    }
}

impl<'heap> Lattice<'heap> for StructType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // TODO: this isn't if we're covariant to width
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::from_slice(&[self.id, other.id]);
        }

        if self.is_disjoint_by_keys(other) {
            return SmallVec::from_slice(&[self.id, other.id]);
        }

        // join point-wise
        let mut fields = SmallVec::<_, 16>::with_capacity(self.kind.fields.len());
        for (lhs, rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(StructField {
                name: lhs.name,
                value: env.join(lhs.value, rhs.value),
            });
        }

        self.postprocess_lattice(other, env, &mut fields)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // TODO: this isn't correct if we're covariant to width
        if self.kind.fields.len() != other.kind.fields.len() {
            return SmallVec::from_slice(&[]);
        }

        if self.is_disjoint_by_keys(other) {
            return SmallVec::from_slice(&[]);
        }

        // meet point-wise
        let mut fields = SmallVec::<_, 16>::with_capacity(self.kind.fields.len());
        for (lhs, rhs) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            fields.push(StructField {
                name: lhs.name,
                value: env.meet(lhs.value, rhs.value),
            });
        }

        self.postprocess_lattice(other, env, &mut fields)
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        // bottom if any of the fields are bottom
        self.kind
            .fields
            .iter()
            .any(|field| env.is_bottom(field.value))
    }

    fn is_top(self: Type<'heap, Self>, _: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind
            .fields
            .iter()
            .all(|field| env.is_concrete(field.value))
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        if self.kind.fields.is_empty() {
            return SmallVec::from_slice(&[self.id]);
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
        _: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // Struct is covariant over it's field so no distribution is needed
        SmallVec::from_slice(&[self.id])
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Structs are width covariant
        // This means that a struct with more types is a subtype of a struct with less types

        let self_fields_by_key: HashMap<_, _, foldhash::fast::RandomState> = self
            .kind
            .fields
            .iter()
            .map(|field| (field.name, field))
            .collect();

        let mut compatible = true;

        for &super_field in &*supertype.kind.fields {
            let Some(self_field) = self_fields_by_key.get(&super_field.name) else {
                return false;
            };

            compatible &=
                env.in_covariant(|env| env.is_subtype_of(self_field.value, super_field.value));

            if !compatible && env.is_fail_fast() {
                return false;
            }
        }

        compatible
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Structs have the same number of fields for equivalence
        if self.kind.fields.len() != other.kind.fields.len() {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|_| panic!("create diagnostic"));

            return false;
        }

        if self.is_disjoint_by_keys(other) {
            // We always fail-fast here
            let _: ControlFlow<()> = env.record_diagnostic(|_| panic!("create diagnostic"));

            return false;
        }

        let mut equivalent = true;

        // We checked that they share the same fields, as all fields are always sorted, we can just
        // zip them together
        for (lhs_field, rhs_field) in self.kind.fields.iter().zip(other.kind.fields.iter()) {
            equivalent &=
                env.in_covariant(|env| env.is_equivalent(lhs_field.value, rhs_field.value));

            if !equivalent && env.is_fail_fast() {
                return false;
            }
        }

        equivalent
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let mut fields = SmallVec::<_, 16>::with_capacity(self.kind.fields.len());

        for &field in &*self.kind.fields {
            fields.push(StructField {
                name: field.name,
                value: env.simplify(field.value),
            });
        }

        // Check if the fields are the same, in that case we don't need to create a new type
        if self
            .kind
            .fields
            .iter()
            .zip(&fields)
            .all(|(lhs, rhs)| lhs.value == rhs.value)
        {
            return self.id;
        }

        // Check if any of the fields are uninhabited, in that case simplify down to never
        if fields.iter().any(|field| env.is_bottom(field.value)) {
            return env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Never),
            });
        }

        env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Struct(Self {
                fields: env
                    .intern_struct_fields(&mut fields)
                    .unwrap_or_else(|_| unreachable!()),
                arguments: self.kind.arguments,
            })),
        })
    }
}

impl PrettyPrint for StructType<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        self.arguments
            .pretty(env, limit)
            .append(
                RcDoc::text("(")
                    .append(self.fields.pretty(env, limit))
                    .append(RcDoc::text(")"))
                    .group(),
            )
            .group()
    }
}
