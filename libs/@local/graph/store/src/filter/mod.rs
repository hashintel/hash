mod parameter;
mod path;
pub mod protection;

use alloc::borrow::Cow;
use core::{borrow::Borrow as _, fmt, hash::Hash};
use std::collections::HashMap;

use derive_where::derive_where;
use error_stack::{Report, ResultExt as _, bail};
use hash_graph_authorization::policies::{
    Effect, OptimizationData,
    resource::{
        DataTypeResourceConstraint, DataTypeResourceFilter, EntityResourceConstraint,
        EntityResourceFilter, EntityTypeResourceConstraint, EntityTypeResourceFilter,
        PropertyTypeResourceConstraint, PropertyTypeResourceFilter, ResourceConstraint,
    },
};
use hash_graph_types::ontology::DataTypeLookup;
use serde::{Deserialize, de, de::IntoDeserializer as _};
use type_system::{
    knowledge::{
        PropertyValue,
        entity::{Entity, EntityId, id::EntityEditionId},
    },
    ontology::{
        EntityTypeWithMetadata,
        data_type::{DataTypeUuid, DataTypeWithMetadata, schema::DataTypeReference},
        entity_type::EntityTypeUuid,
        id::{BaseUrl, OntologyTypeVersion, VersionedUrl},
        property_type::{PropertyTypeUuid, PropertyTypeWithMetadata},
    },
    principal::actor::{ActorEntityUuid, ActorId},
};

pub use self::{
    parameter::{
        FilterExpressionList, Parameter, ParameterConversionError, ParameterList, ParameterType,
    },
    path::{JsonPath, PathToken},
};
use crate::{
    data_type::DataTypeQueryPath,
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    filter::parameter::ActualParameterType,
    property_type::PropertyTypeQueryPath,
    subgraph::{
        SubgraphRecord,
        edges::{EdgeDirection, OntologyEdgeKind, SharedEdgeKind},
        identifier::VertexId,
    },
};

/// Parses a query token of the form `token(key=value)`.
///
/// Whitespaces are ignored and multiple parameters are supported.
///
/// # Errors
///
/// - If the token is not of the form `token`, `token()`, or `token(key=value)`
/// - If `token` can not be deserialized into `T`
pub(crate) fn parse_query_token<'de, T: Deserialize<'de>, E: de::Error>(
    token: &'de str,
) -> Result<(T, HashMap<&'de str, &'de str>), E> {
    let Some((token, parameters)) = token.split_once('(') else {
        return T::deserialize(token.into_deserializer()).map(|token| (token, HashMap::new()));
    };

    let parameters = parameters
        .strip_suffix(')')
        .ok_or_else(|| E::custom("missing closing parenthesis"))?
        .split(',')
        .filter(|parameter| !parameter.trim().is_empty())
        .map(|parameter| {
            let (key, value) = parameter
                .split_once('=')
                .ok_or_else(|| E::custom("missing parameter value, expected `key=value`"))?;
            Ok((key.trim(), value.trim()))
        })
        .collect::<Result<_, _>>()?;

    T::deserialize(token.into_deserializer()).map(|token| (token, parameters))
}

#[derive(Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub enum Selector {
    #[serde(rename = "*")]
    Asterisk,
}

pub trait QueryPath {
    /// Returns what type this resolved `Path` has.
    fn expected_type(&self) -> ParameterType;
}

pub trait QueryRecord: Sized + Send {
    type QueryPath<'p>: QueryPath + Send + Sync + Eq + Hash;
}

pub trait OntologyQueryPath {
    /// Returns the path identifying the [`BaseUrl`].
    ///
    /// [`BaseUrl`]: type_system::ontology::BaseUrl
    fn base_url() -> Self;

    /// Returns the path identifying the [`OntologyTypeVersion`].
    ///
    /// [`OntologyTypeVersion`]: type_system::ontology::id::OntologyTypeVersion
    fn version() -> Self;
}

/// A set of conditions used for queries.
#[derive(Deserialize)]
#[derive_where(Debug, Clone, PartialEq; R::QueryPath<'p>)]
#[serde(
    rename_all = "camelCase",
    bound = "'de: 'p, R::QueryPath<'p>: Deserialize<'de>"
)]
pub enum Filter<'p, R: QueryRecord> {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    Equal(FilterExpression<'p, R>, FilterExpression<'p, R>),
    NotEqual(FilterExpression<'p, R>, FilterExpression<'p, R>),
    Exists {
        path: R::QueryPath<'p>,
    },
    Greater(FilterExpression<'p, R>, FilterExpression<'p, R>),
    GreaterOrEqual(FilterExpression<'p, R>, FilterExpression<'p, R>),
    Less(FilterExpression<'p, R>, FilterExpression<'p, R>),
    LessOrEqual(FilterExpression<'p, R>, FilterExpression<'p, R>),
    CosineDistance(
        FilterExpression<'p, R>,
        FilterExpression<'p, R>,
        FilterExpression<'p, R>,
    ),
    #[serde(skip)]
    In(FilterExpression<'p, R>, FilterExpressionList<'p, R>),
    StartsWith(FilterExpression<'p, R>, FilterExpression<'p, R>),
    EndsWith(FilterExpression<'p, R>, FilterExpression<'p, R>),
    ContainsSegment(FilterExpression<'p, R>, FilterExpression<'p, R>),
}

impl<'p, R> Filter<'p, R>
where
    R: SubgraphRecord + QueryRecord<QueryPath<'p>: OntologyQueryPath>,
    R::VertexId: VertexId<BaseId = BaseUrl, RevisionId = OntologyTypeVersion>,
{
    /// Creates a `Filter` to search for a specific ontology type of kind `R`, identified by its
    /// [`VersionedUrl`].
    #[must_use]
    pub fn for_versioned_url(versioned_url: &'p VersionedUrl) -> Self {
        Self::All(vec![
            Self::Equal(
                FilterExpression::Path {
                    path: <R::QueryPath<'p>>::base_url(),
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(versioned_url.base_url.as_str())),
                    convert: None,
                },
            ),
            Self::Equal(
                FilterExpression::Path {
                    path: <R::QueryPath<'p>>::version(),
                },
                FilterExpression::Parameter {
                    parameter: Parameter::OntologyTypeVersion(Cow::Borrowed(
                        &versioned_url.version,
                    )),
                    convert: None,
                },
            ),
        ])
    }
}

impl<'p> Filter<'p, DataTypeWithMetadata> {
    #[must_use]
    pub const fn for_data_type_uuid(data_type_uuid: DataTypeUuid) -> Self {
        Self::Equal(
            FilterExpression::Path {
                path: DataTypeQueryPath::OntologyId,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(data_type_uuid.into_uuid()),
                convert: None,
            },
        )
    }

    #[must_use]
    pub const fn for_data_type_uuids(data_type_ids: &'p [DataTypeUuid]) -> Self {
        Filter::In(
            FilterExpression::Path {
                path: DataTypeQueryPath::OntologyId,
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::DataTypeIds(data_type_ids),
            },
        )
    }

    #[must_use]
    pub fn for_data_type_parents(
        data_type_ids: &'p [DataTypeUuid],
        inheritance_depth: Option<u32>,
    ) -> Self {
        Filter::In(
            FilterExpression::Path {
                path: DataTypeQueryPath::DataTypeEdge {
                    edge_kind: OntologyEdgeKind::InheritsFrom,
                    direction: EdgeDirection::Incoming,
                    inheritance_depth,
                    path: Box::new(DataTypeQueryPath::OntologyId),
                },
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::DataTypeIds(data_type_ids),
            },
        )
    }

    #[must_use]
    pub fn for_data_type_children(
        versioned_url: &VersionedUrl,
        inheritance_depth: Option<u32>,
    ) -> Self {
        let data_type_id = DataTypeUuid::from_url(versioned_url);
        Filter::Equal(
            FilterExpression::Path {
                path: DataTypeQueryPath::DataTypeEdge {
                    edge_kind: OntologyEdgeKind::InheritsFrom,
                    direction: EdgeDirection::Outgoing,
                    inheritance_depth,
                    path: Box::new(DataTypeQueryPath::OntologyId),
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(data_type_id.into_uuid()),
                convert: None,
            },
        )
    }

    #[must_use]
    pub fn for_resource_filter(resource_filter: &'p DataTypeResourceFilter) -> Self {
        match resource_filter {
            DataTypeResourceFilter::All { filters } => {
                Self::All(filters.iter().map(Self::for_resource_filter).collect())
            }
            DataTypeResourceFilter::Any { filters } => {
                Self::Any(filters.iter().map(Self::for_resource_filter).collect())
            }
            DataTypeResourceFilter::Not { filter } => {
                Self::Not(Box::new(Self::for_resource_filter(filter)))
            }
            DataTypeResourceFilter::IsBaseUrl { base_url } => Self::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::BaseUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(base_url.as_str())),
                    convert: None,
                },
            ),
            DataTypeResourceFilter::IsVersion { version } => Self::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::Version,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::OntologyTypeVersion(Cow::Borrowed(version)),
                    convert: None,
                },
            ),
            DataTypeResourceFilter::IsRemote => Self::Exists {
                path: DataTypeQueryPath::WebId,
            },
        }
    }

    #[must_use]
    pub fn for_resource_constraint(resource_constraint: &'p ResourceConstraint) -> Self {
        match resource_constraint {
            ResourceConstraint::Web { web_id } => Self::Equal(
                FilterExpression::Path {
                    path: DataTypeQueryPath::WebId,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Uuid((*web_id).into()),
                    convert: None,
                },
            ),
            ResourceConstraint::DataType(data_type_constraint) => match data_type_constraint {
                DataTypeResourceConstraint::Exact { id } => Self::for_versioned_url(id.as_url()),
                DataTypeResourceConstraint::Web { web_id, filter } => Self::All(vec![
                    Self::Equal(
                        FilterExpression::Path {
                            path: DataTypeQueryPath::WebId,
                        },
                        FilterExpression::Parameter {
                            parameter: Parameter::Uuid((*web_id).into()),
                            convert: None,
                        },
                    ),
                    Self::for_resource_filter(filter),
                ]),
                DataTypeResourceConstraint::Any { filter } => Self::for_resource_filter(filter),
            },
            ResourceConstraint::Meta(_)
            | ResourceConstraint::PropertyType(_)
            | ResourceConstraint::EntityType(_)
            | ResourceConstraint::Entity(_) => Self::Any(Vec::new()),
        }
    }

    /// Creates filters using policy data with optimization applied.
    ///
    /// This method checks for optimization opportunities first, and if found,
    /// creates more efficient database queries. If no optimizations are possible,
    /// it falls back to the standard policy-based filter creation.
    ///
    /// # Optimizations
    ///
    /// Currently supports:
    /// - Multiple exact data type permits → IN clause for data type UUIDs
    /// - Multiple web permits → IN clause for web IDs
    ///
    /// # Arguments
    ///
    /// * `policies` - Iterator of (Effect, Option<&[`ResourceConstraint`]>) pairs
    /// * `optimization_data` - Pre-analyzed optimization opportunities
    #[must_use]
    pub fn for_policies(
        policies: impl IntoIterator<Item = (Effect, Option<&'p ResourceConstraint>)>,
        optimization_data: &'p OptimizationData,
    ) -> Self {
        // Follow the same pattern as for_policies: separate permits and forbids
        let mut permits = Vec::new();
        let mut forbids = Vec::new();
        let mut blank_permit = false;

        for (effect, resource) in policies {
            match (resource, effect) {
                (None, Effect::Permit) => blank_permit = true,
                (None, Effect::Forbid) => return Self::Any(Vec::new()), // Blank forbid = deny all
                (Some(resource), Effect::Permit) => {
                    // Non-optimizable permits
                    permits.push(Self::for_resource_constraint(resource));
                }
                (Some(resource), Effect::Forbid) => {
                    // All forbids
                    forbids.push(Self::for_resource_constraint(resource));
                }
            }
        }

        // Add optimized data type permits if any
        match optimization_data.permitted_data_type_uuids.as_slice() {
            [] => {}
            &[data_type_uuid] => {
                permits.push(Self::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::OntologyId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(data_type_uuid.into_uuid()),
                        convert: None,
                    },
                ));
            }
            data_type_uuids => {
                // Use the Vec directly for the IN clause
                permits.push(Self::In(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::OntologyId,
                    },
                    FilterExpressionList::ParameterList {
                        parameters: ParameterList::DataTypeIds(data_type_uuids),
                    },
                ));
            }
        }

        // Add optimized web ID permits if any
        match optimization_data.permitted_web_ids.as_slice() {
            [] => {}
            &[web_id] => {
                permits.push(Self::Equal(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::WebId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(web_id.into()),
                        convert: None,
                    },
                ));
            }
            web_ids => {
                // Use the Vec directly for the IN clause
                permits.push(Self::In(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::WebId,
                    },
                    FilterExpressionList::ParameterList {
                        parameters: ParameterList::WebIds(web_ids),
                    },
                ));
            }
        }

        // Apply the same combination logic as for_policies
        if blank_permit {
            if forbids.is_empty() {
                Self::All(Vec::new()) // Allow all
            } else {
                Self::Not(Box::new(Self::Any(forbids))) // Allow all except forbids
            }
        } else {
            match (!permits.is_empty(), !forbids.is_empty()) {
                (false, _) => Self::Any(Vec::new()), // No permits = deny all
                (true, false) => Self::Any(permits), // Only permits
                (true, true) => Self::All(vec![
                    // Both permits and forbids
                    Self::Any(permits),
                    Self::Not(Box::new(Self::Any(forbids))),
                ]),
            }
        }
    }
}

impl<'p> Filter<'p, PropertyTypeWithMetadata> {
    #[must_use]
    pub const fn for_property_type_uuids(property_type_ids: &'p [PropertyTypeUuid]) -> Self {
        Filter::In(
            FilterExpression::Path {
                path: PropertyTypeQueryPath::OntologyId,
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::PropertyTypeIds(property_type_ids),
            },
        )
    }

    #[must_use]
    pub fn for_resource_constraint(resource_constraint: &'p ResourceConstraint) -> Self {
        match resource_constraint {
            ResourceConstraint::Web { web_id } => Self::Equal(
                FilterExpression::Path {
                    path: PropertyTypeQueryPath::WebId,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Uuid((*web_id).into()),
                    convert: None,
                },
            ),
            ResourceConstraint::PropertyType(property_type_constraint) => {
                match property_type_constraint {
                    PropertyTypeResourceConstraint::Exact { id } => {
                        Self::for_versioned_url(id.as_url())
                    }
                    PropertyTypeResourceConstraint::Web { web_id, filter } => Self::All(vec![
                        Self::Equal(
                            FilterExpression::Path {
                                path: PropertyTypeQueryPath::WebId,
                            },
                            FilterExpression::Parameter {
                                parameter: Parameter::Uuid((*web_id).into()),
                                convert: None,
                            },
                        ),
                        Self::for_resource_filter(filter),
                    ]),
                    PropertyTypeResourceConstraint::Any { filter } => {
                        Self::for_resource_filter(filter)
                    }
                }
            }
            ResourceConstraint::Meta(_)
            | ResourceConstraint::DataType(_)
            | ResourceConstraint::EntityType(_)
            | ResourceConstraint::Entity(_) => Self::Any(Vec::new()),
        }
    }

    #[must_use]
    pub fn for_resource_filter(resource_filter: &'p PropertyTypeResourceFilter) -> Self {
        match resource_filter {
            PropertyTypeResourceFilter::All { filters } => {
                Self::All(filters.iter().map(Self::for_resource_filter).collect())
            }
            PropertyTypeResourceFilter::Any { filters } => {
                Self::Any(filters.iter().map(Self::for_resource_filter).collect())
            }
            PropertyTypeResourceFilter::Not { filter } => {
                Self::Not(Box::new(Self::for_resource_filter(filter)))
            }
            PropertyTypeResourceFilter::IsBaseUrl { base_url } => Self::Equal(
                FilterExpression::Path {
                    path: PropertyTypeQueryPath::BaseUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(base_url.as_str())),
                    convert: None,
                },
            ),
            PropertyTypeResourceFilter::IsVersion { version } => Self::Equal(
                FilterExpression::Path {
                    path: PropertyTypeQueryPath::Version,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::OntologyTypeVersion(Cow::Borrowed(version)),
                    convert: None,
                },
            ),
            PropertyTypeResourceFilter::IsRemote => Self::Exists {
                path: PropertyTypeQueryPath::WebId,
            },
        }
    }

    /// Creates filters using policy data with optimization applied.
    ///
    /// This method checks for optimization opportunities first, and if found,
    /// creates more efficient database queries. If no optimizations are possible,
    /// it falls back to the standard policy-based filter creation.
    ///
    /// # Optimizations
    ///
    /// Currently supports:
    /// - Multiple exact property type permits → IN clause for property type UUIDs
    /// - Multiple web permits → IN clause for web IDs
    #[must_use]
    pub fn for_policies(
        policies: impl IntoIterator<Item = (Effect, Option<&'p ResourceConstraint>)>,
        optimization_data: &'p OptimizationData,
    ) -> Self {
        // Follow the same pattern as for_policies: separate permits and forbids
        let mut permits = Vec::new();
        let mut forbids = Vec::new();
        let mut blank_permit = false;

        for (effect, resource) in policies {
            match (resource, effect) {
                (None, Effect::Permit) => blank_permit = true,
                (None, Effect::Forbid) => return Self::Any(Vec::new()), // Blank forbid = deny all
                (Some(resource), Effect::Permit) => {
                    // Non-optimizable permits
                    permits.push(Self::for_resource_constraint(resource));
                }
                (Some(resource), Effect::Forbid) => {
                    // All forbids
                    forbids.push(Self::for_resource_constraint(resource));
                }
            }
        }

        // Add optimized property type permits if any
        match optimization_data.permitted_property_type_uuids.as_slice() {
            [] => {}
            &[property_type_uuid] => {
                permits.push(Self::Equal(
                    FilterExpression::Path {
                        path: PropertyTypeQueryPath::OntologyId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(property_type_uuid.into_uuid()),
                        convert: None,
                    },
                ));
            }
            property_type_uuids => {
                // Use the Vec directly for the IN clause
                permits.push(Self::In(
                    FilterExpression::Path {
                        path: PropertyTypeQueryPath::OntologyId,
                    },
                    FilterExpressionList::ParameterList {
                        parameters: ParameterList::PropertyTypeIds(property_type_uuids),
                    },
                ));
            }
        }

        // Add optimized web ID permits if any
        match optimization_data.permitted_web_ids.as_slice() {
            [] => {}
            &[web_id] => {
                permits.push(Self::Equal(
                    FilterExpression::Path {
                        path: PropertyTypeQueryPath::WebId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(web_id.into()),
                        convert: None,
                    },
                ));
            }
            web_ids => {
                // Use the Vec directly for the IN clause
                permits.push(Self::In(
                    FilterExpression::Path {
                        path: PropertyTypeQueryPath::WebId,
                    },
                    FilterExpressionList::ParameterList {
                        parameters: ParameterList::WebIds(web_ids),
                    },
                ));
            }
        }

        // Apply the same combination logic as for_policies
        if blank_permit {
            if forbids.is_empty() {
                Self::All(Vec::new()) // Allow all
            } else {
                Self::Not(Box::new(Self::Any(forbids))) // Allow all except forbids
            }
        } else {
            match (!permits.is_empty(), !forbids.is_empty()) {
                (false, _) => Self::Any(Vec::new()), // No permits = deny all
                (true, false) => Self::Any(permits), // Only permits
                (true, true) => Self::All(vec![
                    // Both permits and forbids
                    Self::Any(permits),
                    Self::Not(Box::new(Self::Any(forbids))),
                ]),
            }
        }
    }
}

impl<'p> Filter<'p, EntityTypeWithMetadata> {
    #[must_use]
    pub const fn for_entity_type_uuids(entity_type_ids: &'p [EntityTypeUuid]) -> Self {
        Filter::In(
            FilterExpression::Path {
                path: EntityTypeQueryPath::OntologyId,
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::EntityTypeIds(entity_type_ids),
            },
        )
    }

    #[must_use]
    pub fn for_resource_filter(resource_filter: &'p EntityTypeResourceFilter) -> Self {
        match resource_filter {
            EntityTypeResourceFilter::All { filters } => {
                Self::All(filters.iter().map(Self::for_resource_filter).collect())
            }
            EntityTypeResourceFilter::Any { filters } => {
                Self::Any(filters.iter().map(Self::for_resource_filter).collect())
            }
            EntityTypeResourceFilter::Not { filter } => {
                Self::Not(Box::new(Self::for_resource_filter(filter)))
            }
            EntityTypeResourceFilter::IsBaseUrl { base_url } => Self::Equal(
                FilterExpression::Path {
                    path: EntityTypeQueryPath::BaseUrl,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(base_url.as_str())),
                    convert: None,
                },
            ),
            EntityTypeResourceFilter::IsVersion { version } => Self::Equal(
                FilterExpression::Path {
                    path: EntityTypeQueryPath::Version,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::OntologyTypeVersion(Cow::Borrowed(version)),
                    convert: None,
                },
            ),
            EntityTypeResourceFilter::IsRemote => Self::Exists {
                path: EntityTypeQueryPath::WebId,
            },
        }
    }

    #[must_use]
    pub fn for_resource_constraint(resource_constraint: &'p ResourceConstraint) -> Self {
        match resource_constraint {
            ResourceConstraint::Web { web_id } => Self::Equal(
                FilterExpression::Path {
                    path: EntityTypeQueryPath::WebId,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Uuid((*web_id).into()),
                    convert: None,
                },
            ),
            ResourceConstraint::EntityType(entity_type_constraint) => {
                match entity_type_constraint {
                    EntityTypeResourceConstraint::Exact { id } => {
                        Self::for_versioned_url(id.as_url())
                    }
                    EntityTypeResourceConstraint::Web { web_id, filter } => Self::All(vec![
                        Self::Equal(
                            FilterExpression::Path {
                                path: EntityTypeQueryPath::OntologyId,
                            },
                            FilterExpression::Parameter {
                                parameter: Parameter::Uuid((*web_id).into()),
                                convert: None,
                            },
                        ),
                        Self::for_resource_filter(filter),
                    ]),
                    EntityTypeResourceConstraint::Any { filter } => {
                        Self::for_resource_filter(filter)
                    }
                }
            }
            ResourceConstraint::Meta(_)
            | ResourceConstraint::DataType(_)
            | ResourceConstraint::Entity(_)
            | ResourceConstraint::PropertyType(_) => Self::Any(Vec::new()),
        }
    }

    /// Creates filters using policy data with optimization applied.
    ///
    /// This method checks for optimization opportunities first, and if found,
    /// creates more efficient database queries. If no optimizations are possible,
    /// it falls back to the standard policy-based filter creation.
    ///
    /// # Optimizations
    ///
    /// Currently supports:
    /// - Multiple exact entity type permits → IN clause for entity UUIDs
    /// - Multiple web permits → IN clause for web IDs
    ///
    /// # Arguments
    ///
    /// * `policies` - Iterator of (Effect, Option<&[`ResourceConstraint`]>) pairs
    /// * `actor_id` - Optional actor ID for context-aware filters
    /// * `optimization_data` - Pre-analyzed optimization opportunities
    #[must_use]
    pub fn for_policies(
        policies: impl IntoIterator<Item = (Effect, Option<&'p ResourceConstraint>)>,
        optimization_data: &'p OptimizationData,
    ) -> Self {
        // Follow the same pattern as for_policies: separate permits and forbids
        let mut permits = Vec::new();
        let mut forbids = Vec::new();
        let mut blank_permit = false;

        for (effect, resource) in policies {
            match (resource, effect) {
                (None, Effect::Permit) => blank_permit = true,
                (None, Effect::Forbid) => return Self::Any(Vec::new()), // Blank forbid = deny all
                (Some(resource), Effect::Permit) => {
                    // Non-optimizable permits
                    permits.push(Self::for_resource_constraint(resource));
                }
                (Some(resource), Effect::Forbid) => {
                    // All forbids
                    forbids.push(Self::for_resource_constraint(resource));
                }
            }
        }

        // Add optimized entity permits if any
        match optimization_data.permitted_entity_type_uuids.as_slice() {
            [] => {}
            &[entity_type_uuid] => {
                permits.push(Self::Equal(
                    FilterExpression::Path {
                        path: EntityTypeQueryPath::OntologyId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(entity_type_uuid.into_uuid()),
                        convert: None,
                    },
                ));
            }
            entity_type_uuids => {
                // Use the Vec directly for the IN clause
                permits.push(Self::In(
                    FilterExpression::Path {
                        path: EntityTypeQueryPath::OntologyId,
                    },
                    FilterExpressionList::ParameterList {
                        parameters: ParameterList::EntityTypeIds(entity_type_uuids),
                    },
                ));
            }
        }

        // Add optimized web ID permits if any
        match optimization_data.permitted_web_ids.as_slice() {
            [] => {}
            &[web_id] => {
                permits.push(Self::Equal(
                    FilterExpression::Path {
                        path: EntityTypeQueryPath::WebId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(web_id.into()),
                        convert: None,
                    },
                ));
            }
            web_ids => {
                // Use the Vec directly for the IN clause
                permits.push(Self::In(
                    FilterExpression::Path {
                        path: EntityTypeQueryPath::WebId,
                    },
                    FilterExpressionList::ParameterList {
                        parameters: ParameterList::WebIds(web_ids),
                    },
                ));
            }
        }

        // Apply the same combination logic as for_policies
        if blank_permit {
            if forbids.is_empty() {
                Self::All(Vec::new()) // Allow all
            } else {
                Self::Not(Box::new(Self::Any(forbids))) // Allow all except forbids
            }
        } else {
            match (!permits.is_empty(), !forbids.is_empty()) {
                (false, _) => Self::Any(Vec::new()), // No permits = deny all
                (true, false) => Self::Any(permits), // Only permits
                (true, true) => Self::All(vec![
                    // Both permits and forbids
                    Self::Any(permits),
                    Self::Not(Box::new(Self::Any(forbids))),
                ]),
            }
        }
    }
}

impl<'p> Filter<'p, Entity> {
    /// Creates a `Filter` to search for a specific entities, identified by its [`EntityId`].
    #[must_use]
    pub fn for_entity_by_entity_id(entity_id: EntityId) -> Self {
        let web_id_filter = Self::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::WebId,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(entity_id.web_id.into()),
                convert: None,
            },
        );
        let entity_uuid_filter = Self::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::Uuid,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Uuid(entity_id.entity_uuid.into()),
                convert: None,
            },
        );

        if let Some(draft_id) = entity_id.draft_id {
            Self::All(vec![
                web_id_filter,
                entity_uuid_filter,
                Self::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::DraftId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(draft_id.into()),
                        convert: None,
                    },
                ),
            ])
        } else {
            Self::All(vec![web_id_filter, entity_uuid_filter])
        }
    }

    #[must_use]
    pub const fn for_entity_by_base_type_id(base_type_id: &'p BaseUrl) -> Self {
        Filter::Equal(
            FilterExpression::Path {
                path: EntityQueryPath::EntityTypeEdge {
                    edge_kind: SharedEdgeKind::IsOfType,
                    path: EntityTypeQueryPath::BaseUrl,
                    inheritance_depth: None,
                },
            },
            FilterExpression::Parameter {
                parameter: Parameter::Text(Cow::Borrowed(base_type_id.as_str())),
                convert: None,
            },
        )
    }

    #[must_use]
    pub fn for_entity_by_type_id(entity_type_id: &'p VersionedUrl) -> Self {
        Filter::All(vec![
            Self::for_entity_by_base_type_id(&entity_type_id.base_url),
            Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::Version,
                        inheritance_depth: None,
                    },
                },
                FilterExpression::Parameter {
                    parameter: Parameter::OntologyTypeVersion(Cow::Borrowed(
                        &entity_type_id.version,
                    )),
                    convert: None,
                },
            ),
        ])
    }

    #[must_use]
    pub const fn for_entity_edition_ids(entity_edition_ids: &'p [EntityEditionId]) -> Self {
        Filter::In(
            FilterExpression::Path {
                path: EntityQueryPath::EditionId,
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::EntityEditionIds(entity_edition_ids),
            },
        )
    }

    #[must_use]
    pub fn for_resource_filter(
        resource_filter: &'p EntityResourceFilter,
        actor_id: Option<ActorId>,
    ) -> Self {
        match resource_filter {
            EntityResourceFilter::All { filters } => Self::All(
                filters
                    .iter()
                    .map(|filter| Self::for_resource_filter(filter, actor_id))
                    .collect(),
            ),
            EntityResourceFilter::Any { filters } => Self::Any(
                filters
                    .iter()
                    .map(|filter| Self::for_resource_filter(filter, actor_id))
                    .collect(),
            ),
            EntityResourceFilter::Not { filter } => {
                Self::Not(Box::new(Self::for_resource_filter(filter, actor_id)))
            }
            EntityResourceFilter::CreatedByPrincipal => Self::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::Provenance(Some(JsonPath::from_path_tokens(vec![
                        PathToken::Field(Cow::Borrowed("createdById")),
                    ]))),
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Any(PropertyValue::String(
                        actor_id
                            .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from)
                            .to_string(),
                    )),
                    convert: None,
                },
            ),
            EntityResourceFilter::IsOfType { entity_type } => {
                Self::for_entity_by_type_id(entity_type)
            }
            EntityResourceFilter::IsOfBaseType { entity_type } => {
                Self::for_entity_by_base_type_id(entity_type)
            }
        }
    }

    #[must_use]
    pub fn for_resource_constraint(
        resource_constraint: &'p ResourceConstraint,
        actor_id: Option<ActorId>,
    ) -> Self {
        match resource_constraint {
            ResourceConstraint::Web { web_id } => Self::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::WebId,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Uuid((*web_id).into()),
                    convert: None,
                },
            ),
            ResourceConstraint::Entity(entity_constraint) => match entity_constraint {
                EntityResourceConstraint::Exact { id } => Self::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::Uuid,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid((*id).into()),
                        convert: None,
                    },
                ),
                EntityResourceConstraint::Web { web_id, filter } => Self::All(vec![
                    Self::Equal(
                        FilterExpression::Path {
                            path: EntityQueryPath::WebId,
                        },
                        FilterExpression::Parameter {
                            parameter: Parameter::Uuid((*web_id).into()),
                            convert: None,
                        },
                    ),
                    Self::for_resource_filter(filter, actor_id),
                ]),
                EntityResourceConstraint::Any { filter } => {
                    Self::for_resource_filter(filter, actor_id)
                }
            },
            ResourceConstraint::Meta(_)
            | ResourceConstraint::DataType(_)
            | ResourceConstraint::EntityType(_)
            | ResourceConstraint::PropertyType(_) => Self::Any(Vec::new()),
        }
    }

    /// Creates filters using policy data with optimization applied.
    ///
    /// This method checks for optimization opportunities first, and if found,
    /// creates more efficient database queries. If no optimizations are possible,
    /// it falls back to the standard policy-based filter creation.
    ///
    /// # Optimizations
    ///
    /// Currently supports:
    /// - Multiple exact entity permits → IN clause for entity UUIDs
    /// - Multiple web permits → IN clause for web IDs
    ///
    /// # Arguments
    ///
    /// * `policies` - Iterator of (Effect, Option<&[`ResourceConstraint`]>) pairs
    /// * `actor_id` - Optional actor ID for context-aware filters
    /// * `optimization_data` - Pre-analyzed optimization opportunities
    #[must_use]
    pub fn for_policies(
        policies: impl IntoIterator<Item = (Effect, Option<&'p ResourceConstraint>)>,
        actor_id: Option<ActorId>,
        optimization_data: &'p OptimizationData,
    ) -> Self {
        // Follow the same pattern as for_policies: separate permits and forbids
        let mut permits = Vec::new();
        let mut forbids = Vec::new();
        let mut blank_permit = false;

        for (effect, resource) in policies {
            match (resource, effect) {
                (None, Effect::Permit) => blank_permit = true,
                (None, Effect::Forbid) => return Self::Any(Vec::new()), // Blank forbid = deny all
                (Some(resource), Effect::Permit) => {
                    // Non-optimizable permits
                    permits.push(Self::for_resource_constraint(resource, actor_id));
                }
                (Some(resource), Effect::Forbid) => {
                    // All forbids
                    forbids.push(Self::for_resource_constraint(resource, actor_id));
                }
            }
        }

        // Add optimized entity permits if any
        match optimization_data.permitted_entity_uuids.as_slice() {
            [] => {}
            &[entity_uuid] => {
                permits.push(Self::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::Uuid,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(entity_uuid.into()),
                        convert: None,
                    },
                ));
            }
            entity_uuids => {
                // Use the Vec directly for the IN clause
                permits.push(Self::In(
                    FilterExpression::Path {
                        path: EntityQueryPath::Uuid,
                    },
                    FilterExpressionList::ParameterList {
                        parameters: ParameterList::EntityUuids(entity_uuids),
                    },
                ));
            }
        }

        // Add optimized web ID permits if any
        match optimization_data.permitted_web_ids.as_slice() {
            [] => {}
            &[web_id] => {
                permits.push(Self::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::WebId,
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Uuid(web_id.into()),
                        convert: None,
                    },
                ));
            }
            web_ids => {
                // Use the Vec directly for the IN clause
                permits.push(Self::In(
                    FilterExpression::Path {
                        path: EntityQueryPath::WebId,
                    },
                    FilterExpressionList::ParameterList {
                        parameters: ParameterList::WebIds(web_ids),
                    },
                ));
            }
        }

        // Apply the same combination logic as for_policies
        if blank_permit {
            if forbids.is_empty() {
                Self::All(Vec::new()) // Allow all
            } else {
                Self::Not(Box::new(Self::Any(forbids))) // Allow all except forbids
            }
        } else {
            match (!permits.is_empty(), !forbids.is_empty()) {
                (false, _) => Self::Any(Vec::new()), // No permits = deny all
                (true, false) => Self::Any(permits), // Only permits
                (true, true) => Self::All(vec![
                    // Both permits and forbids
                    Self::Any(permits),
                    Self::Not(Box::new(Self::Any(forbids))),
                ]),
            }
        }
    }
}

impl<'p, R: QueryRecord> Filter<'p, R>
where
    R::QueryPath<'p>: fmt::Display,
{
    /// Converts the contained [`Parameter`]s to match the type of a `T::Path`.
    ///
    /// # Errors
    ///
    /// Returns [`ParameterConversionError`] if conversion fails.
    #[expect(
        clippy::too_many_lines,
        reason = "This is one big match statement. Structural queries has to be changed in the \
                  future so we keep the structure as it is."
    )]
    pub async fn convert_parameters<P>(
        &mut self,
        data_type_provider: &P,
    ) -> Result<(), Report<ParameterConversionError>>
    where
        P: DataTypeLookup + Sync,
    {
        match self {
            Self::All(filters) | Self::Any(filters) => {
                for filter in filters.iter_mut() {
                    Box::pin(filter.convert_parameters(data_type_provider)).await?;
                }
            }
            Self::Not(filter) => Box::pin(filter.convert_parameters(data_type_provider)).await?,
            Self::Equal(lhs, rhs) | Self::NotEqual(lhs, rhs) => {
                lhs.apply_parameter_conversion(data_type_provider).await?;
                rhs.apply_parameter_conversion(data_type_provider).await?;

                match (lhs, rhs) {
                    (
                        FilterExpression::Parameter {
                            parameter,
                            convert: _,
                        },
                        FilterExpression::Path { path },
                    )
                    | (
                        FilterExpression::Path { path },
                        FilterExpression::Parameter {
                            parameter,
                            convert: _,
                        },
                    ) => parameter.convert_to_parameter_type(&path.expected_type())?,
                    (..) => {}
                }
            }
            Self::Exists { path: _ } => {
                // Nothing to convert
            }
            Self::Greater(lhs, rhs)
            | Self::GreaterOrEqual(lhs, rhs)
            | Self::Less(lhs, rhs)
            | Self::LessOrEqual(lhs, rhs) => {
                lhs.apply_parameter_conversion(data_type_provider).await?;
                rhs.apply_parameter_conversion(data_type_provider).await?;

                match (lhs, rhs) {
                    (
                        FilterExpression::Parameter {
                            parameter,
                            convert: _,
                        },
                        FilterExpression::Path { path },
                    )
                    | (
                        FilterExpression::Path { path },
                        FilterExpression::Parameter {
                            parameter,
                            convert: _,
                        },
                    ) => {
                        parameter.convert_to_parameter_type(&path.expected_type())?;
                    }
                    (..) => {}
                }
            }
            Self::CosineDistance(lhs, rhs, max) => {
                lhs.apply_parameter_conversion(data_type_provider).await?;
                rhs.apply_parameter_conversion(data_type_provider).await?;
                max.apply_parameter_conversion(data_type_provider).await?;

                if let FilterExpression::Parameter {
                    parameter,
                    convert: _,
                } = max
                {
                    parameter.convert_to_parameter_type(&ParameterType::Decimal)?;
                }
                match (lhs, rhs) {
                    (
                        FilterExpression::Parameter {
                            parameter,
                            convert: _,
                        },
                        FilterExpression::Path { path },
                    )
                    | (
                        FilterExpression::Path { path },
                        FilterExpression::Parameter {
                            parameter,
                            convert: _,
                        },
                    ) => {
                        parameter.convert_to_parameter_type(&path.expected_type())?;
                    }
                    (..) => {}
                }
            }
            Self::In(lhs, rhs) => {
                lhs.apply_parameter_conversion(data_type_provider).await?;

                if let FilterExpression::Parameter {
                    parameter,
                    convert: _,
                } = lhs
                {
                    match rhs {
                        FilterExpressionList::ParameterList {
                            parameters:
                                ParameterList::DataTypeIds(_)
                                | ParameterList::PropertyTypeIds(_)
                                | ParameterList::EntityTypeIds(_)
                                | ParameterList::EntityEditionIds(_)
                                | ParameterList::EntityUuids(_)
                                | ParameterList::WebIds(_),
                        } => {
                            parameter.convert_to_parameter_type(&ParameterType::Uuid)?;
                        }
                        FilterExpressionList::Path { path: _ } => {
                            // Nothing to convert
                        }
                    }
                }
            }
            Self::StartsWith(lhs, rhs)
            | Self::EndsWith(lhs, rhs)
            | Self::ContainsSegment(lhs, rhs) => {
                lhs.apply_parameter_conversion(data_type_provider).await?;
                rhs.apply_parameter_conversion(data_type_provider).await?;

                // TODO: We need to find a way to support lists in addition to strings as well
                if let FilterExpression::Parameter {
                    parameter,
                    convert: _,
                } = lhs
                {
                    parameter.convert_to_parameter_type(&ParameterType::Text)?;
                }
                if let FilterExpression::Parameter {
                    parameter,
                    convert: _,
                } = rhs
                {
                    parameter.convert_to_parameter_type(&ParameterType::Text)?;
                }
            }
        }

        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
pub struct ParameterConversion {
    from: VersionedUrl,
    to: VersionedUrl,
}

/// A leaf value in a [`Filter`].
#[derive(Deserialize)]
#[derive_where(Debug, Clone, PartialEq; R::QueryPath<'p>)]
#[serde(untagged, bound = "'de: 'p, R::QueryPath<'p>: Deserialize<'de>")]
pub enum FilterExpression<'p, R: QueryRecord> {
    Path {
        path: R::QueryPath<'p>,
    },
    Parameter {
        parameter: Parameter<'p>,
        convert: Option<ParameterConversion>,
    },
}

impl<R: QueryRecord> FilterExpression<'_, R> {
    /// Applies a conversion to the expression if the expression is a
    /// [`FilterExpression::Parameter`] and [`convert`] is not [`None`].
    ///
    /// [`convert`]: [`FilterExpression::Parameter::convert`]
    ///
    /// # Errors
    ///
    /// - [`InvalidParameterType`] if the parameter type is not compatible with the conversion.
    /// - [`NoConversionFound`] if no conversion is found.
    ///
    /// [`InvalidParameterType`]: ParameterConversionError::InvalidParameterType
    /// [`NoConversionFound`]: ParameterConversionError::NoConversionFound
    pub async fn apply_parameter_conversion<D>(
        &mut self,
        provider: &D,
    ) -> Result<(), Report<ParameterConversionError>>
    where
        D: DataTypeLookup + Sync,
    {
        if let Self::Parameter { parameter, convert } = self
            && let Some(conversion) = convert.take()
        {
            let &mut Parameter::Decimal(ref number) = parameter else {
                bail!(ParameterConversionError::InvalidParameterType {
                    actual: ActualParameterType::Parameter(parameter.to_owned()),
                    expected: ParameterType::Decimal,
                });
            };

            let conversions = provider
                .find_conversion(
                    <&DataTypeReference>::from(&conversion.from),
                    <&DataTypeReference>::from(&conversion.to),
                )
                .await
                .change_context_lazy(|| ParameterConversionError::NoConversionFound {
                    from: conversion.from.clone(),
                    to: conversion.to.clone(),
                })?;
            let mut number = number.clone();
            for conversion in conversions.borrow() {
                number = conversion.evaluate(number);
            }

            *parameter = Parameter::Decimal(number);
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::wildcard_enum_match_arm,
        reason = "It's fine to error on unused arms in tests"
    )]

    use hash_graph_types::ontology::DataTypeLookup;
    use serde_json::json;
    use type_system::{
        knowledge::entity::id::{DraftId, EntityUuid},
        ontology::data_type::{ClosedDataType, ConversionExpression},
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::*;

    struct TestDataTypeProvider;

    impl DataTypeLookup for TestDataTypeProvider {
        type ClosedDataType = ClosedDataType;
        type DataTypeWithMetadata = DataTypeWithMetadata;
        type Error = !;

        async fn get_data_type_by_uuid(
            &self,
            _: DataTypeUuid,
        ) -> Result<Self::DataTypeWithMetadata, Report<!>> {
            unimplemented!()
        }

        async fn get_closed_data_type_by_uuid(
            &self,
            _: DataTypeUuid,
        ) -> Result<Self::ClosedDataType, Report<Self::Error>> {
            unimplemented!()
        }

        async fn is_parent_of(
            &self,
            _: &DataTypeReference,
            _: &BaseUrl,
        ) -> Result<bool, Report<!>> {
            unimplemented!()
        }

        #[expect(refining_impl_trait_internal)]
        async fn find_conversion(
            &self,
            _: &DataTypeReference,
            _: &DataTypeReference,
        ) -> Result<Vec<ConversionExpression>, Report<!>> {
            unimplemented!()
        }
    }

    async fn test_filter_representation<'de, R>(
        actual: &Filter<'de, R>,
        expected: &'de serde_json::Value,
    ) where
        R: QueryRecord<QueryPath<'de>: fmt::Debug + fmt::Display + PartialEq + Deserialize<'de>>,
    {
        let mut expected =
            Filter::<R>::deserialize(expected).expect("Could not deserialize filter");
        expected
            .convert_parameters(&TestDataTypeProvider)
            .await
            .expect("invalid filter");
        assert_eq!(*actual, expected);
    }

    #[tokio::test]
    async fn for_versioned_url() {
        let url = VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
            )
            .expect("invalid base url"),
            version: OntologyTypeVersion {
                major: 1,
                pre_release: None,
            },
        };

        let expected = json!({
          "all": [
            { "equal": [
              { "path": ["baseUrl"] },
              { "parameter": url.base_url }
            ]},
            { "equal": [
              { "path": ["version"] },
              { "parameter": url.version }
            ]}
          ]
        });

        test_filter_representation(
            &Filter::<DataTypeWithMetadata>::for_versioned_url(&url),
            &expected,
        )
        .await;
    }

    #[tokio::test]
    async fn for_entity_by_entity_id() {
        let entity_id = EntityId {
            web_id: WebId::new(Uuid::new_v4()),
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: None,
        };

        let expected = json!({
          "all": [
            { "equal": [
              { "path": ["webId"] },
              { "parameter": entity_id.web_id }
            ]},
            { "equal": [
              { "path": ["uuid"] },
              { "parameter": entity_id.entity_uuid }
            ]}
          ]
        });

        test_filter_representation(&Filter::for_entity_by_entity_id(entity_id), &expected).await;
    }

    #[tokio::test]
    async fn for_entity_by_entity_draft_id() {
        let entity_id = EntityId {
            web_id: WebId::new(Uuid::new_v4()),
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: Some(DraftId::new(Uuid::new_v4())),
        };

        let expected = json!({
          "all": [
            { "equal": [
              { "path": ["webId"] },
              { "parameter": entity_id.web_id }
            ]},
            { "equal": [
              { "path": ["uuid"] },
              { "parameter": entity_id.entity_uuid }
            ]},
            { "equal": [
              { "path": ["draftId"] },
              { "parameter": entity_id.draft_id }
            ]}
          ]
        });

        test_filter_representation(&Filter::for_entity_by_entity_id(entity_id), &expected).await;
    }

    mod policy_conversion {
        use hash_graph_authorization::policies::{
            Effect, OptimizationData, Policy, PolicyId,
            resource::{EntityResourceConstraint, ResourceConstraint},
        };
        use type_system::{
            knowledge::entity::{Entity, id::EntityUuid},
            principal::actor::{ActorId, UserId},
        };
        use uuid::Uuid;

        use super::{Filter, FilterExpression, Parameter};
        use crate::entity::EntityQueryPath;

        /// Helper to create a complete test policy.
        fn create_test_policy(
            effect: Effect,
            resource_constraint: Option<ResourceConstraint>,
        ) -> Policy {
            Policy {
                id: PolicyId::new(Uuid::new_v4()),
                name: None,
                effect,
                principal: None, // No principal constraint for these tests
                actions: vec![], // No action constraint for these tests
                resource: resource_constraint,
                constraints: None,
            }
        }

        /// Helper to extract (Effect, Option<ResourceConstraint>) tuples for
        /// [`Filter::for_policies`].
        fn policy_to_tuple(policy: &Policy) -> (Effect, Option<&ResourceConstraint>) {
            (policy.effect, policy.resource.as_ref())
        }

        #[test]
        fn single_permit_exact_entity() {
            let entity_uuid = EntityUuid::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let policy = create_test_policy(
                Effect::Permit,
                Some(ResourceConstraint::Entity(
                    EntityResourceConstraint::Exact { id: entity_uuid },
                )),
            );

            let optimization_data = OptimizationData::default();
            let filter = Filter::<Entity>::for_policies(
                [policy_to_tuple(&policy)],
                actor_id,
                &optimization_data,
            );

            // Should create an Any filter with one Equal condition for the entity UUID
            match filter {
                Filter::Any(permits) => {
                    assert_eq!(permits.len(), 1);
                    match &permits[0] {
                        Filter::Equal(
                            FilterExpression::Path {
                                path: EntityQueryPath::Uuid,
                            },
                            FilterExpression::Parameter {
                                parameter: Parameter::Uuid(uuid),
                                ..
                            },
                        ) => {
                            assert_eq!(*uuid, Uuid::from(entity_uuid));
                        }
                        other => panic!("Unexpected permit filter: {other:?}"),
                    }
                }
                other => panic!("Expected Any filter, got: {other:?}"),
            }
        }

        #[test]
        fn single_forbid_exact_entity() {
            let entity_uuid = EntityUuid::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let policy = create_test_policy(
                Effect::Forbid,
                Some(ResourceConstraint::Entity(
                    EntityResourceConstraint::Exact { id: entity_uuid },
                )),
            );

            let optimization_data = OptimizationData::default();
            let filter = Filter::<Entity>::for_policies(
                [policy_to_tuple(&policy)],
                actor_id,
                &optimization_data,
            );

            // Should create Any(Vec::new()) - no permits, only forbids
            match filter {
                Filter::Any(permits) => {
                    assert!(
                        permits.is_empty(),
                        "Expected no permits when only forbids exist"
                    );
                }
                other => panic!("Expected Any filter, got: {other:?}"),
            }
        }

        #[test]
        fn multiple_permits_same_entity_type() {
            let entity_uuid_1 = EntityUuid::new(Uuid::new_v4());
            let entity_uuid_2 = EntityUuid::new(Uuid::new_v4());
            let entity_uuid_3 = EntityUuid::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let policies = [
                create_test_policy(
                    Effect::Permit,
                    Some(ResourceConstraint::Entity(
                        EntityResourceConstraint::Exact { id: entity_uuid_1 },
                    )),
                ),
                create_test_policy(
                    Effect::Permit,
                    Some(ResourceConstraint::Entity(
                        EntityResourceConstraint::Exact { id: entity_uuid_2 },
                    )),
                ),
                create_test_policy(
                    Effect::Permit,
                    Some(ResourceConstraint::Entity(
                        EntityResourceConstraint::Exact { id: entity_uuid_3 },
                    )),
                ),
            ];

            let optimization_data = OptimizationData::default();
            let filter = Filter::<Entity>::for_policies(
                policies.iter().map(policy_to_tuple),
                actor_id,
                &optimization_data,
            );

            // Should create an Any filter with three Equal conditions
            // This is the case we want to optimize to use IN clause
            match filter {
                Filter::Any(permits) => {
                    assert_eq!(permits.len(), 3);

                    // Extract all the UUIDs from the permits
                    let mut found_uuids = Vec::new();
                    for permit in &permits {
                        match permit {
                            Filter::Equal(
                                FilterExpression::Path {
                                    path: EntityQueryPath::Uuid,
                                },
                                FilterExpression::Parameter {
                                    parameter: Parameter::Uuid(uuid),
                                    ..
                                },
                            ) => {
                                found_uuids.push(*uuid);
                            }
                            other => panic!("Unexpected permit filter: {other:?}"),
                        }
                    }

                    // Check that all expected UUIDs are present
                    assert!(found_uuids.contains(&Uuid::from(entity_uuid_1)));
                    assert!(found_uuids.contains(&Uuid::from(entity_uuid_2)));
                    assert!(found_uuids.contains(&Uuid::from(entity_uuid_3)));
                }
                other => panic!("Expected Any filter, got: {other:?}"),
            }
        }

        #[test]
        fn permit_with_forbid() {
            let permit_uuid = EntityUuid::new(Uuid::new_v4());
            let forbid_uuid = EntityUuid::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let policies = [
                create_test_policy(
                    Effect::Permit,
                    Some(ResourceConstraint::Entity(
                        EntityResourceConstraint::Exact { id: permit_uuid },
                    )),
                ),
                create_test_policy(
                    Effect::Forbid,
                    Some(ResourceConstraint::Entity(
                        EntityResourceConstraint::Exact { id: forbid_uuid },
                    )),
                ),
            ];

            let optimization_data = OptimizationData::default();
            let filter = Filter::<Entity>::for_policies(
                policies.iter().map(policy_to_tuple),
                actor_id,
                &optimization_data,
            );

            // Should create All([Any([permit]), Not(Any([forbid]))])
            match filter {
                Filter::All(conditions) => {
                    assert_eq!(conditions.len(), 2);

                    // First condition should be the permits
                    match &conditions[0] {
                        Filter::Any(permits) => {
                            assert_eq!(permits.len(), 1);
                        }
                        other => panic!("Expected Any(permits), got: {other:?}"),
                    }

                    // Second condition should be Not(Any(forbids))
                    match &conditions[1] {
                        Filter::Not(inner) => match &**inner {
                            Filter::Any(forbids) => {
                                assert_eq!(forbids.len(), 1);
                            }
                            other => panic!("Expected Any(forbids), got: {other:?}"),
                        },
                        other => panic!("Expected Not(Any(forbids)), got: {other:?}"),
                    }
                }
                other => panic!("Expected All filter, got: {other:?}"),
            }
        }

        #[test]
        fn blank_permit() {
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let policy = create_test_policy(Effect::Permit, None);
            let optimization_data = OptimizationData::default();
            let filter = Filter::<Entity>::for_policies(
                [policy_to_tuple(&policy)],
                actor_id,
                &optimization_data,
            );

            // Should create All(Vec::new()) - allow everything
            match filter {
                Filter::All(conditions) => {
                    assert!(
                        conditions.is_empty(),
                        "Blank permit should allow everything"
                    );
                }
                other => panic!("Expected All filter, got: {other:?}"),
            }
        }

        #[test]
        fn blank_forbid() {
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let policy = create_test_policy(Effect::Forbid, None);
            let optimization_data = OptimizationData::default();
            let filter = Filter::<Entity>::for_policies(
                [policy_to_tuple(&policy)],
                actor_id,
                &optimization_data,
            );

            // Should create Any(Vec::new()) - forbid everything
            match filter {
                Filter::Any(permits) => {
                    assert!(permits.is_empty(), "Blank forbid should forbid everything");
                }
                other => panic!("Expected Any filter, got: {other:?}"),
            }
        }
    }

    mod optimization {
        //! Tests for policy optimization in filter creation.
        //!
        //! These tests verify that the optimization system correctly converts multiple OR
        //! conditions to efficient IN clauses while preserving all non-optimizable
        //! policies.

        use hash_graph_authorization::policies::{
            Effect, OptimizationData, resource::ResourceConstraint,
        };
        use type_system::{
            knowledge::entity::{Entity, id::EntityUuid},
            principal::{
                actor::{ActorId, UserId},
                actor_group::WebId,
            },
        };
        use uuid::Uuid;

        use super::{Filter, FilterExpression, ParameterList};
        use crate::{entity::EntityQueryPath, filter::parameter::FilterExpressionList};

        /// Tests optimization with remaining non-optimizable policies.
        ///
        /// Verifies that optimization creates IN clauses for entity UUIDs while preserving
        /// web permits that cannot be optimized.
        #[test]
        fn optimization_combines_with_remaining_policies() {
            let entity_uuid1 = EntityUuid::new(Uuid::new_v4());
            let entity_uuid2 = EntityUuid::new(Uuid::new_v4());
            let web_id = WebId::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let web_resource = ResourceConstraint::Web { web_id };

            // After optimization analysis: entity permits extracted, web permit remains
            let policy_tuples = vec![(Effect::Permit, Some(&web_resource))];

            let mut optimization_data = OptimizationData::default();
            optimization_data.permitted_entity_uuids.push(entity_uuid1);
            optimization_data.permitted_entity_uuids.push(entity_uuid2);

            let optimized_filter =
                Filter::<Entity>::for_policies(policy_tuples, actor_id, &optimization_data);

            match optimized_filter {
                Filter::Any(permits) => {
                    assert_eq!(
                        permits.len(),
                        2,
                        "should have web permit and entity IN clause"
                    );

                    let has_web_permit = permits.iter().any(|permit| {
                        matches!(
                            permit,
                            Filter::Equal(
                                FilterExpression::Path {
                                    path: EntityQueryPath::WebId
                                },
                                _
                            )
                        )
                    });

                    let has_entity_in = permits.iter().any(|permit| {
                        matches!(
                            permit,
                            Filter::In(
                                FilterExpression::Path {
                                    path: EntityQueryPath::Uuid
                                },
                                FilterExpressionList::ParameterList {
                                    parameters: ParameterList::EntityUuids(_)
                                }
                            )
                        )
                    });

                    assert!(has_web_permit, "should contain web permit filter");
                    assert!(
                        has_entity_in,
                        "should contain entity IN clause optimization"
                    );
                }
                other => panic!("should create Any filter with combined permits, got: {other:?}"),
            }
        }

        /// Tests optimization behavior with forbid policies.
        ///
        /// Verifies that optimization preserves forbid policies while creating IN clauses
        /// for optimizable permits.
        #[test]
        fn optimization_preserves_forbid_policies() {
            let entity_uuid1 = EntityUuid::new(Uuid::new_v4());
            let entity_uuid2 = EntityUuid::new(Uuid::new_v4());
            let web_id_forbid = WebId::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let web_resource_forbid = ResourceConstraint::Web {
                web_id: web_id_forbid,
            };

            // After optimization analysis: entity permits extracted, web forbid remains
            let policy_tuples = vec![(Effect::Forbid, Some(&web_resource_forbid))];

            let mut optimization_data = OptimizationData::default();
            optimization_data.permitted_entity_uuids.push(entity_uuid1);
            optimization_data.permitted_entity_uuids.push(entity_uuid2);

            let optimized_filter =
                Filter::<Entity>::for_policies(policy_tuples, actor_id, &optimization_data);

            match optimized_filter {
                Filter::All(conditions) => {
                    assert_eq!(
                        conditions.len(),
                        2,
                        "should have permits and forbid handling"
                    );

                    let has_permits = conditions
                        .iter()
                        .any(|condition| matches!(condition, Filter::Any(_)));
                    let has_forbids = conditions
                        .iter()
                        .any(|condition| matches!(condition, Filter::Not(_)));

                    assert!(has_permits, "should contain permit filters");
                    assert!(has_forbids, "should contain forbid filters");
                }
                other => {
                    panic!("should create All filter with permits and forbids, got: {other:?}")
                }
            }
        }

        /// Tests entity optimization with other non-optimizable permits.
        ///
        /// Verifies that entity UUID optimization works alongside web permits.
        #[test]
        fn entity_optimization_with_other_permits() {
            let entity_uuid1 = EntityUuid::new(Uuid::new_v4());
            let entity_uuid2 = EntityUuid::new(Uuid::new_v4());
            let web_id = WebId::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let web_resource = ResourceConstraint::Web { web_id };

            let policy_tuples = vec![(Effect::Permit, Some(&web_resource))];

            let mut optimization_data = OptimizationData::default();
            optimization_data.permitted_entity_uuids.push(entity_uuid1);
            optimization_data.permitted_entity_uuids.push(entity_uuid2);

            let optimized_filter =
                Filter::<Entity>::for_policies(policy_tuples, actor_id, &optimization_data);

            match optimized_filter {
                Filter::Any(permits) => {
                    assert_eq!(permits.len(), 2, "should have IN clause and web permit");

                    let has_entity_in = permits.iter().any(|permit| {
                        matches!(
                            permit,
                            Filter::In(
                                FilterExpression::Path {
                                    path: EntityQueryPath::Uuid
                                },
                                FilterExpressionList::ParameterList {
                                    parameters: ParameterList::EntityUuids(_)
                                }
                            )
                        )
                    });

                    assert!(
                        has_entity_in,
                        "should contain entity IN clause optimization"
                    );
                }
                other => panic!("should create Any filter with combined permits, got: {other:?}"),
            }
        }

        /// Tests web ID optimization functionality.
        ///
        /// Verifies that multiple web ID permits are converted to a single IN clause.
        #[test]
        fn web_id_optimization_creates_in_clause() {
            let web_id1 = WebId::new(Uuid::new_v4());
            let web_id2 = WebId::new(Uuid::new_v4());
            let web_id3 = WebId::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            // After optimization analysis: all web permits extracted
            let policy_tuples = vec![];

            let mut optimization_data = OptimizationData::default();
            optimization_data.permitted_web_ids.push(web_id1);
            optimization_data.permitted_web_ids.push(web_id2);
            optimization_data.permitted_web_ids.push(web_id3);

            let optimized_filter =
                Filter::<Entity>::for_policies(policy_tuples, actor_id, &optimization_data);

            match optimized_filter {
                Filter::Any(permits) => {
                    assert_eq!(permits.len(), 1, "should have exactly one web ID IN clause");

                    let has_web_in = permits.iter().any(|permit| {
                        matches!(
                            permit,
                            Filter::In(
                                FilterExpression::Path {
                                    path: EntityQueryPath::WebId
                                },
                                FilterExpressionList::ParameterList {
                                    parameters: ParameterList::WebIds(_)
                                }
                            )
                        )
                    });

                    assert!(has_web_in, "should contain web ID IN clause optimization");
                }
                other => panic!("should create Any filter with web IN clause, got: {other:?}"),
            }
        }

        /// Tests combined entity and web ID optimization.
        ///
        /// Verifies that both entity UUID and web ID optimizations work together,
        /// creating separate IN clauses for each type.
        #[test]
        fn mixed_entity_and_web_optimization() {
            let entity_uuid1 = EntityUuid::new(Uuid::new_v4());
            let entity_uuid2 = EntityUuid::new(Uuid::new_v4());
            let web_id1 = WebId::new(Uuid::new_v4());
            let web_id2 = WebId::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            // After optimization analysis: all permits extracted
            let policy_tuples = vec![];

            let mut optimization_data = OptimizationData::default();
            optimization_data.permitted_entity_uuids.push(entity_uuid1);
            optimization_data.permitted_entity_uuids.push(entity_uuid2);
            optimization_data.permitted_web_ids.push(web_id1);
            optimization_data.permitted_web_ids.push(web_id2);

            let optimized_filter =
                Filter::<Entity>::for_policies(policy_tuples, actor_id, &optimization_data);

            match optimized_filter {
                Filter::Any(permits) => {
                    assert_eq!(permits.len(), 2, "should have entity and web IN clauses");

                    let has_entity_in = permits.iter().any(|permit| {
                        matches!(
                            permit,
                            Filter::In(
                                FilterExpression::Path {
                                    path: EntityQueryPath::Uuid
                                },
                                FilterExpressionList::ParameterList {
                                    parameters: ParameterList::EntityUuids(_)
                                }
                            )
                        )
                    });

                    let has_web_in = permits.iter().any(|permit| {
                        matches!(
                            permit,
                            Filter::In(
                                FilterExpression::Path {
                                    path: EntityQueryPath::WebId
                                },
                                FilterExpressionList::ParameterList {
                                    parameters: ParameterList::WebIds(_)
                                }
                            )
                        )
                    });

                    assert!(
                        has_entity_in,
                        "should contain entity IN clause optimization"
                    );
                    assert!(has_web_in, "should contain web ID IN clause optimization");
                }
                other => {
                    panic!("should create Any filter with both IN clauses, got: {other:?}")
                }
            }
        }

        /// Tests entity optimization with forbid policies.
        ///
        /// Verifies that the filter correctly combines optimized entity permits
        /// with forbid policies in an All structure.
        #[test]
        fn entity_optimization_with_forbids() {
            let entity_uuid1 = EntityUuid::new(Uuid::new_v4());
            let entity_uuid2 = EntityUuid::new(Uuid::new_v4());
            let web_id_forbid = WebId::new(Uuid::new_v4());
            let actor_id = Some(ActorId::User(UserId::new(Uuid::new_v4())));

            let web_resource_forbid = ResourceConstraint::Web {
                web_id: web_id_forbid,
            };

            let policy_tuples = vec![(Effect::Forbid, Some(&web_resource_forbid))];

            let mut optimization_data = OptimizationData::default();
            optimization_data.permitted_entity_uuids.push(entity_uuid1);
            optimization_data.permitted_entity_uuids.push(entity_uuid2);

            let optimized_filter =
                Filter::<Entity>::for_policies(policy_tuples, actor_id, &optimization_data);

            match &optimized_filter {
                Filter::All(conditions) => {
                    assert!(
                        matches!(conditions.as_slice(), [Filter::Any(_), Filter::Not(_)]),
                        "should create All(permits, Not(forbids)) structure"
                    );
                }
                other => {
                    panic!("should create All filter with permits and forbids, got: {other:?}")
                }
            }
        }
    }
}
