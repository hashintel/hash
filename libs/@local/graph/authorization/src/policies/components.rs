use alloc::borrow::Cow;
use std::collections::HashSet;

use error_stack::{Report, ResultExt as _};
use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityUuid},
    ontology::VersionedUrl,
    principal::{actor::ActorId, actor_group::WebId},
};

use super::{
    Context, ContextBuilder, Effect, Policy, PolicySet,
    action::ActionName,
    principal::actor::AuthenticatedActor,
    resource::{EntityResourceConstraint, ResourceConstraint},
    store::{PolicyStore, PrincipalStore, ResolvePoliciesParams, error::ContextCreationError},
};

/// Optimization data extracted from policy analysis for database filter generation.
///
/// This structure holds vectors of identifiers that can be optimized from multiple
/// OR conditions to efficient IN clauses in database queries.
#[derive(Debug, Default)]
pub struct OptimizationData {
    /// Entity UUIDs that can be optimized to IN clause for exact entity permits
    pub permitted_entity_uuids: Vec<EntityUuid>,
    /// Web IDs that can be optimized to IN clause for web resource permits
    pub permitted_web_ids: Vec<WebId>,
}

impl OptimizationData {
    /// Returns true if any optimization opportunities were found.
    #[must_use]
    pub const fn has_optimizations(&self) -> bool {
        !self.permitted_entity_uuids.is_empty() || !self.permitted_web_ids.is_empty()
    }
}

#[derive(Debug)]
pub struct PolicyComponents {
    actor_id: Option<ActorId>,
    policies: Vec<Policy>,
    tracked_actions: HashSet<ActionName>,
    context: Context,
    optimization_data: OptimizationData,
}

impl PolicyComponents {
    #[must_use]
    pub fn builder<S>(store: &S) -> PolicyComponentsBuilder<'_, S> {
        PolicyComponentsBuilder::new(store)
    }

    /// Returns the actor ID for this policy evaluation context.
    #[must_use]
    pub const fn actor_id(&self) -> Option<ActorId> {
        self.actor_id
    }

    /// Returns a reference to the Cedar evaluation context.
    #[must_use]
    pub const fn context(&self) -> &Context {
        &self.context
    }

    /// Returns a reference to the policies for direct access.
    ///
    /// This is primarily used for filter optimization where the raw policies
    /// need to be analyzed without building a full [`PolicySet`].
    #[must_use]
    pub fn policies(&self) -> &[Policy] {
        &self.policies
    }

    /// Returns a reference to the tracked actions.
    #[must_use]
    pub const fn tracked_actions(&self) -> &HashSet<ActionName> {
        &self.tracked_actions
    }

    /// Extracts policy data suitable for database filter creation.
    ///
    /// This method returns an iterator of `(Effect, Option<&ResourceConstraint>)` tuples
    /// that can be used directly with filter creation methods. This encapsulates the
    /// extraction logic and provides a clean interface for filter optimization.
    #[tracing::instrument(level = "info", skip(self))]
    pub fn extract_filter_policies(
        &self,
    ) -> impl Iterator<Item = (Effect, Option<&ResourceConstraint>)> {
        self.policies
            .iter()
            .map(|policy| (policy.effect, policy.resource.as_ref()))
    }

    /// Returns the optimization data for database filter generation.
    ///
    /// This data contains vectors of identifiers that can be optimized from multiple
    /// OR conditions to efficient IN clauses. For example, multiple entity permits
    /// for exact entity UUIDs can be converted from:
    /// `entity_uuid = a OR entity_uuid = b OR entity_uuid = c`
    /// to: `entity_uuid = ANY([a, b, c])`
    #[must_use]
    pub const fn optimization_data(&self) -> &OptimizationData {
        &self.optimization_data
    }

    /// Analyzes policies and extracts optimization opportunities.
    ///
    /// This method examines the policies to find patterns that can be optimized
    /// for database query generation. It extracts optimizable policies from the
    /// policies vec using [`Vec::swap_remove`] for efficiency and stores them in
    /// [`OptimizationData`]. The remaining policies vec will only contain non-optimizable
    /// policies.
    ///
    /// Uses [`HashSet`] during analysis for deduplication and fast lookups, then converts
    /// to [`Vec`] for efficient filter parameter usage.
    ///
    /// Currently detects:
    /// - Multiple exact entity permits that can be converted to IN clauses
    /// - Multiple web resource permits that can be converted to IN clauses
    #[tracing::instrument(level = "info", skip(self))]
    fn analyze_optimization_opportunities(&mut self) {
        let mut entity_uuids_set = HashSet::new();
        let mut web_ids_set = HashSet::new();

        let mut i = 0;
        while i < self.policies.len() {
            let should_extract = match (&self.policies[i].effect, &self.policies[i].resource) {
                (
                    Effect::Permit,
                    Some(ResourceConstraint::Entity(EntityResourceConstraint::Exact { id })),
                ) => {
                    entity_uuids_set.insert(*id);
                    true
                }
                (Effect::Permit, Some(ResourceConstraint::Web { web_id })) => {
                    web_ids_set.insert(*web_id);
                    true
                }
                _ => false,
            };

            if should_extract {
                self.policies.swap_remove(i);
                // Don't increment i since we just moved the last element to position i
            } else {
                i += 1;
            }
        }

        // Convert HashSets to Vecs for efficient filter usage
        self.optimization_data.permitted_entity_uuids = entity_uuids_set.into_iter().collect();
        self.optimization_data.permitted_web_ids = web_ids_set.into_iter().collect();
    }

    /// Builds a [`PolicySet`] for Cedar evaluation.
    ///
    /// This method can only be used when no optimization has occurred, since
    /// optimization extracts policies and loses their proper action tracking.
    ///
    /// For optimized [`PolicyComponents`], use filter creation methods instead.
    ///
    /// # Errors
    ///
    /// Returns error if policy set creation fails or if optimization has occurred.
    #[tracing::instrument(level = "info", skip(self))]
    pub fn build_policy_set(
        &self,
    ) -> Result<PolicySet, Report<super::set::PolicySetInsertionError>> {
        if self.optimization_data.has_optimizations() {
            return Err(
                Report::new(super::set::PolicySetInsertionError).attach_printable(
                    "Cannot create PolicySet when optimization has occurred. Extracted policies \
                     are missing proper action tracking. Use filter creation methods instead.",
                ),
            );
        }

        PolicySet::default()
            .with_tracked_actions(self.tracked_actions.clone())
            .with_policies(&self.policies)
    }
}

pub struct PolicyComponentsBuilder<'a, S> {
    store: &'a S,
    actor: AuthenticatedActor,
    context: ContextBuilder,
    entity_type_ids: HashSet<Cow<'a, VersionedUrl>>,
    entity_edition_ids: HashSet<EntityEditionId>,
    actions: HashSet<ActionName>,
    enable_optimization: bool,
}

impl<'a, S> PolicyComponentsBuilder<'a, S> {
    #[must_use]
    pub fn new(store: &'a S) -> Self {
        Self {
            store,
            actor: AuthenticatedActor::Public,
            context: ContextBuilder::default(),
            entity_type_ids: HashSet::new(),
            entity_edition_ids: HashSet::new(),
            actions: HashSet::new(),
            enable_optimization: true, // Default to optimization enabled (opt-out)
        }
    }

    pub fn set_actor(&mut self, actor: impl Into<AuthenticatedActor>) {
        self.actor = actor.into();
    }

    #[must_use]
    pub fn with_actor(mut self, actor: impl Into<AuthenticatedActor>) -> Self {
        self.set_actor(actor);
        self
    }

    pub fn add_entity_type_id(&mut self, entity_type: &'a VersionedUrl) {
        self.entity_type_ids.insert(Cow::Borrowed(entity_type));
    }

    pub fn add_entity_type_ids(&mut self, entity_type: impl IntoIterator<Item = &'a VersionedUrl>) {
        self.entity_type_ids
            .extend(entity_type.into_iter().map(Cow::Borrowed));
    }

    #[must_use]
    pub fn with_entity_type_id(mut self, entity_type: &'a VersionedUrl) -> Self {
        self.add_entity_type_id(entity_type);
        self
    }

    #[must_use]
    pub fn with_entity_type_ids(
        mut self,
        entity_types: impl IntoIterator<Item = &'a VersionedUrl>,
    ) -> Self {
        self.add_entity_type_ids(entity_types);
        self
    }

    pub fn add_entity_edition_id(&mut self, entity_edition_id: EntityEditionId) {
        self.entity_edition_ids.insert(entity_edition_id);
    }

    pub fn add_entity_edition_ids(
        &mut self,
        entity_edition_ids: impl IntoIterator<Item = EntityEditionId>,
    ) {
        self.entity_edition_ids.extend(entity_edition_ids);
    }

    #[must_use]
    pub fn with_entity_edition_id(mut self, entity_edition_id: EntityEditionId) -> Self {
        self.add_entity_edition_id(entity_edition_id);
        self
    }

    #[must_use]
    pub fn with_entity_edition_ids(
        mut self,
        entity_edition_ids: impl IntoIterator<Item = EntityEditionId>,
    ) -> Self {
        self.add_entity_edition_ids(entity_edition_ids);
        self
    }

    pub fn add_action(&mut self, action: ActionName) {
        self.actions.insert(action);
    }

    pub fn add_actions(&mut self, actions: impl IntoIterator<Item = ActionName>) {
        self.actions.extend(actions);
    }

    #[must_use]
    pub fn with_action(mut self, action: ActionName) -> Self {
        self.add_action(action);
        self
    }

    #[must_use]
    pub fn with_actions(mut self, actions: impl IntoIterator<Item = ActionName>) -> Self {
        self.add_actions(actions);
        self
    }

    pub const fn set_optimization_enabled(&mut self, enabled: bool) {
        self.enable_optimization = enabled;
    }

    #[must_use]
    pub const fn with_optimization_enabled(mut self, enabled: bool) -> Self {
        self.set_optimization_enabled(enabled);
        self
    }

    #[must_use]
    pub const fn without_optimization(mut self) -> Self {
        self.set_optimization_enabled(false);
        self
    }
}

impl<S> IntoFuture for PolicyComponentsBuilder<'_, S>
where
    S: PrincipalStore + PolicyStore + Sync,
{
    type Output = Result<PolicyComponents, Report<ContextCreationError>>;

    type IntoFuture = impl Future<Output = Self::Output> + Send;

    #[tracing::instrument(level = "info", skip(self))]
    fn into_future(mut self) -> Self::IntoFuture {
        async move {
            let actor_id = match self.actor {
                AuthenticatedActor::Public => None,
                AuthenticatedActor::Id(actor_id) => Some(actor_id),
                AuthenticatedActor::Uuid(actor_uuid) => self
                    .store
                    .determine_actor(actor_uuid)
                    .await
                    .change_context(ContextCreationError::DetermineActor {
                        actor_id: actor_uuid,
                    })?,
            };

            if let Some(actor_id) = actor_id {
                self.store
                    .build_principal_context(actor_id, &mut self.context)
                    .await
                    .change_context(ContextCreationError::BuildPrincipalContext { actor_id })?;
            } else {
                self.context.add_public_actor();
            }

            let entity_resources;
            let mut entity_type_ids = self.entity_type_ids;
            if !self.entity_edition_ids.is_empty() {
                entity_resources = self
                    .store
                    .build_entity_context(
                        &self.entity_edition_ids.iter().copied().collect::<Vec<_>>(),
                    )
                    .await
                    .change_context(ContextCreationError::BuildEntityContext {
                        entity_edition_ids: self.entity_edition_ids,
                    })?;
                for entity_resource in &entity_resources {
                    self.context.add_entity(entity_resource);
                    entity_type_ids.extend(entity_resource.entity_type.iter().map(Cow::Borrowed));
                }
            }

            if !entity_type_ids.is_empty() {
                let entity_type_ids = entity_type_ids.iter().map(Cow::as_ref).collect::<Vec<_>>();
                let entity_type_resources = self
                    .store
                    .build_entity_type_context(&entity_type_ids)
                    .await
                    .change_context_lazy(|| ContextCreationError::BuildEntityTypeContext {
                        entity_type_ids: entity_type_ids.into_iter().cloned().collect(),
                    })?;
                for entity_type_resource in &entity_type_resources {
                    self.context.add_entity_type(entity_type_resource);
                }
            }

            let actions = self.actions.iter().copied().collect::<Vec<_>>();
            let policies = if actions.is_empty() {
                Vec::new()
            } else {
                self.store
                    .resolve_policies_for_actor(
                        self.actor,
                        ResolvePoliciesParams {
                            actor: actor_id,
                            actions: Cow::Borrowed(&actions),
                        },
                    )
                    .await
                    .change_context(ContextCreationError::ResolveActorPolicies { actor_id })?
            };

            let mut policy_components = PolicyComponents {
                actor_id,
                policies,
                tracked_actions: self.actions,
                context: self
                    .context
                    .build()
                    .change_context(ContextCreationError::CreatePolicyContext)?,
                optimization_data: OptimizationData::default(),
            };

            // Analyze for optimization opportunities if enabled
            if self.enable_optimization {
                policy_components.analyze_optimization_opportunities();
            }

            Ok(policy_components)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use type_system::{knowledge::entity::id::EntityUuid, principal::actor::ActorId};
    use uuid::Uuid;

    use super::{OptimizationData, PolicyComponents};
    use crate::policies::{
        Context, Effect, Policy, PolicyId,
        action::ActionName,
        resource::{EntityResourceConstraint, ResourceConstraint},
    };

    fn create_test_entity_permit_policy(entity_uuid: EntityUuid) -> Policy {
        Policy {
            id: PolicyId(Uuid::new_v4()),
            name: Some(format!("permit-entity-{entity_uuid}")),
            effect: Effect::Permit,
            principal: None,
            actions: vec![ActionName::View],
            resource: Some(ResourceConstraint::Entity(
                EntityResourceConstraint::Exact { id: entity_uuid },
            )),
            constraints: None,
        }
    }

    /// Tests that default [`OptimizationData`] has no optimizations.
    #[test]
    fn optimization_data_empty_by_default() {
        let optimization_data = OptimizationData::default();
        assert!(
            !optimization_data.has_optimizations(),
            "should have no optimizations when empty"
        );
    }

    /// Tests that [`OptimizationData`] detects optimizations when entity UUIDs are present.
    #[test]
    fn optimization_data_detects_entity_optimizations() {
        let mut optimization_data = OptimizationData::default();
        optimization_data
            .permitted_entity_uuids
            .push(EntityUuid::new(Uuid::new_v4()));
        optimization_data
            .permitted_entity_uuids
            .push(EntityUuid::new(Uuid::new_v4()));
        assert!(
            optimization_data.has_optimizations(),
            "should detect optimizations when entity UUIDs present"
        );
    }

    /// Tests that [`PolicySet`] creation is prevented after optimization.
    ///
    /// Verifies that optimization analysis makes [`PolicySet`] unavailable to prevent
    /// action tracking issues.
    #[test]
    fn build_policy_set_prevented_after_optimization() {
        let entity_uuid1 = EntityUuid::new(Uuid::new_v4());
        let entity_uuid2 = EntityUuid::new(Uuid::new_v4());

        let policies = vec![
            create_test_entity_permit_policy(entity_uuid1),
            create_test_entity_permit_policy(entity_uuid2),
        ];

        let mut policy_components = PolicyComponents {
            actor_id: None,
            policies,
            tracked_actions: HashSet::new(),
            context: Context::default(),
            optimization_data: OptimizationData::default(),
        };

        let result_before = policy_components.build_policy_set();
        assert!(
            result_before.is_ok(),
            "should allow PolicySet creation before optimization"
        );

        policy_components.analyze_optimization_opportunities();
        let result_after = policy_components.build_policy_set();
        assert!(
            result_after.is_err(),
            "should prevent PolicySet creation after optimization"
        );

        let error = result_after.expect_err("should return error after optimization");
        let error_message = format!("{error}");
        let debug_message = format!("{error:?}");

        assert_eq!(
            error_message, "policy set insertion failed",
            "should show basic error message"
        );
        assert!(
            debug_message.contains("Cannot create PolicySet when optimization has occurred"),
            "should include detailed error information"
        );
    }

    /// Tests optimization opt-out functionality.
    ///
    /// Verifies that [`PolicySet`] creation works when optimization is disabled
    /// and fails when optimization is enabled.
    #[test]
    fn builder_optimization_opt_out_controls_policy_set() {
        let entity_uuid1 = EntityUuid::new(Uuid::new_v4());
        let entity_uuid2 = EntityUuid::new(Uuid::new_v4());

        let policies_without_optimization = vec![
            create_test_entity_permit_policy(entity_uuid1),
            create_test_entity_permit_policy(entity_uuid2),
        ];

        let policy_components_without_optimization = PolicyComponents {
            actor_id: None,
            policies: policies_without_optimization,
            tracked_actions: HashSet::new(),
            context: Context::default(),
            optimization_data: OptimizationData::default(),
        };

        assert!(
            !policy_components_without_optimization
                .optimization_data
                .has_optimizations(),
            "should have no optimizations initially"
        );

        let policy_set_result = policy_components_without_optimization.build_policy_set();
        assert!(
            policy_set_result.is_ok(),
            "should allow PolicySet creation when optimization disabled"
        );

        let policies_with_optimization = vec![
            create_test_entity_permit_policy(entity_uuid1),
            create_test_entity_permit_policy(entity_uuid2),
        ];

        let mut policy_components_with_optimization = PolicyComponents {
            actor_id: None,
            policies: policies_with_optimization,
            tracked_actions: HashSet::new(),
            context: Context::default(),
            optimization_data: OptimizationData::default(),
        };

        policy_components_with_optimization.analyze_optimization_opportunities();
        assert!(
            policy_components_with_optimization
                .optimization_data
                .has_optimizations(),
            "should detect optimizations"
        );

        let policy_set_result = policy_components_with_optimization.build_policy_set();
        assert!(
            policy_set_result.is_err(),
            "should prevent PolicySet creation when optimization enabled"
        );
    }

    /// Tests extraction of filter policies from [`PolicyComponents`].
    ///
    /// Verifies that policies are correctly converted to the format expected
    /// by filter creation functions.
    #[test]
    fn extract_filter_policies_converts_correctly() {
        let entity_uuid = EntityUuid::new(Uuid::new_v4());
        let policy = create_test_entity_permit_policy(entity_uuid);

        let policy_components = PolicyComponents {
            actor_id: Some(ActorId::User(type_system::principal::actor::UserId::new(
                Uuid::new_v4(),
            ))),
            policies: vec![policy],
            tracked_actions: HashSet::new(),
            context: Context::default(),
            optimization_data: OptimizationData::default(),
        };

        let filter_policies: Vec<_> = policy_components.extract_filter_policies().collect();

        assert_eq!(
            filter_policies.len(),
            1,
            "should extract exactly one policy"
        );
        let (effect, resource) = &filter_policies[0];
        assert_eq!(*effect, Effect::Permit, "should preserve policy effect");
        assert!(resource.is_some(), "should include resource constraint");

        match resource.expect("should have resource constraint") {
            ResourceConstraint::Entity(EntityResourceConstraint::Exact { id }) => {
                assert_eq!(*id, entity_uuid);
            }
            _ => panic!("should create exact entity constraint"),
        }
    }
}
