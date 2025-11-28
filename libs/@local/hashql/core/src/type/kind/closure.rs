use core::ops::ControlFlow;

use smallvec::SmallVec;

use super::TypeKind;
use crate::{
    intern::Interned,
    symbol::Ident,
    r#type::{
        PartialType, Type, TypeId,
        environment::{
            AnalysisEnvironment, Environment, InferenceEnvironment, LatticeEnvironment,
            SimplifyEnvironment, Variance, instantiate::InstantiateEnvironment,
        },
        error::{
            UnsupportedProjectionCategory, UnsupportedSubscriptCategory,
            function_parameter_count_mismatch, unsupported_projection, unsupported_subscript,
        },
        inference::Inference,
        lattice::{Lattice, Projection, Subscript},
    },
};

/// Represents a function or closure type in the type system.
///
/// # Variance Properties
///
/// Closure types have specific variance characteristics that affect subtyping relationships:
///
/// - **Parameter count**: Invariant - two closure types must have exactly the same number of
///   parameters to be comparable.
///
/// - **Parameter types**: Contravariant - if type `A` is a subtype of `B`, then a function
///   accepting `B` is a subtype of a function accepting `A`.
///
/// - **Return type**: Covariant - if type `A` is a subtype of `B`, then a function returning `A` is
///   a subtype of a function returning `B`.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureType<'heap> {
    pub params: Interned<'heap, [TypeId]>,
    pub returns: TypeId,
}

impl<'heap> ClosureType<'heap> {
    fn postprocess_lattice(
        self: Type<'heap, Self>,
        env: &Environment<'heap>,
        params: &[TypeId],
        returns: TypeId,
    ) -> SmallVec<TypeId, 4> {
        SmallVec::from_slice_copy(&[env.intern_type(PartialType {
            span: self.span,
            kind: env.intern_kind(TypeKind::Closure(Self {
                params: env.intern_type_ids(params),
                returns,
            })),
        })])
    }
}

impl<'heap> Lattice<'heap> for ClosureType<'heap> {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // invariant over width
        if self.kind.params.len() != other.kind.params.len() {
            return SmallVec::from_slice_copy(&[self.id, other.id]);
        }

        let mut params = SmallVec::<_, 16>::new();
        for (&lhs_param, &rhs_param) in self.kind.params.iter().zip(other.kind.params.iter()) {
            // Important: Parameters are contravariant, therefore we switch the `join` to `meet`.
            params.push(env.meet(lhs_param, rhs_param));
        }

        let returns = env.join(self.kind.returns, other.kind.returns);

        self.postprocess_lattice(env, &params, returns)
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        // invariant over width
        if self.kind.params.len() != other.kind.params.len() {
            return SmallVec::new();
        }

        let mut params = SmallVec::<_, 16>::new();
        for (&lhs_param, &rhs_param) in self.kind.params.iter().zip(other.kind.params.iter()) {
            // Important: Parameters are contravariant, therefore we switch the `meet` to `join`.
            params.push(env.join(lhs_param, rhs_param));
        }

        let returns = env.meet(self.kind.returns, other.kind.returns);

        self.postprocess_lattice(env, &params, returns)
    }

    fn projection(
        self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        env.diagnostics.push(unsupported_projection(
            self,
            field,
            UnsupportedProjectionCategory::Closure,
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
            UnsupportedSubscriptCategory::Closure,
            env,
        ));

        Subscript::Error
    }

    fn is_bottom(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        // Never a bottom type, if params is `Never`, then that just means that the function cannot
        // be invoked, but doesn't mean that it's uninhabited. The same applies to the return type.
        false
    }

    fn is_top(self: Type<'heap, Self>, _: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind.params.iter().all(|&param| env.is_concrete(param))
            && env.is_concrete(self.kind.returns)
    }

    fn is_recursive(self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        self.kind
            .params
            .iter()
            .any(|&param| env.is_recursive(param))
            || env.is_recursive(self.kind.returns)
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        SmallVec::from_slice_copy(&[self.id])
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        _: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // We do not distribute over closures, as we cannot show that `(A & B) -> R` is equivalent
        // to `(A -> R) | (B -> R)`. In general distribution only works with covariant arguments,
        // not with contravariant arguments, as we can only prove one direction, but not
        // necessarily the other. For example, we can prove that `(a: A) & (a: B)` is
        // equivalent to `(a: A & B)`, and vice-verse, as it is covariant, this is not
        // necessarily the case for contravariant arguments.
        //
        // In *theory* one can distribute over closures that are of type `(A | B) -> R` to `(A -> R)
        // & (B -> R)`, this makes logically sense, as a function that handles either `A` or `B`
        // must be a function that handles `A` and one that handles `B`.
        //
        // As this is quite counter intuitive and breaks function selection down the line, we do not
        // distribute over closures.
        SmallVec::from_slice_copy(&[self.id])
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Functions are contravariant over the params and covariant over the return type
        // This mirrors the behaviour of Rust.

        // Invariant over the param-width
        if self.kind.params.len() != supertype.kind.params.len() {
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                function_parameter_count_mismatch(
                    env.source,
                    self,
                    supertype,
                    self.kind.params.len(),
                    supertype.kind.params.len(),
                )
            });

            return false;
        }

        let mut compatible = true;

        // Parameters are contravariant
        for (&self_param, &super_param) in self.kind.params.iter().zip(supertype.kind.params.iter())
        {
            compatible &= env.is_subtype_of(Variance::Contravariant, self_param, super_param);

            if !compatible && env.is_fail_fast() {
                return false;
            }
        }

        // Return type is covariant
        compatible &= env.is_subtype_of(
            Variance::Covariant,
            self.kind.returns,
            supertype.kind.returns,
        );

        compatible
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        // Invariant over the param-width
        if self.kind.params.len() != other.kind.params.len() {
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                function_parameter_count_mismatch(
                    env.source,
                    self,
                    other,
                    self.kind.params.len(),
                    other.kind.params.len(),
                )
            });

            return false;
        }

        let mut compatible = true;

        // Parameters are contravariant
        for (&self_param, &other_param) in self.kind.params.iter().zip(other.kind.params.iter()) {
            compatible &= env.is_equivalent(self_param, other_param);

            if !compatible && env.is_fail_fast() {
                return false;
            }
        }

        // Return type is covariant
        compatible &= env.is_equivalent(self.kind.returns, other.kind.returns);

        compatible
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let mut params = SmallVec::<_, 16>::with_capacity(16);
        for &param in self.kind.params {
            params.push(env.simplify(param));
        }

        let r#return = env.simplify(self.kind.returns);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Closure(Self {
                    params: env.intern_type_ids(&params),
                    returns: r#return,
                })),
            },
        )
    }
}

impl<'heap> Inference<'heap> for ClosureType<'heap> {
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        // During constraint collection we try to be as lax as possible, therefore even if we have a
        // mismatch in the number of parameters, we still try to collect constraints.
        // Further checks will fail, but at least we'll be able to guide the user better towards the
        // root cause.
        for (&param, &supertype_param) in self.kind.params.iter().zip(supertype.kind.params.iter())
        {
            env.collect_constraints(Variance::Contravariant, param, supertype_param);
        }

        // Collect constraints for the return type
        env.collect_constraints(
            Variance::Covariant,
            self.kind.returns,
            supertype.kind.returns,
        );
    }

    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        let (_guard, id) = env.provision(self.id);

        let mut params = SmallVec::<_, 16>::with_capacity(16);
        for &param in self.kind.params {
            params.push(env.instantiate(param));
        }

        let returns = env.instantiate(self.kind.returns);

        env.intern_provisioned(
            id,
            PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Closure(Self {
                    params: env.intern_type_ids(&params),
                    returns,
                })),
            },
        )
    }
}
