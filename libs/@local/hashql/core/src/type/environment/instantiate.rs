use alloc::rc::Rc;
use core::ops::Deref;

use smallvec::SmallVec;

use super::{
    Diagnostics, Environment,
    context::{
        provision::{ProvisionedGuard, ProvisionedScope},
        replace::{ReplacementGuard, ReplacementScope},
    },
};
use crate::{
    collection::FastHashMap,
    intern::Provisioned,
    r#type::{
        PartialType, TypeId,
        error::TypeCheckDiagnostic,
        inference::Inference as _,
        kind::{
            Param, TypeKind,
            generic::{
                GenericArgument, GenericArgumentId, GenericArguments, GenericSubstitution,
                GenericSubstitutions,
            },
        },
    },
};

// This was moved out of the `InferenceEnvironment`, as the requirements (especially provision
// scoping) are too different and there's nearly 0 overlap.
#[derive(Debug)]
pub struct InstantiateEnvironment<'env, 'heap> {
    pub environment: &'env Environment<'heap>,
    diagnostics: Diagnostics,

    // We split these into two scopes, to ensure that the behaviour or generic arguments is that
    // any "override" down the line of a generic argument results in new arguments. We only
    // take on the previous value if a substitution is active.
    substitutions_scope: Rc<ReplacementScope<GenericArgumentId>>,
    argument_scope: Rc<ReplacementScope<GenericArgumentId>>,

    provisioned: Rc<ProvisionedScope<TypeId>>,
    substitutions: FastHashMap<TypeId, Option<TypeId>>,
}

impl<'env, 'heap> InstantiateEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            diagnostics: Diagnostics::default(),

            substitutions_scope: Rc::default(),
            argument_scope: Rc::default(),

            substitutions: FastHashMap::default(),

            provisioned: Rc::default(),
        }
    }

    #[inline]
    pub fn take_diagnostics(&mut self) -> Diagnostics {
        core::mem::take(&mut self.diagnostics)
    }

    #[inline]
    pub fn record_diagnostic(&mut self, diagnostic: TypeCheckDiagnostic) {
        self.diagnostics.push(diagnostic);
    }

    #[expect(
        clippy::needless_pass_by_ref_mut,
        reason = "prove ownership of environment, so that we can borrow safely"
    )]
    pub fn instantiate_arguments(
        &mut self,
        arguments: GenericArguments<'heap>,
    ) -> (ReplacementGuard<GenericArgumentId>, GenericArguments<'heap>) {
        let mut replacements = SmallVec::<_, 16>::with_capacity(arguments.len());
        let mut mapping = Vec::with_capacity(arguments.len());

        for generic in &*arguments {
            // Check if the argument already exists, this the case if `Apply` ran before this
            let id = if let Some(id) = self.substitutions_scope.lookup(generic.id) {
                id
            } else {
                self.environment.counter.generic_argument.next()
            };

            mapping.push((generic.id, id));

            replacements.push(GenericArgument {
                id,
                name: generic.name,
                constraint: generic.constraint,
            });
        }

        let arguments = self.environment.intern_generic_arguments(&mut replacements);

        let scope = Rc::clone(&self.argument_scope);
        let guard = scope.enter_many(mapping);

        (guard, arguments)
    }

    pub fn instantiate_substitutions(
        &mut self,
        substitutions: GenericSubstitutions<'heap>,
    ) -> (
        ReplacementGuard<GenericArgumentId>,
        GenericSubstitutions<'heap>,
        bool,
    ) {
        let mut replacements = SmallVec::<_, 16>::with_capacity(substitutions.len());
        // We need a map here, because some substitutions *might* be overlapping and might be
        // referring to the same variable, due to the fact that we merge substitutions during join
        // and meet.
        let mut mapping = FastHashMap::with_capacity_and_hasher(
            substitutions.len(),
            foldhash::fast::RandomState::default(),
        );

        let mut only_identities = true;

        for &substitution in &*substitutions {
            // Check if only T ↦ T mappings exist, if that is the case then we can safely ignore any
            // substitution.
            if let Some(&TypeKind::Param(Param { argument })) =
                self.types.get(substitution.value).map(|r#type| r#type.kind)
                && argument == substitution.argument
            {
            } else {
                only_identities = false;
            }

            let argument = if let Some(&argument) = mapping.get(&substitution.argument) {
                argument
            } else {
                let id = self.environment.counter.generic_argument.next();
                mapping.insert(substitution.argument, id);

                id
            };

            replacements.push(GenericSubstitution {
                argument,
                value: self.instantiate(substitution.value),
            });
        }

        let substitutions = self
            .environment
            .intern_generic_substitutions(&mut replacements);

        let scope = Rc::clone(&self.substitutions_scope);
        let guard = scope.enter_many(mapping);

        (guard, substitutions, only_identities)
    }

    pub(crate) fn force_instantiate(&mut self, id: TypeId) -> TypeId {
        let r#type = self.environment.r#type(id);

        r#type.instantiate(self)
    }

    /// Instantiates a type by resolving its recursive structure and applying any provisioned
    /// substitutions.
    ///
    /// This function handles the instantiation of a type by:
    /// 1. Checking for recursion boundaries using `self.boundary.enter` and `self.boundary.exit`.
    ///    - If the recursion boundary is exceeded, the function attempts to retrieve a provisioned
    ///      substitution for the type.
    /// 2. Applying provisioned substitutions via `self.provisioned.get_substitution`.
    ///    - If a substitution exists, it is returned immediately.
    /// 3. Falling back to the original type ID if no substitution is found and the recursion
    ///    boundary is exceeded.
    ///
    /// # Panics
    ///
    /// In debug mode, this function panics if a type should have been provisioned but wasn't.
    /// In release builds, the function recovers gracefully by returning the original type ID.
    pub fn instantiate(&mut self, id: TypeId) -> TypeId {
        // Check if we've already visited this type before and if so, if it is a potentially
        // recursive type
        if let Some(&Some(substitution)) = self.substitutions.get(&id) {
            return substitution;
        }

        // If we already have a substitution we can use that substitution (cycle guard)
        if let Some(substitution) = self.provisioned.get_substitution(id) {
            return substitution;
        }

        let replacement = self.force_instantiate(id);

        // We only cache the instantiation / substitution in the case that the type is actually
        // potentially recursive. A type is marked as potentially recursive by setting `None`
        // through the provision function (if provisioned it must be potentially recursive)
        // This way we do not cache any types that cannot be recursive, such as parameters.
        if let Some(entry) = self.substitutions.get_mut(&id) {
            *entry = Some(replacement);
        }

        replacement
    }

    pub fn clear_provisioned(&mut self) {
        self.substitutions.clear();
    }

    pub fn provision(&mut self, id: TypeId) -> (ProvisionedGuard<TypeId>, Provisioned<TypeId>) {
        let provisioned = self.environment.types.provision();
        let guard = Rc::clone(&self.provisioned).enter(id, provisioned);

        // This is officially a potentially recursive type, therefore we can enable to cache it's
        // substitution.
        self.substitutions.insert(id, None);

        (guard, provisioned)
    }

    #[must_use]
    pub fn intern_provisioned(
        &self,
        id: Provisioned<TypeId>,
        r#type: PartialType<'heap>,
    ) -> TypeId {
        self.environment.types.intern_provisioned(id, r#type).id
    }

    #[must_use]
    pub fn lookup_argument(&self, argument: GenericArgumentId) -> Option<GenericArgumentId> {
        self.argument_scope.lookup(argument)
    }
}

// We usually try to avoid `Deref` and `DerefMut`, but it makes sense in this case.
// As the unification environment is just a wrapper around the environment with an additional guard.
impl<'heap> Deref for InstantiateEnvironment<'_, 'heap> {
    type Target = Environment<'heap>;

    fn deref(&self) -> &Self::Target {
        self.environment
    }
}
