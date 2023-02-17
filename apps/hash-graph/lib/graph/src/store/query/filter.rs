use std::{borrow::Cow, fmt, str::FromStr};

use derivative::Derivative;
use error_stack::{bail, Context, IntoReport, Report, ResultExt};
use serde::Deserialize;
use serde_json::{Number, Value};
use type_system::uri::{BaseUri, VersionedUri};
use uuid::Uuid;

use crate::{
    identifier::{knowledge::EntityId, ontology::OntologyTypeVersion, OntologyTypeVertexId},
    knowledge::{Entity, EntityQueryPath},
    store::{
        query::{OntologyQueryPath, ParameterType, QueryPath},
        Record,
    },
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
}

impl<'p, R> Filter<'p, R>
where
    R: Record<QueryPath<'p>: OntologyQueryPath>,
{
    /// Creates a `Filter` to search for a specific ontology type of kind `R`, identified by its
    /// [`BaseUri`].
    #[must_use]
    pub fn for_base_uri(base_uri: &'p BaseUri) -> Self {
        Self::Equal(
            Some(FilterExpression::Path(<R::QueryPath<'p>>::base_uri())),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                base_uri.as_str(),
            )))),
        )
    }

    /// Creates a `Filter` to search for the latest specific ontology type of kind `R`, identified
    /// by its [`BaseUri`].
    #[must_use]
    pub fn for_latest_base_uri(base_uri: &'p BaseUri) -> Self {
        Self::All(vec![
            Self::for_base_uri(base_uri),
            Self::Equal(
                Some(FilterExpression::Path(<R::QueryPath<'p>>::version())),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    "latest",
                )))),
            ),
        ])
    }

    /// Creates a `Filter` to filter by a given version.
    #[must_use]
    fn for_version(version: OntologyTypeVersion) -> Self {
        Self::Equal(
            Some(FilterExpression::Path(<R::QueryPath<'p>>::version())),
            Some(FilterExpression::Parameter(Parameter::OntologyTypeVersion(
                version,
            ))),
        )
    }

    /// Creates a `Filter` to search for a specific ontology type of kind `R`, identified by its
    /// [`VersionedUri`].
    #[must_use]
    pub fn for_versioned_uri(versioned_uri: &'p VersionedUri) -> Self {
        Self::All(vec![
            Self::for_base_uri(versioned_uri.base_uri()),
            Self::for_version(OntologyTypeVersion::new(versioned_uri.version())),
        ])
    }

    /// Creates a `Filter` to search for a specific ontology type of kind `R`, identified by its
    /// [`OntologyTypeVertexId`].
    #[must_use]
    pub fn for_ontology_type_vertex_id(ontology_type_vertex_id: &'p OntologyTypeVertexId) -> Self {
        Self::All(vec![
            Self::for_base_uri(ontology_type_vertex_id.base_id()),
            Self::for_version(ontology_type_vertex_id.version()),
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
                    entity_id.owned_by_id().as_uuid(),
                ))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Uuid)),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.entity_uuid().as_uuid(),
                ))),
            ),
        ])
    }

    /// Creates a `Filter` to search for outgoing linked entities where the specified [`EntityId`]
    /// identifies the source [`Entity`].
    #[must_use]
    pub fn for_outgoing_link_by_source_entity_id(entity_id: EntityId) -> Self {
        Self::All(vec![
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(
                    Box::new(EntityQueryPath::OwnedById),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.owned_by_id().as_uuid(),
                ))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::LeftEntity(
                    Box::new(EntityQueryPath::Uuid),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.entity_uuid().as_uuid(),
                ))),
            ),
        ])
    }

    /// Creates a `Filter` to search for incoming linked entities where the specified [`EntityId`]
    /// identifies the target [`Entity`].
    #[must_use]
    pub fn for_incoming_link_by_source_entity_id(entity_id: EntityId) -> Self {
        Self::All(vec![
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::RightEntity(
                    Box::new(EntityQueryPath::OwnedById),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.owned_by_id().as_uuid(),
                ))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::RightEntity(
                    Box::new(EntityQueryPath::Uuid),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.entity_uuid().as_uuid(),
                ))),
            ),
        ])
    }

    /// Creates a `Filter` to search for linked entities where the specified [`EntityId`] identifies
    /// the left [`Entity`].
    #[must_use]
    pub fn for_left_entity_by_entity_id(entity_id: EntityId) -> Self {
        Self::All(vec![
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::OutgoingLinks(
                    Box::new(EntityQueryPath::OwnedById),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.owned_by_id().as_uuid(),
                ))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::OutgoingLinks(
                    Box::new(EntityQueryPath::Uuid),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.entity_uuid().as_uuid(),
                ))),
            ),
        ])
    }

    /// Creates a `Filter` to search for linked entities where the specified [`EntityId`] identifies
    /// the right [`Entity`].
    #[must_use]
    pub fn for_right_entity_by_entity_id(entity_id: EntityId) -> Self {
        Self::All(vec![
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::IncomingLinks(
                    Box::new(EntityQueryPath::OwnedById),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.owned_by_id().as_uuid(),
                ))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::IncomingLinks(
                    Box::new(EntityQueryPath::Uuid),
                ))),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_id.entity_uuid().as_uuid(),
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
                *self =
                    Parameter::Number(i32::try_from(number).into_report().change_context_lazy(
                        || ParameterConversionError {
                            actual: self.to_owned(),
                            expected: ParameterType::OntologyTypeVersion,
                        },
                    )?);
            }
            (Parameter::Number(number), ParameterType::OntologyTypeVersion) => {
                *self = Parameter::OntologyTypeVersion(OntologyTypeVersion::new(
                    u32::try_from(*number)
                        .into_report()
                        .change_context_lazy(|| ParameterConversionError {
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
            (Parameter::Text(_base_uri), ParameterType::BaseUri) => {
                // TODO: validate base uri
                //   see https://app.asana.com/0/1202805690238892/1203225514907875/f
            }
            (Parameter::Text(_versioned_uri), ParameterType::VersionedUri) => {
                // TODO: validate versioned uri
                //   see https://app.asana.com/0/1202805690238892/1203225514907875/f
            }
            (Parameter::Text(text), ParameterType::Uuid) => {
                *self = Parameter::Uuid(Uuid::from_str(&*text).into_report().change_context_lazy(
                    || ParameterConversionError {
                        actual: self.to_owned(),
                        expected: ParameterType::Uuid,
                    },
                )?);
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
    use serde_json::json;
    use type_system::uri::BaseUri;

    use super::*;
    use crate::{
        identifier::{account::AccountId, ontology::OntologyTypeVersion},
        knowledge::EntityUuid,
        ontology::{DataTypeQueryPath, DataTypeWithMetadata},
        provenance::OwnedById,
    };

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
    fn for_versioned_uri() {
        let uri = VersionedUri::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
            )
            .expect("invalid base uri"),
            1,
        );

        let expected = json! {{
          "all": [
            { "equal": [
              { "path": ["baseUri"] },
              { "parameter": uri.base_uri() }
            ]},
            { "equal": [
              { "path": ["version"] },
              { "parameter": uri.version() }
            ]}
          ]
        }};

        test_filter_representation(
            &Filter::<DataTypeWithMetadata>::for_versioned_uri(&uri),
            &expected,
        );
    }

    #[test]
    fn for_ontology_type_version_id() {
        let uri = OntologyTypeVertexId::new(
            BaseUri::new(
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/".to_owned(),
            )
            .expect("invalid base uri"),
            OntologyTypeVersion::new(1),
        );

        let expected = json! {{
          "all": [
            { "equal": [
              { "path": ["baseUri"] },
              { "parameter": uri.base_id() }
            ]},
            { "equal": [
              { "path": ["version"] },
              { "parameter": uri.version() }
            ]}
          ]
        }};

        test_filter_representation(
            &Filter::<DataTypeWithMetadata>::for_ontology_type_vertex_id(&uri),
            &expected,
        );
    }

    #[test]
    fn for_entity_by_entity_id() {
        let entity_id = EntityId::new(
            OwnedById::new(AccountId::new(Uuid::new_v4())),
            EntityUuid::new(Uuid::new_v4()),
        );

        let expected = json! {{
          "all": [
            { "equal": [
              { "path": ["ownedById"] },
              { "parameter": entity_id.owned_by_id() }
            ]},
            { "equal": [
              { "path": ["uuid"] },
              { "parameter": entity_id.entity_uuid() }
            ]}
          ]
        }};

        test_filter_representation(&Filter::for_entity_by_entity_id(entity_id), &expected);
    }

    #[test]
    fn for_entity_by_id() {
        let entity_id = EntityId::new(
            OwnedById::new(AccountId::new(Uuid::new_v4())),
            EntityUuid::new(Uuid::new_v4()),
        );

        let expected = json! {{
          "all": [
            { "equal": [
              { "path": ["ownedById"] },
              { "parameter": entity_id.owned_by_id() }
            ]},
            { "equal": [
              { "path": ["uuid"] },
              { "parameter": entity_id.entity_uuid() }
            ]}
          ]
        }};

        test_filter_representation(&Filter::for_entity_by_entity_id(entity_id), &expected);
    }

    #[test]
    fn for_outgoing_link_by_source_entity_id() {
        let entity_id = EntityId::new(
            OwnedById::new(AccountId::new(Uuid::new_v4())),
            EntityUuid::new(Uuid::new_v4()),
        );

        let expected = json! {{
          "all": [
            { "equal": [
              { "path": ["leftEntity", "ownedById"] },
              { "parameter": entity_id.owned_by_id() }
            ]},
            { "equal": [
              { "path": ["leftEntity", "uuid"] },
              { "parameter": entity_id.entity_uuid() }
            ]}
          ]
        }};

        test_filter_representation(
            &Filter::for_outgoing_link_by_source_entity_id(entity_id),
            &expected,
        );
    }

    #[test]
    fn for_left_entity_by_entity_id() {
        let entity_id = EntityId::new(
            OwnedById::new(AccountId::new(Uuid::new_v4())),
            EntityUuid::new(Uuid::new_v4()),
        );

        let expected = json! {{
          "all": [
            { "equal": [
              { "path": ["outgoingLinks", "ownedById"] },
              { "parameter": entity_id.owned_by_id() }
            ]},
            { "equal": [
              { "path": ["outgoingLinks", "uuid"] },
              { "parameter": entity_id.entity_uuid() }
            ]}
          ]
        }};

        test_filter_representation(&Filter::for_left_entity_by_entity_id(entity_id), &expected);
    }

    #[test]
    fn for_right_entity_by_entity_id() {
        let entity_id = EntityId::new(
            OwnedById::new(AccountId::new(Uuid::new_v4())),
            EntityUuid::new(Uuid::new_v4()),
        );

        let expected = json! {{
          "all": [
            { "equal": [
              { "path": ["incomingLinks", "ownedById"] },
              { "parameter": entity_id.owned_by_id() }
            ]},
            { "equal": [
              { "path": ["incomingLinks", "uuid"] },
              { "parameter": entity_id.entity_uuid() }
            ]}
          ]
        }};

        test_filter_representation(&Filter::for_right_entity_by_entity_id(entity_id), &expected);
    }

    #[test]
    fn null_check() {
        let expected = json! {{
          "notEqual": [
            { "path": ["description"] },
            null
          ]
        }};

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
