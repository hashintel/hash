use alloc::borrow::Cow;
use core::{borrow::Borrow, fmt, mem, str::FromStr};

use derive_where::derive_where;
use error_stack::{bail, Context, Report, ResultExt};
use graph_types::{
    knowledge::entity::{Entity, EntityEditionId, EntityId},
    ontology::{DataTypeId, DataTypeProvider, DataTypeWithMetadata, EntityTypeId, PropertyTypeId},
    Embedding,
};
use serde::Deserialize;
use serde_json::{Number, Value};
use temporal_versioning::Timestamp;
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};
use uuid::Uuid;

use crate::{
    knowledge::EntityQueryPath,
    ontology::{DataTypeQueryPath, EntityTypeQueryPath},
    store::{
        query::{OntologyQueryPath, ParameterType, QueryPath},
        QueryRecord, SubgraphRecord,
    },
    subgraph::{
        edges::{EdgeDirection, OntologyEdgeKind, SharedEdgeKind},
        identifier::VertexId,
    },
};

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
    R: SubgraphRecord<QueryPath<'p>: OntologyQueryPath>,
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
    pub(crate) async fn convert_parameters<P>(
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

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Parameter<'p> {
    Boolean(bool),
    I32(i32),
    F64(f64),
    Text(Cow<'p, str>),
    Vector(Embedding<'p>),
    Any(Value),
    #[serde(skip)]
    Uuid(Uuid),
    #[serde(skip)]
    OntologyTypeVersion(OntologyTypeVersion),
    #[serde(skip)]
    Timestamp(Timestamp<()>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ParameterList<'p> {
    DataTypeIds(&'p [DataTypeId]),
    PropertyTypeIds(&'p [PropertyTypeId]),
    EntityTypeIds(&'p [EntityTypeId]),
    EntityEditionIds(&'p [EntityEditionId]),
}

impl<'p> Parameter<'p> {
    #[must_use]
    pub fn to_owned(&self) -> Parameter<'static> {
        match self {
            Parameter::Boolean(bool) => Parameter::Boolean(*bool),
            Parameter::I32(number) => Parameter::I32(*number),
            Parameter::F64(number) => Parameter::F64(*number),
            Parameter::Text(text) => Parameter::Text(Cow::Owned(text.to_string())),
            Parameter::Vector(vector) => Parameter::Vector(vector.to_owned()),
            Parameter::Any(value) => Parameter::Any(value.clone()),
            Parameter::Uuid(uuid) => Parameter::Uuid(*uuid),
            Parameter::OntologyTypeVersion(version) => Parameter::OntologyTypeVersion(*version),
            Parameter::Timestamp(timestamp) => Parameter::Timestamp(*timestamp),
        }
    }

    #[must_use]
    pub fn parameter_type(&self) -> ParameterType {
        match self {
            Parameter::Boolean(_) => ParameterType::Boolean,
            Parameter::I32(_) => ParameterType::I32,
            Parameter::F64(_) => ParameterType::F64,
            Parameter::Text(_) => ParameterType::Text,
            Parameter::Vector(_) => ParameterType::Vector(Box::new(ParameterType::F64)),
            Parameter::Any(_) => ParameterType::Any,
            Parameter::Uuid(_) => ParameterType::Uuid,
            Parameter::OntologyTypeVersion(_) => ParameterType::OntologyTypeVersion,
            Parameter::Timestamp(_) => ParameterType::Timestamp,
        }
    }
}

#[derive(Debug)]
pub enum ActualParameterType {
    Parameter(Parameter<'static>),
    Value(serde_json::Value),
}

impl From<Parameter<'static>> for ActualParameterType {
    fn from(value: Parameter<'static>) -> Self {
        Self::Parameter(value)
    }
}

impl From<serde_json::Value> for ActualParameterType {
    fn from(value: serde_json::Value) -> Self {
        Self::Value(value)
    }
}

#[derive(Debug)]
pub enum ParameterConversionError {
    NoConversionFound {
        from: VersionedUrl,
        to: VersionedUrl,
    },
    InvalidParameterType {
        actual: ActualParameterType,
        expected: ParameterType,
    },
}

impl fmt::Display for ParameterConversionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidParameterType { actual, expected } => {
                let actual = match actual {
                    ActualParameterType::Parameter(parameter) => match parameter {
                        Parameter::Any(Value::Null) => "null".to_owned(),
                        Parameter::Boolean(boolean) | Parameter::Any(Value::Bool(boolean)) => {
                            boolean.to_string()
                        }
                        Parameter::I32(number) => number.to_string(),
                        Parameter::F64(number) => number.to_string(),
                        Parameter::Any(Value::Number(number)) => number.to_string(),
                        Parameter::Text(text) => text.to_string(),
                        Parameter::Vector(_) => "vector".to_owned(),
                        Parameter::Any(Value::String(string)) => string.clone(),
                        Parameter::Uuid(uuid) => uuid.to_string(),
                        Parameter::OntologyTypeVersion(version) => version.inner().to_string(),
                        Parameter::Timestamp(timestamp) => timestamp.to_string(),
                        Parameter::Any(Value::Object(_)) => "object".to_owned(),
                        Parameter::Any(Value::Array(_)) => "array".to_owned(),
                    },
                    ActualParameterType::Value(value) => match value {
                        Value::Null => "null".to_owned(),
                        Value::Bool(boolean) => boolean.to_string(),
                        Value::Number(number) => number.to_string(),
                        Value::String(string) => string.clone(),
                        Value::Array(_) => "array".to_owned(),
                        Value::Object(_) => "object".to_owned(),
                    },
                };

                write!(fmt, "could not convert {actual} to {expected}")
            }
            Self::NoConversionFound { from, to } => {
                write!(fmt, "no conversion found from `{from}` to `{to}`")
            }
        }
    }
}

impl Context for ParameterConversionError {}

impl Parameter<'_> {
    #[expect(
        clippy::too_many_lines,
        reason = "This is one big match statement. Structural queries has to be changed in the \
                  near future so we keep the structure as it is."
    )]
    fn convert_to_parameter_type(
        &mut self,
        expected: ParameterType,
    ) -> Result<(), Report<ParameterConversionError>> {
        match (&mut *self, &expected) {
            // identity
            (actual, expected) if actual.parameter_type() == *expected => {}

            // Boolean conversions
            (Parameter::Boolean(bool), ParameterType::Any) => {
                *self = Parameter::Any(Value::Bool(*bool));
            }
            (Parameter::Any(Value::Bool(bool)), ParameterType::Boolean) => {
                *self = Parameter::Boolean(*bool);
            }

            // Integral conversions
            (Parameter::I32(number), ParameterType::Any) => {
                *self = Parameter::Any(Value::Number(Number::from(*number)));
            }
            (Parameter::Any(Value::Number(number)), ParameterType::I32) => {
                let number = number.as_i64().ok_or_else(|| {
                    Report::new(ParameterConversionError::InvalidParameterType {
                        actual: self.to_owned().into(),
                        expected,
                    })
                })?;
                *self = Parameter::I32(i32::try_from(number).change_context_lazy(|| {
                    ParameterConversionError::InvalidParameterType {
                        actual: self.to_owned().into(),
                        expected: ParameterType::OntologyTypeVersion,
                    }
                })?);
            }
            (Parameter::I32(number), ParameterType::OntologyTypeVersion) => {
                *self = Parameter::OntologyTypeVersion(OntologyTypeVersion::new(
                    u32::try_from(*number).change_context_lazy(|| {
                        ParameterConversionError::InvalidParameterType {
                            actual: self.to_owned().into(),
                            expected: ParameterType::OntologyTypeVersion,
                        }
                    })?,
                ));
            }
            (Parameter::Text(text), ParameterType::OntologyTypeVersion) if text == "latest" => {
                // Special case for checking `version == "latest"
            }

            // Floating point conversions
            (Parameter::F64(number), ParameterType::Any) => {
                *self = Parameter::Any(Value::Number(Number::from_f64(*number).ok_or_else(
                    || {
                        Report::new(ParameterConversionError::InvalidParameterType {
                            actual: self.to_owned().into(),
                            expected,
                        })
                    },
                )?));
            }
            (Parameter::Any(Value::Number(number)), ParameterType::F64) => {
                *self = Parameter::F64(number.as_f64().ok_or_else(|| {
                    Report::new(ParameterConversionError::InvalidParameterType {
                        actual: self.to_owned().into(),
                        expected,
                    })
                })?);
            }

            // Text conversions
            (Parameter::Text(text), ParameterType::Any) => {
                *self = Parameter::Any(Value::String((*text).to_string()));
            }
            (Parameter::Any(Value::String(string)), ParameterType::Text) => {
                *self = Parameter::Text(Cow::Owned(string.clone()));
            }
            (Parameter::Text(_base_url), ParameterType::BaseUrl) => {
                // TODO: validate base url
                //   see https://linear.app/hash/issue/H-3016
            }
            (Parameter::Text(_versioned_url), ParameterType::VersionedUrl) => {
                // TODO: validate versioned url
                //   see https://linear.app/hash/issue/H-3016
            }
            (Parameter::Text(text), ParameterType::Uuid) => {
                *self = Parameter::Uuid(Uuid::from_str(&*text).change_context_lazy(|| {
                    ParameterConversionError::InvalidParameterType {
                        actual: self.to_owned().into(),
                        expected: ParameterType::Uuid,
                    }
                })?);
            }

            // Vector conversions
            (Parameter::Vector(vector), ParameterType::Any) => {
                *self = Parameter::Any(Value::Array(
                    vector
                        .iter()
                        .map(|value| {
                            Number::from_f64(f64::from(value))
                                .ok_or_else(|| {
                                    Report::new(ParameterConversionError::InvalidParameterType {
                                        actual: Parameter::Vector(vector.to_owned()).into(),
                                        expected: expected.clone(),
                                    })
                                })
                                .map(Value::Number)
                        })
                        .collect::<Result<_, _>>()?,
                ));
            }
            (Parameter::Any(Value::Array(array)), ParameterType::Vector(rhs))
                if **rhs == ParameterType::F64 =>
            {
                *self = Parameter::Vector(
                    mem::take(array)
                        .into_iter()
                        .map(|value| {
                            #[expect(
                                clippy::cast_possible_truncation,
                                reason = "truncation is expected"
                            )]
                            value
                                .as_f64()
                                .ok_or_else(|| {
                                    Report::new(ParameterConversionError::InvalidParameterType {
                                        actual: self.to_owned().into(),
                                        expected: expected.clone(),
                                    })
                                })
                                .map(|value| value as f32)
                        })
                        .collect::<Result<_, _>>()?,
                );
            }

            // Fallback
            (actual, expected) => {
                bail!(ParameterConversionError::InvalidParameterType {
                    actual: actual.to_owned().into(),
                    expected: expected.clone(),
                });
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

    use super::*;
    use crate::ontology::DataTypeQueryPath;

    struct TestDataTypeProvider;

    #[expect(refining_impl_trait)]
    impl OntologyTypeProvider<DataTypeWithMetadata> for TestDataTypeProvider {
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
