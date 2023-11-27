use std::{borrow::Cow, fmt, str::FromStr};

use derivative::Derivative;
use error_stack::{bail, Context, Report, ResultExt};
use graph_types::{
    knowledge::entity::{Entity, EntityId},
    ontology::OntologyTypeVersion,
};
use serde::Deserialize;
use serde_json::{Number, Value};
use temporal_versioning::Timestamp;
use type_system::url::{BaseUrl, VersionedUrl};
use uuid::Uuid;

use crate::{
    knowledge::EntityQueryPath,
    store::{
        query::{OntologyQueryPath, ParameterType, QueryPath},
        Record,
    },
    subgraph::identifier::VertexId,
};

/// A set of conditions used for queries.
#[derive(Derivative, Deserialize)]
#[derivative(
    Debug(bound = "R::QueryPath<'p>: fmt::Debug"),
    PartialEq(bound = "R::QueryPath<'p>: PartialEq")
)]
#[serde(
    rename_all = "camelCase",
    bound = "'de: 'p, R::QueryPath<'p>: Deserialize<'de>"
)]
pub enum Filter<'p, R: Record + ?Sized> {
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
    #[serde(skip)]
    In(FilterExpression<'p, R>, ParameterList<'p>),
    StartsWith(FilterExpression<'p, R>, FilterExpression<'p, R>),
    EndsWith(FilterExpression<'p, R>, FilterExpression<'p, R>),
    ContainsSegment(FilterExpression<'p, R>, FilterExpression<'p, R>),
}

impl<'p, R> Filter<'p, R>
where
    R: Record<QueryPath<'p>: OntologyQueryPath>,
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
                    OntologyTypeVersion::new(versioned_url.version),
                ))),
            ),
        ])
    }
}

impl<'p> Filter<'p, Entity> {
    /// Creates a `Filter` to search for a specific entities, identified by its [`EntityId`].
    #[must_use]
    pub fn for_entity_by_entity_id(entity_id: EntityId) -> Self {
        Self::All(vec![
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::OwnedById)),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.owned_by_id.into_uuid(),
                ))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Uuid)),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.entity_uuid.into_uuid(),
                ))),
            ),
        ])
    }
}

impl<'p, R: Record> Filter<'p, R>
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
            Self::In(lhs, rhs) => {
                if let FilterExpression::Parameter(parameter) = lhs {
                    match rhs {
                        ParameterList::Uuid(_) => {
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
#[derive(Derivative, Deserialize)]
#[derivative(
    Debug(bound = "R::QueryPath<'p>: fmt::Debug"),
    PartialEq(bound = "R::QueryPath<'p>: PartialEq")
)]
#[serde(
    rename_all = "camelCase",
    bound = "'de: 'p, R::QueryPath<'p>: Deserialize<'de>"
)]
pub enum FilterExpression<'p, R: Record + ?Sized> {
    Path(R::QueryPath<'p>),
    Parameter(Parameter<'p>),
}

#[derive(Debug, PartialEq, Eq, Deserialize)]
#[serde(untagged)]
pub enum Parameter<'p> {
    Boolean(bool),
    Number(i32),
    Text(Cow<'p, str>),
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
    Uuid(&'p [Uuid]),
}

impl Parameter<'_> {
    fn to_owned(&self) -> Parameter<'static> {
        match self {
            Parameter::Boolean(bool) => Parameter::Boolean(*bool),
            Parameter::Number(number) => Parameter::Number(*number),
            Parameter::Text(text) => Parameter::Text(Cow::Owned(text.to_string())),
            Parameter::Any(value) => Parameter::Any(value.clone()),
            Parameter::Uuid(uuid) => Parameter::Uuid(*uuid),
            Parameter::OntologyTypeVersion(version) => Parameter::OntologyTypeVersion(*version),
            Parameter::Timestamp(timestamp) => Parameter::Timestamp(*timestamp),
        }
    }
}

#[derive(Debug)]
#[must_use]
pub struct ParameterConversionError {
    actual: Parameter<'static>,
    expected: ParameterType,
}

impl fmt::Display for ParameterConversionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let actual = match &self.actual {
            Parameter::Any(Value::Null) => "null".to_owned(),
            Parameter::Boolean(boolean) | Parameter::Any(Value::Bool(boolean)) => {
                boolean.to_string()
            }
            Parameter::Number(number) => number.to_string(),
            Parameter::Any(Value::Number(number)) => number.to_string(),
            Parameter::Text(text) => text.to_string(),
            Parameter::Any(Value::String(string)) => string.clone(),
            Parameter::Uuid(uuid) => uuid.to_string(),
            Parameter::OntologyTypeVersion(version) => version.inner().to_string(),
            Parameter::Timestamp(timestamp) => timestamp.to_string(),
            Parameter::Any(Value::Object(_)) => "object".to_owned(),
            Parameter::Any(Value::Array(_)) => "array".to_owned(),
        };

        write!(fmt, "could not convert {actual} to {}", self.expected)
    }
}

impl Context for ParameterConversionError {}

impl Parameter<'_> {
    fn convert_to_parameter_type(
        &mut self,
        expected: ParameterType,
    ) -> Result<(), Report<ParameterConversionError>> {
        match (&mut *self, expected) {
            // identity
            (Parameter::Boolean(_), ParameterType::Boolean)
            | (Parameter::Number(_), ParameterType::Number)
            | (Parameter::Text(_), ParameterType::Text)
            | (Parameter::Any(_), ParameterType::Any) => {}

            // Boolean conversions
            (Parameter::Boolean(bool), ParameterType::Any) => {
                *self = Parameter::Any(Value::Bool(*bool));
            }
            (Parameter::Any(Value::Bool(bool)), ParameterType::Boolean) => {
                *self = Parameter::Boolean(*bool);
            }

            // Number conversions
            (Parameter::Number(number), ParameterType::Any) => {
                *self = Parameter::Any(Value::Number(Number::from(*number)));
            }
            (Parameter::Any(Value::Number(number)), ParameterType::Number) => {
                let number = number.as_i64().ok_or_else(|| {
                    Report::new(ParameterConversionError {
                        actual: self.to_owned(),
                        expected,
                    })
                })?;
                *self = Parameter::Number(i32::try_from(number).change_context_lazy(|| {
                    ParameterConversionError {
                        actual: self.to_owned(),
                        expected: ParameterType::OntologyTypeVersion,
                    }
                })?);
            }
            (Parameter::Number(number), ParameterType::OntologyTypeVersion) => {
                *self = Parameter::OntologyTypeVersion(OntologyTypeVersion::new(
                    u32::try_from(*number).change_context_lazy(|| ParameterConversionError {
                        actual: self.to_owned(),
                        expected: ParameterType::OntologyTypeVersion,
                    })?,
                ));
            }
            (Parameter::Text(text), ParameterType::OntologyTypeVersion) if text == "latest" => {
                // Special case for checking `version == "latest"
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
                //   see https://app.asana.com/0/1202805690238892/1203225514907875/f
            }
            (Parameter::Text(_versioned_url), ParameterType::VersionedUrl) => {
                // TODO: validate versioned url
                //   see https://app.asana.com/0/1202805690238892/1203225514907875/f
            }
            (Parameter::Text(text), ParameterType::Uuid) => {
                *self = Parameter::Uuid(Uuid::from_str(&*text).change_context_lazy(|| {
                    ParameterConversionError {
                        actual: self.to_owned(),
                        expected: ParameterType::Uuid,
                    }
                })?);
            }

            // Fallback
            (actual, expected) => {
                bail!(ParameterConversionError {
                    actual: actual.to_owned(),
                    expected
                });
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use graph_types::{
        knowledge::entity::{EntityId, EntityUuid},
        ontology::DataTypeWithMetadata,
        provenance::OwnedById,
    };
    use serde_json::json;
    use type_system::url::BaseUrl;

    use super::*;
    use crate::ontology::DataTypeQueryPath;

    fn test_filter_representation<'de, R>(actual: &Filter<'de, R>, expected: &'de serde_json::Value)
    where
        R: Record<QueryPath<'de>: fmt::Debug + fmt::Display + PartialEq + Deserialize<'de>>,
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
            version: 1,
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
