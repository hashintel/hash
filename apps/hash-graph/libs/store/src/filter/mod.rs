mod parameter;
mod path;

use alloc::borrow::Cow;
use core::{borrow::Borrow, fmt, hash::Hash};
use std::collections::HashMap;

use derive_where::derive_where;
use error_stack::{Report, ResultExt, bail};
use graph_types::{
    knowledge::entity::{Entity, EntityId},
    ontology::{DataTypeId, DataTypeProvider, DataTypeWithMetadata},
};
use serde::{Deserialize, de, de::IntoDeserializer};
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};

pub use self::{
    parameter::{Parameter, ParameterConversionError, ParameterList, ParameterType},
    path::{JsonPath, PathToken},
};
use crate::{
    data_type::DataTypeQueryPath,
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    filter::parameter::ActualParameterType,
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
                Some(FilterExpression::Path {
                    path: <R::QueryPath<'p>>::base_url(),
                }),
                Some(FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(versioned_url.base_url.as_str())),
                    convert: None,
                }),
            ),
            Self::Equal(
                Some(FilterExpression::Path {
                    path: <R::QueryPath<'p>>::version(),
                }),
                Some(FilterExpression::Parameter {
                    parameter: Parameter::OntologyTypeVersion(versioned_url.version),
                    convert: None,
                }),
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
            FilterExpression::Path {
                path: DataTypeQueryPath::DataTypeEdge {
                    edge_kind: OntologyEdgeKind::InheritsFrom,
                    direction: EdgeDirection::Incoming,
                    inheritance_depth,
                    path: Box::new(DataTypeQueryPath::OntologyId),
                },
            },
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
            Some(FilterExpression::Path {
                path: DataTypeQueryPath::DataTypeEdge {
                    edge_kind: OntologyEdgeKind::InheritsFrom,
                    direction: EdgeDirection::Outgoing,
                    inheritance_depth,
                    path: Box::new(DataTypeQueryPath::OntologyId),
                },
            }),
            Some(FilterExpression::Parameter {
                parameter: Parameter::Uuid(data_type_id.into_uuid()),
                convert: None,
            }),
        )
    }
}

impl<'p> Filter<'p, Entity> {
    /// Creates a `Filter` to search for a specific entities, identified by its [`EntityId`].
    #[must_use]
    pub fn for_entity_by_entity_id(entity_id: EntityId) -> Self {
        let owned_by_id_filter = Self::Equal(
            Some(FilterExpression::Path {
                path: EntityQueryPath::OwnedById,
            }),
            Some(FilterExpression::Parameter {
                parameter: Parameter::Uuid(entity_id.owned_by_id.into_uuid()),
                convert: None,
            }),
        );
        let entity_uuid_filter = Self::Equal(
            Some(FilterExpression::Path {
                path: EntityQueryPath::Uuid,
            }),
            Some(FilterExpression::Parameter {
                parameter: Parameter::Uuid(entity_id.entity_uuid.into_uuid()),
                convert: None,
            }),
        );

        if let Some(draft_id) = entity_id.draft_id {
            Self::All(vec![
                owned_by_id_filter,
                entity_uuid_filter,
                Self::Equal(
                    Some(FilterExpression::Path {
                        path: EntityQueryPath::DraftId,
                    }),
                    Some(FilterExpression::Parameter {
                        parameter: Parameter::Uuid(draft_id.into_uuid()),
                        convert: None,
                    }),
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
                Some(FilterExpression::Path {
                    path: EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::BaseUrl,
                        inheritance_depth: Some(0),
                    },
                }),
                Some(FilterExpression::Parameter {
                    parameter: Parameter::Text(Cow::Borrowed(entity_type_id.base_url.as_str())),
                    convert: None,
                }),
            ),
            Filter::Equal(
                Some(FilterExpression::Path {
                    path: EntityQueryPath::EntityTypeEdge {
                        edge_kind: SharedEdgeKind::IsOfType,
                        path: EntityTypeQueryPath::Version,
                        inheritance_depth: Some(0),
                    },
                }),
                Some(FilterExpression::Parameter {
                    parameter: Parameter::OntologyTypeVersion(entity_type_id.version),
                    convert: None,
                }),
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
        P: DataTypeProvider + Sync,
    {
        match self {
            Self::All(filters) | Self::Any(filters) => {
                for filter in filters.iter_mut() {
                    Box::pin(filter.convert_parameters(data_type_provider)).await?;
                }
            }
            Self::Not(filter) => Box::pin(filter.convert_parameters(data_type_provider)).await?,
            Self::Equal(lhs, rhs) | Self::NotEqual(lhs, rhs) => {
                if let Some(lhs) = lhs {
                    lhs.apply_parameter_conversion(data_type_provider).await?;
                }
                if let Some(rhs) = rhs {
                    rhs.apply_parameter_conversion(data_type_provider).await?;
                }

                match (lhs, rhs) {
                    (
                        Some(FilterExpression::Parameter {
                            parameter,
                            convert: _,
                        }),
                        Some(FilterExpression::Path { path }),
                    )
                    | (
                        Some(FilterExpression::Path { path }),
                        Some(FilterExpression::Parameter {
                            parameter,
                            convert: _,
                        }),
                    ) => parameter.convert_to_parameter_type(path.expected_type())?,
                    (..) => {}
                }
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
                        parameter.convert_to_parameter_type(path.expected_type())?;
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
                    parameter.convert_to_parameter_type(ParameterType::F64)?;
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
                        parameter.convert_to_parameter_type(path.expected_type())?;
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
                lhs.apply_parameter_conversion(data_type_provider).await?;
                rhs.apply_parameter_conversion(data_type_provider).await?;

                // TODO: We need to find a way to support lists in addition to strings as well
                if let FilterExpression::Parameter {
                    parameter,
                    convert: _,
                } = lhs
                {
                    parameter.convert_to_parameter_type(ParameterType::Text)?;
                }
                if let FilterExpression::Parameter {
                    parameter,
                    convert: _,
                } = rhs
                {
                    parameter.convert_to_parameter_type(ParameterType::Text)?;
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
        D: DataTypeProvider + Sync,
    {
        if let Self::Parameter { parameter, convert } = self {
            if let Some(conversion) = convert.take() {
                let Parameter::F64(mut number) = parameter else {
                    bail!(ParameterConversionError::InvalidParameterType {
                        actual: ActualParameterType::Parameter(parameter.to_owned()),
                        expected: ParameterType::F64,
                    });
                };

                let conversions = provider
                    .find_conversion(&conversion.from, &conversion.to)
                    .await
                    .change_context_lazy(|| ParameterConversionError::NoConversionFound {
                        from: conversion.from.clone(),
                        to: conversion.to.clone(),
                    })?;
                for conversion in conversions.borrow() {
                    number = conversion.evaluate(number);
                }

                *parameter = Parameter::F64(number);
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {

    use graph_types::{
        knowledge::entity::{DraftId, EntityUuid},
        ontology::{DataTypeWithMetadata, OntologyTypeProvider},
        owned_by_id::OwnedById,
    };
    use serde_json::json;
    use type_system::schema::ConversionExpression;
    use uuid::Uuid;

    use super::*;

    struct TestDataTypeProvider;

    #[expect(refining_impl_trait)]
    impl OntologyTypeProvider<DataTypeWithMetadata> for TestDataTypeProvider {
        type Value = DataTypeWithMetadata;

        async fn provide_type(&self, _: &VersionedUrl) -> Result<DataTypeWithMetadata, Report<!>> {
            unimplemented!()
        }
    }

    #[expect(refining_impl_trait)]
    impl DataTypeProvider for TestDataTypeProvider {
        async fn is_parent_of(&self, _: &VersionedUrl, _: &BaseUrl) -> Result<bool, Report<!>> {
            unimplemented!()
        }

        async fn has_children(&self, _: &VersionedUrl) -> Result<bool, Report<!>> {
            unimplemented!()
        }

        async fn has_non_abstract_parents(&self, _: &VersionedUrl) -> Result<bool, Report<!>> {
            unimplemented!()
        }

        async fn find_conversion(
            &self,
            _: &VersionedUrl,
            _: &VersionedUrl,
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
        )
        .await;
    }

    #[tokio::test]
    async fn for_entity_by_entity_id() {
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

        test_filter_representation(&Filter::for_entity_by_entity_id(entity_id), &expected).await;
    }

    #[tokio::test]
    async fn for_entity_by_entity_draft_id() {
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

        test_filter_representation(&Filter::for_entity_by_entity_id(entity_id), &expected).await;
    }

    #[tokio::test]
    async fn null_check() {
        let expected = json!({
          "notEqual": [
            { "path": ["description"] },
            null
          ]
        });

        test_filter_representation(
            &Filter::<DataTypeWithMetadata>::NotEqual(
                Some(FilterExpression::Path {
                    path: DataTypeQueryPath::Description,
                }),
                None,
            ),
            &expected,
        )
        .await;
    }
}
