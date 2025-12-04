use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use type_system::{
    knowledge::entity::{
        EntityId,
        id::{EntityEditionId, EntityUuid},
    },
    ontology::{
        VersionedUrl, data_type::DataTypeUuid, entity_type::EntityTypeUuid,
        property_type::PropertyTypeUuid,
    },
    principal::{
        actor::{ActorEntityUuid, ActorId},
        actor_group::WebId,
    },
};

use super::{
    Context, ContextBuilder, Effect, PolicySet, ResolvedPolicy,
    action::ActionName,
    principal::actor::AuthenticatedActor,
    resource::{
        DataTypeResource, DataTypeResourceConstraint, EntityResource, EntityResourceConstraint,
        EntityTypeResource, EntityTypeResourceConstraint, PolicyMetaResource, PropertyTypeResource,
        PropertyTypeResourceConstraint, ResourceConstraint,
    },
    store::{PolicyStore, PrincipalStore, ResolvePoliciesParams, error::ContextCreationError},
};

/// Optimization data extracted from policy analysis for database entity filter generation.
///
/// This structure holds vectors of identifiers that can be optimized from multiple
/// OR conditions to efficient IN clauses in database queries.
#[derive(Debug, Default)]
#[expect(
    clippy::struct_field_names,
    reason = "We want to add `forbid` fields in the future as well"
)]
pub struct OptimizationData {
    /// Entity UUIDs that can be optimized to IN clause for exact entity permits.
    pub permitted_entity_uuids: Vec<EntityUuid>,
    /// Entity Type UUIDs that can be optimized to IN clause for exact entity type permits.
    pub permitted_entity_type_uuids: Vec<EntityTypeUuid>,
    /// Property Type UUIDs that can be optimized to IN clause for exact property type permits.
    pub permitted_property_type_uuids: Vec<PropertyTypeUuid>,
    /// Data Type UUIDs that can be optimized to IN clause for exact data type permits.
    pub permitted_data_type_uuids: Vec<DataTypeUuid>,
    /// Web IDs that can be optimized to IN clause for web resource permits.
    pub permitted_web_ids: Vec<WebId>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum MergePolicies {
    /// Similar policies may be merged into a single policies.
    ///
    /// For example, if there are two policies that permit the same actor to view two different
    /// entities by ID, it can be merged into a single policy.
    Yes,
    /// Similar policies may not be merged into a single policy.
    No,
}

#[derive(Debug)]
pub struct PolicyComponents {
    actor_id: Option<ActorId>,
    policies: Vec<ResolvedPolicy>,
    tracked_actions: HashMap<ActionName, Option<OptimizationData>>,
    tracked_entity_types: HashSet<VersionedUrl>,
    tracked_property_types: HashSet<VersionedUrl>,
    tracked_data_types: HashSet<VersionedUrl>,
    context: Context,
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

    /// Extracts policy data suitable for database filter creation.
    ///
    /// This method returns an iterator of `(Effect, Option<&ResourceConstraint>)` tuples
    /// that can be used directly with filter creation methods. This encapsulates the
    /// extraction logic and provides a clean interface for filter optimization.
    #[tracing::instrument(level = "info", skip(self))]
    pub fn extract_filter_policies(
        &self,
        action: ActionName,
    ) -> impl Iterator<Item = (Effect, Option<&ResourceConstraint>)> {
        debug_assert!(
            self.tracked_actions.contains_key(&action),
            "action `{}` not tracked",
            action.to_string()
        );

        self.policies
            .iter()
            .filter(move |policy| policy.actions.contains(&action))
            .map(|policy| (policy.effect, policy.resource.as_ref()))
    }

    /// Returns the optimization data for database filter generation.
    ///
    /// This data contains vectors of identifiers that can be optimized from multiple
    /// OR conditions to efficient IN clauses. For example, multiple entity permits
    /// for exact entity UUIDs can be converted from
    /// `entity_uuid = a OR entity_uuid = b OR entity_uuid = c`
    /// to `entity_uuid = ANY([a, b, c])`.
    #[must_use]
    pub fn optimization_data(&self, action: ActionName) -> &OptimizationData {
        const EMPTY_OPTIMIZATION_DATA: &OptimizationData = &OptimizationData {
            permitted_entity_uuids: Vec::new(),
            permitted_entity_type_uuids: Vec::new(),
            permitted_property_type_uuids: Vec::new(),
            permitted_data_type_uuids: Vec::new(),
            permitted_web_ids: Vec::new(),
        };

        self.tracked_actions
            .get(&action)
            .unwrap_or_else(|| {
                unreachable!("Action `{action}` is not tracked in this `PolicyComponents`")
            })
            .as_ref()
            .unwrap_or(EMPTY_OPTIMIZATION_DATA)
    }

    #[must_use]
    pub const fn tracked_entity_types(&self) -> &HashSet<VersionedUrl> {
        &self.tracked_entity_types
    }

    #[must_use]
    pub const fn tracked_property_types(&self) -> &HashSet<VersionedUrl> {
        &self.tracked_property_types
    }

    #[must_use]
    pub const fn tracked_data_types(&self) -> &HashSet<VersionedUrl> {
        &self.tracked_data_types
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
    fn analyze_optimization_opportunities(&mut self, action: ActionName) {
        let mut entity_uuids_set = HashSet::new();
        let mut ontology_type_uuids_set = HashSet::new();
        let mut property_type_uuids_set = HashSet::new();
        let mut data_type_uuids_set = HashSet::new();
        let mut web_ids_set = HashSet::new();

        let mut i = 0;
        while let Some(policy) = self.policies.get_mut(i) {
            if !policy.actions.contains(&action) {
                i += 1;
                continue;
            }

            let should_extract = match (policy.effect, &policy.resource) {
                (
                    Effect::Permit,
                    Some(ResourceConstraint::Entity(EntityResourceConstraint::Exact { id })),
                ) => {
                    entity_uuids_set.insert(*id);
                    true
                }
                (
                    Effect::Permit,
                    Some(ResourceConstraint::EntityType(EntityTypeResourceConstraint::Exact {
                        id,
                    })),
                ) => {
                    ontology_type_uuids_set.insert(EntityTypeUuid::from_url(id.as_url()));
                    true
                }
                (
                    Effect::Permit,
                    Some(ResourceConstraint::PropertyType(PropertyTypeResourceConstraint::Exact {
                        id,
                    })),
                ) => {
                    property_type_uuids_set.insert(PropertyTypeUuid::from_url(id.as_url()));
                    true
                }
                (
                    Effect::Permit,
                    Some(ResourceConstraint::DataType(DataTypeResourceConstraint::Exact { id })),
                ) => {
                    data_type_uuids_set.insert(DataTypeUuid::from_url(id.as_url()));
                    true
                }
                (Effect::Permit, Some(ResourceConstraint::Web { web_id })) => {
                    web_ids_set.insert(*web_id);
                    true
                }
                _ => false,
            };

            if should_extract {
                // The policy matches the action and is optimizable, so we extract it from the
                // policies vec.
                policy.actions.retain(|&x| x != action);
                if policy.actions.is_empty() {
                    // If no actions remain, remove the policy
                    self.policies.swap_remove(i);
                } else {
                    // Otherwise, keep the policy but remove the action
                    i += 1;
                }
            } else {
                i += 1;
            }
        }

        // Convert HashSets to Vecs for efficient filter usage
        self.tracked_actions
            .entry(action)
            .or_default()
            .replace(OptimizationData {
                permitted_entity_uuids: entity_uuids_set.into_iter().collect(),
                permitted_entity_type_uuids: ontology_type_uuids_set.into_iter().collect(),
                permitted_property_type_uuids: property_type_uuids_set.into_iter().collect(),
                permitted_data_type_uuids: data_type_uuids_set.into_iter().collect(),
                permitted_web_ids: web_ids_set.into_iter().collect(),
            });
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
    #[tracing::instrument(level = "info", skip(self, actions))]
    pub fn build_policy_set(
        &self,
        actions: impl IntoIterator<Item = ActionName>,
    ) -> Result<PolicySet, Report<super::set::PolicySetInsertionError>> {
        let tracked_actions = actions.into_iter().collect::<HashSet<_>>();
        for action in &tracked_actions {
            if let Some(optimization_data) = self.tracked_actions.get(action) {
                if optimization_data.is_some() {
                    return Err(
                        Report::new(super::set::PolicySetInsertionError).attach(format!(
                            "Action `{action}` has been optimized and cannot be used to create a \
                             `PolicySet`"
                        )),
                    );
                }
            } else {
                return Err(
                    Report::new(super::set::PolicySetInsertionError).attach(format!(
                        "Action `{action}` is not tracked in this `PolicyComponents`"
                    )),
                );
            }
        }

        // Note: We don't need to filter policies by actions here because the PolicySet
        // only evaluates actions that are in `tracked_actions`. Including all policies
        // is safe since untracked actions won't be evaluated anyway.
        //
        // Optional performance optimization: Filter policies to reduce PolicySet size:
        // ```
        // .with_policies(
        //     &self.policies
        //         .iter()
        //         .filter(|p| p.actions.iter().any(|a| tracked_actions.contains(a)))
        //         .collect::<Vec<_>>()
        // )
        // ```
        PolicySet::default()
            .with_tracked_actions(tracked_actions)
            .with_policies(&self.policies)
    }
}

pub struct PolicyComponentsBuilder<'a, S> {
    store: &'a S,
    actor: AuthenticatedActor,
    context: ContextBuilder,
    entity_type_ids: HashSet<Cow<'a, VersionedUrl>>,
    property_type_ids: HashSet<Cow<'a, VersionedUrl>>,
    data_type_ids: HashSet<Cow<'a, VersionedUrl>>,
    entity_edition_ids: HashSet<EntityEditionId>,
    /// Actions to track, with merge policies flag.
    actions: HashMap<ActionName, MergePolicies>,
}

impl<'a, S> PolicyComponentsBuilder<'a, S> {
    #[must_use]
    pub fn new(store: &'a S) -> Self {
        Self {
            store,
            actor: AuthenticatedActor::Uuid(ActorEntityUuid::public_actor()),
            context: ContextBuilder::default(),
            entity_type_ids: HashSet::new(),
            property_type_ids: HashSet::new(),
            data_type_ids: HashSet::new(),
            entity_edition_ids: HashSet::new(),
            actions: HashMap::new(),
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

    pub fn add_property_type_id(&mut self, property_type: &'a VersionedUrl) {
        self.property_type_ids.insert(Cow::Borrowed(property_type));
    }

    pub fn add_property_type_ids(
        &mut self,
        property_type: impl IntoIterator<Item = &'a VersionedUrl>,
    ) {
        self.property_type_ids
            .extend(property_type.into_iter().map(Cow::Borrowed));
    }

    #[must_use]
    pub fn with_property_type_id(mut self, property_type: &'a VersionedUrl) -> Self {
        self.add_property_type_id(property_type);
        self
    }

    #[must_use]
    pub fn with_property_type_ids(
        mut self,
        property_types: impl IntoIterator<Item = &'a VersionedUrl>,
    ) -> Self {
        self.add_property_type_ids(property_types);
        self
    }

    pub fn add_data_type_id(&mut self, data_type: &'a VersionedUrl) {
        self.data_type_ids.insert(Cow::Borrowed(data_type));
    }

    pub fn add_data_type_ids(&mut self, data_types: impl IntoIterator<Item = &'a VersionedUrl>) {
        self.data_type_ids
            .extend(data_types.into_iter().map(Cow::Borrowed));
    }

    #[must_use]
    pub fn with_data_type_id(mut self, data_type: &'a VersionedUrl) -> Self {
        self.add_data_type_id(data_type);
        self
    }

    #[must_use]
    pub fn with_data_type_ids(
        mut self,
        data_types: impl IntoIterator<Item = &'a VersionedUrl>,
    ) -> Self {
        self.add_data_type_ids(data_types);
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

    /// Adds an action to be tracked during policy resolution.
    ///
    /// The `action` will be included in policy queries and evaluation. The `merge_policies`
    /// parameter controls whether this action undergoes optimization analysis, which
    /// can improve database query performance by extracting optimizable policies.
    ///
    /// When `merge_policies` is [`MergePolicies::Yes`], the resulting [`PolicyComponents`] cannot
    /// be used to create a [`PolicySet`] for this action, as optimizable policies are
    /// extracted during analysis.
    pub fn add_action(&mut self, action: ActionName, merge_policies: MergePolicies) {
        self.actions.insert(action, merge_policies);
    }

    /// Adds multiple actions to be tracked during policy resolution.
    ///
    /// All provided `actions` will be included in policy queries and evaluation.
    /// The `merge_policies` parameter applies to all actions and controls whether they
    /// undergo optimization analysis for improved database query performance.
    ///
    /// When `merge_policies` is [`MergePolicies::Yes`], the resulting [`PolicyComponents`] cannot
    /// be used to create a [`PolicySet`] for any of these actions, as optimizable policies
    /// are extracted during analysis.
    pub fn add_actions(
        &mut self,
        actions: impl IntoIterator<Item = ActionName>,
        merge_policies: MergePolicies,
    ) {
        self.actions
            .extend(actions.into_iter().map(|action| (action, merge_policies)));
    }

    /// Adds an action to be tracked and returns the builder.
    ///
    /// The `action` will be included in policy queries and evaluation. The `merge_policies`
    /// parameter controls whether this action undergoes optimization analysis, which
    /// can improve database query performance by extracting optimizable policies.
    ///
    /// When `merge_policies` is [`MergePolicies::Yes`], the resulting [`PolicyComponents`] cannot
    /// be used to create a [`PolicySet`] for this action, as optimizable policies are
    /// extracted during analysis.
    #[must_use]
    pub fn with_action(mut self, action: ActionName, merge_policies: MergePolicies) -> Self {
        self.add_action(action, merge_policies);
        self
    }

    /// Adds multiple actions to be tracked and returns the builder.
    ///
    /// All provided `actions` will be included in policy queries and evaluation.
    /// The `merge_policies` parameter applies to all actions and controls whether they
    /// undergo optimization analysis for improved database query performance.
    ///
    /// When `merge_policies` is [`MergePolicies::Yes`], the resulting [`PolicyComponents`] cannot
    /// be used to create a [`PolicySet`] for any of these actions, as optimizable policies
    /// are extracted during analysis.
    #[must_use]
    pub fn with_actions(
        mut self,
        actions: impl IntoIterator<Item = ActionName>,
        merge_policies: MergePolicies,
    ) -> Self {
        self.add_actions(actions, merge_policies);
        self
    }

    pub fn add_entity(
        &mut self,
        actor: ActorId,
        id: EntityId,
        entity_types: Cow<'a, [VersionedUrl]>,
    ) {
        self.context.add_entity(&EntityResource {
            id,
            entity_base_types: Cow::Owned(
                entity_types
                    .iter()
                    .map(|url| url.base_url.clone())
                    .collect(),
            ),
            entity_types,
            created_by: actor,
        });
    }

    pub fn add_entity_type(&mut self, id: &VersionedUrl, web_id: Option<WebId>) {
        self.context.add_entity_type(&EntityTypeResource {
            id: Cow::Borrowed(id.into()),
            web_id,
        });
    }

    pub fn add_property_type(&mut self, id: &VersionedUrl, web_id: Option<WebId>) {
        self.context.add_property_type(&PropertyTypeResource {
            id: Cow::Borrowed(id.into()),
            web_id,
        });
    }

    pub fn add_data_type(&mut self, id: &VersionedUrl, web_id: Option<WebId>) {
        self.context.add_data_type(&DataTypeResource {
            id: Cow::Borrowed(id.into()),
            web_id,
        });
    }

    pub fn add_policy_meta_resource(&mut self, policy: &PolicyMetaResource<'_>) {
        self.context.add_policy_meta_resource(policy);
    }

    #[must_use]
    pub fn with_policy_meta_resource(mut self, policy: &PolicyMetaResource<'_>) -> Self {
        self.add_policy_meta_resource(policy);
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
                    entity_type_ids.extend(entity_resource.entity_types.iter().map(Cow::Borrowed));
                }
            }

            let tracked_entity_types = if entity_type_ids.is_empty() {
                HashSet::new()
            } else {
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
                entity_type_resources
                    .into_iter()
                    .map(|resource| resource.id.into_owned().into_url())
                    .collect::<HashSet<_>>()
            };

            let tracked_property_types = if self.property_type_ids.is_empty() {
                HashSet::new()
            } else {
                let property_type_ids = self
                    .property_type_ids
                    .iter()
                    .map(Cow::as_ref)
                    .collect::<Vec<_>>();
                let property_type_resources = self
                    .store
                    .build_property_type_context(&property_type_ids)
                    .await
                    .change_context_lazy(|| ContextCreationError::BuildPropertyTypeContext {
                        property_type_ids: property_type_ids.into_iter().cloned().collect(),
                    })?;
                for property_type_resource in &property_type_resources {
                    self.context.add_property_type(property_type_resource);
                }
                property_type_resources
                    .into_iter()
                    .map(|resource| resource.id.into_owned().into_url())
                    .collect::<HashSet<_>>()
            };

            let tracked_data_types = if self.data_type_ids.is_empty() {
                HashSet::new()
            } else {
                let data_type_ids = self
                    .data_type_ids
                    .iter()
                    .map(Cow::as_ref)
                    .collect::<Vec<_>>();
                let data_type_resources = self
                    .store
                    .build_data_type_context(&data_type_ids)
                    .await
                    .change_context_lazy(|| ContextCreationError::BuildDataTypeContext {
                        data_type_ids: data_type_ids.into_iter().cloned().collect(),
                    })?;
                for data_type_resource in &data_type_resources {
                    self.context.add_data_type(data_type_resource);
                }
                data_type_resources
                    .into_iter()
                    .map(|resource| resource.id.into_owned().into_url())
                    .collect::<HashSet<_>>()
            };

            let actions = self.actions.keys().copied().collect::<Vec<_>>();
            let policies = if actions.is_empty() {
                Vec::new()
            } else {
                self.store
                    .resolve_policies_for_actor(
                        actor_id.into(),
                        ResolvePoliciesParams {
                            actions: Cow::Borrowed(&actions),
                        },
                    )
                    .await
                    .change_context(ContextCreationError::ResolveActorPolicies { actor_id })?
            };

            let mut policy_components = PolicyComponents {
                actor_id,
                policies,
                tracked_actions: actions.iter().map(|action| (*action, None)).collect(),
                tracked_entity_types,
                tracked_property_types,
                tracked_data_types,
                context: self
                    .context
                    .build()
                    .change_context(ContextCreationError::CreatePolicyContext)?,
            };

            // Analyze for optimization opportunities if enabled
            for (action, merge_policies) in &self.actions {
                if *merge_policies == MergePolicies::Yes {
                    policy_components.analyze_optimization_opportunities(*action);
                }
            }

            Ok(policy_components)
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, HashSet};

    use type_system::{knowledge::entity::id::EntityUuid, principal::actor::ActorId};
    use uuid::Uuid;

    use super::PolicyComponents;
    use crate::policies::{
        Context, Effect, PolicyId, ResolvedPolicy,
        action::ActionName,
        resource::{EntityResourceConstraint, ResourceConstraint},
    };

    fn create_test_entity_permit_policy(entity_uuid: EntityUuid) -> ResolvedPolicy {
        ResolvedPolicy {
            original_policy_id: PolicyId(Uuid::new_v4()),
            effect: Effect::Permit,
            actions: vec![ActionName::View],
            resource: Some(ResourceConstraint::Entity(
                EntityResourceConstraint::Exact { id: entity_uuid },
            )),
        }
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
            tracked_actions: HashMap::from([(ActionName::View, None)]),
            tracked_entity_types: HashSet::new(),
            tracked_property_types: HashSet::new(),
            tracked_data_types: HashSet::new(),
            context: Context::default(),
        };

        let result_before = policy_components.build_policy_set([ActionName::View]);
        assert!(
            result_before.is_ok(),
            "should allow PolicySet creation before optimization"
        );

        policy_components.analyze_optimization_opportunities(ActionName::View);
        let result_after = policy_components.build_policy_set([ActionName::View]);
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
            debug_message.contains(
                "Action `view` has been optimized and cannot be used to create a `PolicySet`"
            ),
            "should include detailed error information",
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
            tracked_actions: HashMap::from([(ActionName::View, None)]),
            tracked_entity_types: HashSet::new(),
            tracked_property_types: HashSet::new(),
            tracked_data_types: HashSet::new(),
            context: Context::default(),
        };

        assert!(
            policy_components_without_optimization.tracked_actions[&ActionName::View].is_none(),
            "should have no optimizations initially"
        );

        let policy_set_result =
            policy_components_without_optimization.build_policy_set([ActionName::View]);
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
            tracked_actions: HashMap::new(),
            tracked_entity_types: HashSet::new(),
            tracked_property_types: HashSet::new(),
            tracked_data_types: HashSet::new(),
            context: Context::default(),
        };

        policy_components_with_optimization.analyze_optimization_opportunities(ActionName::View);
        assert!(
            policy_components_with_optimization.tracked_actions[&ActionName::View].is_some(),
            "should detect optimizations"
        );

        let policy_set_result =
            policy_components_with_optimization.build_policy_set([ActionName::View]);
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
            tracked_actions: HashMap::from([(ActionName::View, None)]),
            tracked_entity_types: HashSet::new(),
            tracked_property_types: HashSet::new(),
            tracked_data_types: HashSet::new(),
            context: Context::default(),
        };

        let filter_policies: Vec<_> = policy_components
            .extract_filter_policies(ActionName::View)
            .collect();

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
            ResourceConstraint::Meta(_)
            | ResourceConstraint::Web { .. }
            | ResourceConstraint::Entity(_)
            | ResourceConstraint::EntityType(_)
            | ResourceConstraint::PropertyType(_)
            | ResourceConstraint::DataType(_) => {
                panic!("should create exact entity constraint")
            }
        }
    }
}
