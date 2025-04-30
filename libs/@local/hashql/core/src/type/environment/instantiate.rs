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
    intern::Provisioned,
    r#type::{
        PartialType, TypeId,
        error::TypeCheckDiagnostic,
        inference::Inference as _,
        kind::generic_argument::{GenericArgument, GenericArgumentId, GenericArguments},
        recursion::RecursionBoundary,
    },
};

// This was moved out of the `InferenceEnvironment`, as the requirements (especially provision
// scoping) are too different and there's nearly 0 overlap.
#[derive(Debug)]
pub struct InstantiateEnvironment<'env, 'heap> {
    pub environment: &'env Environment<'heap>,
    boundary: RecursionBoundary<'heap>,
    diagnostics: Diagnostics,

    argument_scope: Rc<ReplacementScope<GenericArgumentId>>,

    provisioned: Rc<ProvisionedScope<TypeId>>,
}

impl<'env, 'heap> InstantiateEnvironment<'env, 'heap> {
    pub fn new(environment: &'env Environment<'heap>) -> Self {
        Self {
            environment,
            boundary: RecursionBoundary::new(),
            diagnostics: Diagnostics::default(),

            argument_scope: Rc::default(),

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
            let id = self.environment.counter.generic_argument.next();
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

    /// Instantiates a type.
    ///
    /// # Panics
    ///
    /// Panics in debug mode if a type should have been provisioned but wasn't.
    pub fn instantiate(&mut self, id: TypeId) -> TypeId {
        let r#type = self.environment.r#type(id);

        if self.boundary.enter(r#type, r#type).is_break() {
            // See if the type has been substituted
            if let Some(substitution) = self.provisioned.get_substitution(id) {
                return substitution;
            }

            #[expect(
                clippy::manual_assert,
                reason = "false positive, this is a manual `debug_panic`"
            )]
            if cfg!(debug_assertions) {
                panic!("type id {id} should have been provisioned, but wasn't");
            }

            // in debug builds this panics if the type should have been provisioned but wasn't, as
            // we can recover from this error (we simply return the original - uninstantiated - type
            // id) we do not need to panic here in release builds.
            return id;
        }

        let result = r#type.instantiate(self);

        self.boundary.exit(r#type, r#type);
        result
    }

    #[expect(
        clippy::needless_pass_by_ref_mut,
        reason = "prove ownership of environment, so that we can borrow safely"
    )]
    pub fn provision(&mut self, id: TypeId) -> (ProvisionedGuard<TypeId>, Provisioned<TypeId>) {
        let provisioned = self.environment.types.provision();
        let guard = Rc::clone(&self.provisioned).enter(id, provisioned);

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
