mod parameter;
mod path;

use alloc::borrow::Cow;
use core::{fmt, hash::Hash};
use std::collections::HashMap;

use derive_where::derive_where;
use error_stack::Report;
use graph_types::{
    knowledge::entity::{Entity, EntityId},
    ontology::{DataTypeId, DataTypeWithMetadata},
};
use serde::{de, de::IntoDeserializer, Deserialize};
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};

pub use self::{
    parameter::{Parameter, ParameterConversionError, ParameterList, ParameterType},
    path::{JsonPath, PathToken},
};
use crate::{
    data_type::DataTypeQueryPath,
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    subgraph::{
        edges::{EdgeDirection, OntologyEdgeKind, SharedEdgeKind},
        identifier::VertexId,
        SubgraphRecord,
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
    /// [`BaseUrl`]: type_system::url::BaseUrl
    fn base_url() -> Self;

    /// Returns the path identifying the [`OntologyTypeVersion`].
    ///
    /// [`OntologyTypeVersion`]: type_system::url::OntologyTypeVersion
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
    Equal(
        Option<FilterExpression<'p, R>>,
        Option<FilterExpression<'p, R>>,
    ),
    NotEqual(
        Option<FilterExpression<'p, R>>,
        Option<FilterExpression<'p, R>>,
    ),
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
    In(FilterExpression<'p, R>, ParameterList<'p>),
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
                Some(FilterExpression::Path(<R::QueryPath<'p>>::base_url())),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    versioned_url.base_url.as_str(),
                )))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(<R::QueryPath<'p>>::version())),
                Some(FilterExpression::Parameter(Parameter::OntologyTypeVersion(
                    versioned_url.version,
                ))),
            ),
        ])
    }
}

impl<'p> Filter<'p, DataTypeWithMetadata> {
    #[must_use]
    pub fn for_data_type_parents(
        data_type_ids: &'p [DataTypeId],
        inheritance_depth: Option<u32>,
    ) -> Self {
        Filter::In(
            FilterExpression::Path(DataTypeQueryPath::DataTypeEdge {
                edge_kind: OntologyEdgeKind::InheritsFrom,
                direction: EdgeDirection::Incoming,
                inheritance_depth,
                path: Box::new(DataTypeQueryPath::OntologyId),
            }),
            ParameterList::DataTypeIds(data_type_ids),
        )
    }

    #[must_use]
    pub fn for_data_type_children(
        versioned_url: &VersionedUrl,
        inheritance_depth: Option<u32>,
    ) -> Self {
        let data_type_id = DataTypeId::from_url(versioned_url);
        Filter::Equal(
            Some(FilterExpression::Path(DataTypeQueryPath::DataTypeEdge {
                edge_kind: OntologyEdgeKind::InheritsFrom,
                direction: EdgeDirection::Outgoing,
                inheritance_depth,
                path: Box::new(DataTypeQueryPath::OntologyId),
            })),
            Some(FilterExpression::Parameter(Parameter::Uuid(
                data_type_id.into_uuid(),
            ))),
        )
    }
}

impl<'p> Filter<'p, Entity> {
    /// Creates a `Filter` to search for a specific entities, identified by its [`EntityId`].
    #[must_use]
    pub fn for_entity_by_entity_id(entity_id: EntityId) -> Self {
        let owned_by_id_filter = Self::Equal(
            Some(FilterExpression::Path(EntityQueryPath::OwnedById)),
            Some(FilterExpression::Parameter(Parameter::Uuid(
                entity_id.owned_by_id.into_uuid(),
            ))),
        );
        let entity_uuid_filter = Self::Equal(
            Some(FilterExpression::Path(EntityQueryPath::Uuid)),
            Some(FilterExpression::Parameter(Parameter::Uuid(
                entity_id.entity_uuid.into_uuid(),
            ))),
        );

        if let Some(draft_id) = entity_id.draft_id {
            Self::All(vec![
                owned_by_id_filter,
                entity_uuid_filter,
                Self::Equal(
                    Some(FilterExpression::Path(EntityQueryPath::DraftId)),
                    Some(FilterExpression::Parameter(Parameter::Uuid(
                        draft_id.into_uuid(),
                    ))),
                ),
            ])
        } else {
            Self::All(vec![owned_by_id_filter, entity_uuid_filter])
        }
    }

    #[must_use]
    pub fn for_entity_by_type_id(entity_type_id: &'p VersionedUrl) -> Self {
        Filter::All(vec![
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityTypeEdge {
                    edge_kind: SharedEdgeKind::IsOfType,
                    path: EntityTypeQueryPath::BaseUrl,
                    inheritance_depth: Some(0),
                })),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    entity_type_id.base_url.as_str(),
                )))),
            ),
            Filter::Equal(
                Some(FilterExpression::Path(EntityQueryPath::EntityTypeEdge {
                    edge_kind: SharedEdgeKind::IsOfType,
                    path: EntityTypeQueryPath::Version,
                    inheritance_depth: Some(0),
                })),
                Some(FilterExpression::Parameter(Parameter::OntologyTypeVersion(
                    entity_type_id.version,
                ))),
            ),
        ])
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
    pub fn convert_parameters(&mut self) -> Result<(), Report<ParameterConversionError>> {
        match self {
            Self::All(filters) | Self::Any(filters) => {
                filters.iter_mut().try_for_each(Self::convert_parameters)?;
            }
            Self::Not(filter) => filter.convert_parameters()?,
            Self::Equal(lhs, rhs) | Self::NotEqual(lhs, rhs) => match (lhs, rhs) {
                (
                    Some(FilterExpression::Parameter(parameter)),
                    Some(FilterExpression::Path(path)),
                )
                | (
                    Some(FilterExpression::Path(path)),
                    Some(FilterExpression::Parameter(parameter)),
                ) => parameter.convert_to_parameter_type(path.expected_type())?,
                (..) => {}
            },
            Self::Greater(lhs, rhs)
            | Self::GreaterOrEqual(lhs, rhs)
            | Self::Less(lhs, rhs)
            | Self::LessOrEqual(lhs, rhs) => match (lhs, rhs) {
                (FilterExpression::Parameter(parameter), FilterExpression::Path(path))
                | (FilterExpression::Path(path), FilterExpression::Parameter(parameter)) => {
                    parameter.convert_to_parameter_type(path.expected_type())?;
                }
                (..) => {}
            },
            Self::CosineDistance(lhs, rhs, max) => {
                if let FilterExpression::Parameter(parameter) = max {
                    parameter.convert_to_parameter_type(ParameterType::F64)?;
                }
                match (lhs, rhs) {
                    (FilterExpression::Parameter(parameter), FilterExpression::Path(path))
                    | (FilterExpression::Path(path), FilterExpression::Parameter(parameter)) => {
                        parameter.convert_to_parameter_type(path.expected_type())?;
                    }
                    (..) => {}
                }
            }
            Self::In(lhs, rhs) => {
                if let FilterExpression::Parameter(parameter) = lhs {
                    match rhs {
                        ParameterList::DataTypeIds(_)
                        | ParameterList::PropertyTypeIds(_)
                        | ParameterList::EntityTypeIds(_)
                        | ParameterList::EntityEditionIds(_) => {
                            parameter.convert_to_parameter_type(ParameterType::Uuid)?;
                        }
                    }
                }
            }
            Self::StartsWith(lhs, rhs)
            | Self::EndsWith(lhs, rhs)
            | Self::ContainsSegment(lhs, rhs) => {
                // TODO: We need to find a way to support lists in addition to strings as well
                if let FilterExpression::Parameter(parameter) = lhs {
                    parameter.convert_to_parameter_type(ParameterType::Text)?;
                }
                if let FilterExpression::Parameter(parameter) = rhs {
                    parameter.convert_to_parameter_type(ParameterType::Text)?;
                }
            }
        }

        Ok(())
    }
}

/// A leaf value in a [`Filter`].
#[derive(Deserialize)]
#[derive_where(Debug, Clone, PartialEq; R::QueryPath<'p>)]
#[serde(
    rename_all = "camelCase",
    bound = "'de: 'p, R::QueryPath<'p>: Deserialize<'de>"
)]
pub enum FilterExpression<'p, R: QueryRecord> {
    Path(R::QueryPath<'p>),
    Parameter(Parameter<'p>),
}

#[cfg(test)]
mod tests {
    use graph_types::{
        knowledge::entity::{DraftId, EntityUuid},
        ontology::DataTypeWithMetadata,
        owned_by_id::OwnedById,
    };
    use serde_json::json;
    use uuid::Uuid;

    use super::*;

    fn test_filter_representation<'de, R>(actual: &Filter<'de, R>, expected: &'de serde_json::Value)
    where
        R: QueryRecord<QueryPath<'de>: fmt::Debug + fmt::Display + PartialEq + Deserialize<'de>>,
    {
        let mut expected =
            Filter::<R>::deserialize(expected).expect("Could not deserialize filter");
        expected.convert_parameters().expect("invalid filter");
        assert_eq!(*actual, expected);
    }

    #[test]
    fn for_versioned_url() {
        let url = VersionedUrl {
            base_url: BaseUrl::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
            )
            .expect("invalid base url"),
            version: OntologyTypeVersion::new(1),
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
        );
    }

    #[test]
    fn for_entity_by_entity_id() {
        let entity_id = EntityId {
            owned_by_id: OwnedById::new(Uuid::new_v4()),
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: None,
        };

        let expected = json!({
          "all": [
            { "equal": [
              { "path": ["ownedById"] },
              { "parameter": entity_id.owned_by_id }
            ]},
            { "equal": [
              { "path": ["uuid"] },
              { "parameter": entity_id.entity_uuid }
            ]}
          ]
        });

        test_filter_representation(&Filter::for_entity_by_entity_id(entity_id), &expected);
    }

    #[test]
    fn for_entity_by_entity_draft_id() {
        let entity_id = EntityId {
            owned_by_id: OwnedById::new(Uuid::new_v4()),
            entity_uuid: EntityUuid::new(Uuid::new_v4()),
            draft_id: Some(DraftId::new(Uuid::new_v4())),
        };

        let expected = json!({
          "all": [
            { "equal": [
              { "path": ["ownedById"] },
              { "parameter": entity_id.owned_by_id }
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

        test_filter_representation(&Filter::for_entity_by_entity_id(entity_id), &expected);
    }

    #[test]
    fn null_check() {
        let expected = json!({
          "notEqual": [
            { "path": ["description"] },
            null
          ]
        });

        test_filter_representation(
            &Filter::NotEqual(
                Some(FilterExpression::<DataTypeWithMetadata>::Path(
                    DataTypeQueryPath::Description,
                )),
                None,
            ),
            &expected,
        );
    }
}
