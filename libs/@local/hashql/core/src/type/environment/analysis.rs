use alloc::rc::Rc;
use core::{
    mem,
    ops::{ControlFlow, Deref},
};

use hashql_diagnostics::DiagnosticIssues;
use smallvec::SmallVec;

use super::{
    Environment, Variance,
    context::{
        provision::ProvisionedScope,
        variance::{VarianceFlow, VarianceState},
    },
};
use crate::r#type::{
    Type, TypeId,
    error::{TypeCheckDiagnostic, TypeCheckDiagnosticIssues, circular_type_reference},
    inference::{Substitution, VariableKind, VariableLookup},
    kind::{Apply, Generic, Infer, IntersectionType, Param, TypeKind, UnionType},
    lattice::Lattice as _,
    recursion::{RecursionBoundary, RecursionCycle},
};

#[derive(Debug)]
#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "implementation detail"
)]
pub struct AnalysisEnvironment<'env, 'heap> {
    environment: &'env Environment<'heap>,
    diagnostics: Option<TypeCheckDiagnosticIssues>,

    boundary: RecursionBoundary<'heap>,

    variables: Option<VariableLookup>,
    substitution: Option<Substitution>,
    pub(crate) provisioned: Rc<ProvisionedScope<TypeId>>,

    variance: VarianceState,
}

impl<'env, 'heap> AnalysisEnvironment<'env, 'heap> {
    #[must_use]
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            diagnostics: None,

            boundary: RecursionBoundary::new(),

            variables: None,
            substitution: None,
            provisioned: Rc::default(),

            variance: VarianceState::new(Variance::Covariant),
        }
    }

    pub(crate) fn set_variables(&mut self, variables: VariableLookup) {
        self.variables = Some(variables);
    }

    pub(crate) fn set_substitution(&mut self, substitution: Substitution) {
        self.substitution = Some(substitution);
    }

    pub(crate) fn clear_substitution(&mut self) {
        self.substitution = None;
    }

    pub(crate) fn contains_substitution(&self, kind: VariableKind) -> bool {
        let substitution = self
            .substitution
            .as_ref()
            .unwrap_or(&self.environment.substitution);

        substitution.contains(kind)
    }

    pub(crate) const fn substitution_mut(&mut self) -> Option<&mut Substitution> {
        self.substitution.as_mut()
    }

    pub fn with_diagnostics(&mut self) -> &mut Self {
        self.diagnostics = Some(DiagnosticIssues::new());

        self
    }

    pub fn with_diagnostics_disabled<T>(&mut self, func: impl FnOnce(&mut Self) -> T) -> T {
        let diagnostics = self.diagnostics.take();
        let result = func(self);
        self.diagnostics = diagnostics;

        result
    }

    pub fn take_diagnostics(&mut self) -> Option<TypeCheckDiagnosticIssues> {
        self.diagnostics.as_mut().map(mem::take)
    }

    pub fn clear_diagnostics(&mut self) {
        if let Some(diagnostics) = &mut self.diagnostics {
            diagnostics.clear();
        }
    }

    pub fn merge_diagnostics_into(&mut self, diagnostics: &mut TypeCheckDiagnosticIssues) {
        if let Some(local) = &mut self.diagnostics {
            diagnostics.append(local);
        }
    }

    pub fn fatal_diagnostics(&self) -> usize {
        self.diagnostics
            .as_ref()
            .map_or(0, DiagnosticIssues::critical)
    }

    pub(crate) fn resolve_substitution(&self, r#type: Type<'heap>) -> Option<TypeId> {
        let substitution = self
            .substitution
            .as_ref()
            .unwrap_or(&self.environment.substitution);

        match r#type.kind {
            TypeKind::Opaque(_)
            | TypeKind::Primitive(_)
            | TypeKind::Intrinsic(_)
            | TypeKind::Struct(_)
            | TypeKind::Tuple(_)
            | TypeKind::Closure(_)
            | TypeKind::Union(_)
            | TypeKind::Intersection(_)
            | TypeKind::Apply(_)
            | TypeKind::Generic(_)
            | TypeKind::Never
            | TypeKind::Unknown => None,
            &TypeKind::Param(Param { argument }) => {
                let argument = substitution.argument(argument)?;

                Some(argument)
            }
            &TypeKind::Infer(Infer { hole }) => {
                let infer = substitution.infer(hole)?;

                Some(infer)
            }
        }
    }

    pub(crate) fn resolve_type(&self, r#type: Type<'heap>) -> Option<Type<'heap>> {
        let substitution = self
            .substitution
            .as_ref()
            .unwrap_or(&self.environment.substitution);

        match r#type.kind {
            TypeKind::Opaque(_)
            | TypeKind::Primitive(_)
            | TypeKind::Intrinsic(_)
            | TypeKind::Struct(_)
            | TypeKind::Tuple(_)
            | TypeKind::Closure(_)
            | TypeKind::Union(_)
            | TypeKind::Intersection(_)
            | TypeKind::Apply(_)
            | TypeKind::Generic(_)
            | TypeKind::Never
            | TypeKind::Unknown => Some(r#type),
            &TypeKind::Param(Param { argument }) => {
                let argument = substitution.argument(argument)?;

                self.resolve_type(self.environment.r#type(argument))
            }
            &TypeKind::Infer(Infer { hole }) => {
                let infer = substitution.infer(hole)?;

                self.resolve_type(self.environment.r#type(infer))
            }
        }
    }

    pub(super) fn variable_representative(&self, kind: VariableKind) -> VariableKind {
        #[expect(clippy::option_if_let_else, reason = "readability")]
        if let Some(variables) = &self.variables {
            variables[kind]
        } else {
            let substitution = self
                .substitution
                .as_ref()
                .unwrap_or(&self.environment.substitution);

            substitution.representative(kind)
        }
    }

    fn is_alias_recurse(&mut self, id: TypeId, variable: VariableKind) -> bool {
        let r#type = self.environment.r#type(self.resolve_id(id));

        if self.boundary.enter(r#type, r#type).is_break() {
            return false;
        }

        let result = self.is_alias_impl(r#type, variable);
        self.boundary.exit(r#type, r#type);
        result
    }

    fn is_alias_impl(&mut self, r#type: Type<'heap>, variable: VariableKind) -> bool {
        match r#type.kind {
            TypeKind::Opaque(_)
            | TypeKind::Primitive(_)
            | TypeKind::Intrinsic(_)
            | TypeKind::Struct(_)
            | TypeKind::Tuple(_)
            | TypeKind::Closure(_)
            | TypeKind::Never
            | TypeKind::Unknown => false,
            TypeKind::Union(union) => UnionType::unnest(r#type.with(union), self)
                .into_iter()
                .all(|variant| self.is_alias_recurse(variant, variable)),
            TypeKind::Intersection(intersection) => {
                IntersectionType::unnest(r#type.with(intersection), self)
                    .into_iter()
                    .all(|variant| self.is_alias_recurse(variant, variable))
            }
            &TypeKind::Apply(Apply { base, .. }) | &TypeKind::Generic(Generic { base, .. }) => {
                self.is_alias_recurse(base, variable)
            }
            &TypeKind::Param(Param { argument }) => {
                let kind = VariableKind::Generic(argument);
                let representative = self.variable_representative(kind);

                representative == variable
            }
            &TypeKind::Infer(Infer { hole }) => {
                let kind = VariableKind::Hole(hole);
                let representative = self.variable_representative(kind);

                representative == variable
            }
        }
    }

    pub(crate) fn is_alias(&mut self, id: TypeId, variable: VariableKind) -> bool {
        let variable = self.variable_representative(variable);

        let r#type = self.environment.r#type(self.resolve_id(id));

        self.is_alias_impl(r#type, variable)
    }

    #[expect(clippy::needless_pass_by_ref_mut, reason = "proof of ownership")]
    fn resolve_id(&mut self, id: TypeId) -> TypeId {
        if let Some(source) = self.provisioned.get_source(id) {
            return source;
        }

        id
    }

    pub fn is_bottom(&mut self, id: TypeId) -> bool {
        let r#type = self.environment.r#type(self.resolve_id(id));

        if self.boundary.enter(r#type, r#type).is_break() {
            // We have found a recursive type, meaning it can't be bottom
            return false;
        }

        let result = r#type.is_bottom(self);

        self.boundary.exit(r#type, r#type);

        result
    }

    pub fn is_top(&mut self, id: TypeId) -> bool {
        let r#type = self.environment.r#type(self.resolve_id(id));

        if self.boundary.enter(r#type, r#type).is_break() {
            // We have found a recursive type, meaning it can't be top
            return false;
        }

        let result = r#type.is_top(self);

        self.boundary.exit(r#type, r#type);

        result
    }

    pub fn is_disjoint(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        let lhs = self.environment.r#type(self.resolve_id(lhs));
        let rhs = self.environment.r#type(self.resolve_id(rhs));

        !lhs.is_subtype_of(rhs, self) && !rhs.is_subtype_of(lhs, self)
    }

    pub fn is_concrete(&mut self, id: TypeId) -> bool {
        let r#type = self.environment.r#type(self.resolve_id(id));

        if self.boundary.enter(r#type, r#type).is_break() {
            // We have found a recursive type with no holes, therefore it must be concrete
            return true;
        }

        let result = r#type.is_concrete(self);

        self.boundary.exit(r#type, r#type);

        result
    }

    pub fn is_recursive(&mut self, id: TypeId) -> bool {
        let r#type = self.environment.r#type(self.resolve_id(id));

        if self.boundary.enter(r#type, r#type).is_break() {
            // We have found a recursive type
            return true;
        }

        let result = r#type.is_recursive(self);

        self.boundary.exit(r#type, r#type);

        result
    }

    pub fn distribute_union(&mut self, id: TypeId) -> SmallVec<TypeId, 16> {
        let r#type = self.environment.r#type(self.resolve_id(id));

        if self.boundary.enter(r#type, r#type).is_break() {
            // We have found a recursive type, due to coinductive reasoning, this means it can no
            // longer be distributed
            return SmallVec::from_slice_copy(&[id]);
        }

        let result = r#type.distribute_union(self);

        self.boundary.exit(r#type, r#type);

        result
    }

    pub fn distribute_intersection(&mut self, id: TypeId) -> SmallVec<TypeId, 16> {
        let r#type = self.environment.r#type(self.resolve_id(id));

        if self.boundary.enter(r#type, r#type).is_break() {
            // We have found a recursive type, due to coinductive reasoning, this means it can no
            // longer be distributed
            return SmallVec::from_slice_copy(&[id]);
        }

        let result = r#type.distribute_intersection(self);

        self.boundary.exit(r#type, r#type);

        result
    }

    #[must_use]
    pub const fn is_fail_fast(&self) -> bool {
        self.diagnostics.is_none()
    }

    pub fn record_diagnostic(
        &mut self,
        diagnostic: impl FnOnce(&'env Environment<'heap>) -> TypeCheckDiagnostic,
    ) -> ControlFlow<()> {
        let Some(diagnostics) = self.diagnostics.as_mut() else {
            // Fail-fast mode: No diagnostics storage available
            // (typical for equivalence checks where we just need a yes/no answer)
            return ControlFlow::Break(());
        };

        // Record the diagnostic in fail-slow mode
        diagnostics.push(diagnostic(self.environment));

        // Return indication to continue processing
        // (used in type checking/unification to collect multiple errors)
        ControlFlow::Continue(())
    }

    // Check if two types refer to the same variable, and must therefore be equivalent, this takes
    // into account any unification that was applied
    fn is_equivalent_inference(&self, left: &Type<'heap>, right: &Type<'heap>) -> bool {
        let Some(left) = left.kind.into_variable() else {
            return false;
        };

        let Some(right) = right.kind.into_variable() else {
            return false;
        };

        // We don't need to check the lookup table for the root, if they are the same variable
        if left == right {
            return true;
        }

        // Try to extract out the "root" variable from either side, if applicable
        if let Some(lookup) = &self.variables
            && let Some(left) = lookup.get(left)
            && let Some(right) = lookup.get(right)
        {
            left == right
        } else {
            false
        }
    }

    fn is_quick_subtype(&self, subtype: &Type<'heap>, supertype: &Type<'heap>) -> Option<bool> {
        if subtype.id == supertype.id {
            return Some(true);
        }

        if core::ptr::eq(subtype.kind, supertype.kind) {
            return Some(true);
        }

        // `Never <: T` always holds
        if *subtype.kind == TypeKind::Never {
            return Some(true);
        }

        // `T <: Never` never holds
        if *supertype.kind == TypeKind::Never {
            return Some(false);
        }

        // `Unknown <: T` never holds
        if *subtype.kind == TypeKind::Unknown {
            return Some(false);
        }

        // `T <: Unknown` always holds
        if *supertype.kind == TypeKind::Unknown {
            return Some(true);
        }

        if self.is_equivalent_inference(subtype, supertype) {
            return Some(true);
        }

        None
    }

    /// Handling of recursive types on subtype checks.
    ///
    /// For recursive types, we use coinductive reasoning when determining subtyping
    /// relationships. When we encounter the same subtyping check again during recursion,
    /// we should return true to maintain the coinductive assumption.
    ///
    /// Example:
    /// For `type A = (Integer, A)` and `type B = (Number, B)`,
    /// to check if A <: B, we need to check if (Integer, A) <: (Number, B)
    /// This involves checking:
    ///   1. Integer <: Number (true)
    ///   2. A <: B (the original question)
    ///
    /// When we reach step 2, we encounter the same check we started with.
    /// By returning true here, we complete the coinductive proof,
    /// confirming A <: B if their non-recursive parts satisfy the subtyping relation.
    ///
    /// This implementation adheres to two fundamental coinductive principles:
    ///
    /// 1. **F-closure**: We assume the recursive subtype relationship holds, adding it to our
    ///    relation. This means if (A,B) is in our relation, then all structurally derived pairs
    ///    should also be in the relation.
    ///
    /// 2. **F-consistency**: For each subtyping pair in our assumed relation, we verify it can be
    ///    justified by the subtyping rules applied to other pairs. We check all non-recursive
    ///    components to ensure they maintain the expected relationship.
    ///
    /// By returning `true` upon cycle detection, we're allowing the coinductive hypothesis to
    /// stand if no contradictions are found in the non-recursive parts, which matches formal
    /// coinductive definitions of subtyping for recursive types.
    ///
    /// See <https://en.wikipedia.org/wiki/Coinduction> and
    /// Chapter 21.1 of "Types and Programming Languages" by Benjamin C. Pierce.
    #[inline]
    fn is_subtype_of_recursive(
        &mut self,
        subtype: Type<'heap>,
        supertype: Type<'heap>,
        cycle: RecursionCycle,
    ) -> bool {
        // Issue a non-fatal diagnostic to inform that a cycle was detected, but don't treat
        // it as an error for subtyping.
        let _: ControlFlow<()> =
            self.record_diagnostic(|_| circular_type_reference(subtype, supertype));

        cycle.should_discharge()
    }

    pub fn is_subtype_of(
        &mut self,
        variance: Variance,
        subtype: TypeId,
        supertype: TypeId,
    ) -> bool {
        let (_guard, variance_flow) = self.variance.transition(variance);

        let (subtype, supertype) = match variance_flow {
            VarianceFlow::Forward => (subtype, supertype),
            VarianceFlow::Reverse => (supertype, subtype),
            VarianceFlow::Invariant => return self.is_equivalent(subtype, supertype),
        };

        let subtype = self.environment.r#type(self.resolve_id(subtype));
        let supertype = self.environment.r#type(self.resolve_id(supertype));

        if self.boundary.enter(subtype, supertype).is_break() {
            let cycle = RecursionCycle {
                lhs: self.is_recursive(subtype.id),
                rhs: self.is_recursive(supertype.id),
            };

            return self.is_subtype_of_recursive(subtype, supertype, cycle);
        }

        if let Some(result) = self.is_quick_subtype(&subtype, &supertype) {
            self.boundary.exit(subtype, supertype);

            return result;
        }

        let result = subtype.is_subtype_of(supertype, self);

        self.boundary.exit(subtype, supertype);

        result
    }

    fn is_quick_equivalent(&self, lhs: &Type<'heap>, rhs: &Type<'heap>) -> Option<bool> {
        if lhs.id == rhs.id {
            return Some(true);
        }

        if core::ptr::eq(lhs.kind, rhs.kind) {
            return Some(true);
        }

        if self.is_equivalent_inference(lhs, rhs) {
            return Some(true);
        }

        None
    }

    /// Handling recursive type cycles during equivalence checks.
    ///
    /// For recursive types, equivalence is also determined using coinductive reasoning.
    /// When checking if two recursive types are equivalent, we initially assume they
    /// might be equivalent and check their constituent parts.
    ///
    /// Example:
    /// For `type A = (Number, A)` and `type B = (Number, B)`,
    /// to check if A ≡ B, we check if (Number, A) ≡ (Number, B)
    /// This involves checking:
    ///   1. Number ≡ Number (true)
    ///   2. A ≡ B (the original question)
    ///
    /// When we reach step 2, we're back to our original question.
    /// By returning true here, we complete the coinductive proof,
    /// confirming A ≡ B if their non-recursive parts are equivalent.
    ///
    /// This implementation adheres to two fundamental coinductive principles:
    ///
    /// 1. **F-closure**: We assume the recursive equivalence relationship holds, adding it to our
    ///    relation. This means if (A,B) is in our relation, then all structurally derived pairs
    ///    should also be in the relation.
    ///
    /// 2. **F-consistency**: For each equivalence pair in our assumed relation, we verify it can be
    ///    justified by applying equivalence rules to other pairs. We check all non-recursive
    ///    components to ensure they maintain the expected equivalence.
    ///
    /// By returning `true` upon cycle detection, we're allowing the coinductive hypothesis to
    /// stand if no contradictions are found in the non-recursive parts, which matches formal
    /// coinductive definitions of type equivalence for recursive types.
    ///
    /// See <https://en.wikipedia.org/wiki/Coinduction> and
    /// Chapter 21.1 of "Types and Programming Languages" by Benjamin C. Pierce.
    #[inline]
    fn is_equivalent_recursive(
        &mut self,
        lhs: Type<'heap>,
        rhs: Type<'heap>,
        cycle: RecursionCycle,
    ) -> bool {
        // Issue a non-fatal diagnostic to inform that a cycle was detected, but don't treat
        // it as an error for subtyping.
        let _: ControlFlow<()> = self.record_diagnostic(|_| circular_type_reference(lhs, rhs));

        cycle.should_discharge()
    }

    pub fn is_equivalent(&mut self, lhs: TypeId, rhs: TypeId) -> bool {
        let lhs = self.environment.r#type(self.resolve_id(lhs));
        let rhs = self.environment.r#type(self.resolve_id(rhs));

        if self.boundary.enter(lhs, rhs).is_break() {
            let cycle = RecursionCycle {
                lhs: self.is_recursive(lhs.id),
                rhs: self.is_recursive(rhs.id),
            };

            return self.is_equivalent_recursive(lhs, rhs, cycle);
        }

        if let Some(result) = self.is_quick_equivalent(&lhs, &rhs) {
            self.boundary.exit(lhs, rhs);

            return result;
        }

        let result = lhs.is_equivalent(rhs, self);

        self.boundary.exit(lhs, rhs);
        result
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for AnalysisEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}
