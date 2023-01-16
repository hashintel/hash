use std::{borrow::Cow, fmt, str::FromStr};

use derivative::Derivative;
use error_stack::{bail, ensure, Context, IntoReport, Report, ResultExt};
use serde::Deserialize;
use type_system::uri::{BaseUri, VersionedUri};
use uuid::Uuid;

use crate::{
    identifier::{
        knowledge::EntityId,
        ontology::OntologyTypeEditionId,
        time::{ProjectedTime, Timestamp},
    },
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
    fn for_version(version: u32) -> Self {
        Self::Equal(
            Some(FilterExpression::Path(<R::QueryPath<'p>>::version())),
            Some(FilterExpression::Parameter(Parameter::SignedInteger(
                version.into(),
            ))),
        )
    }

    /// Creates a `Filter` to search for a specific ontology type of kind `R`, identified by its
    /// [`VersionedUri`].
    #[must_use]
    pub fn for_versioned_uri(versioned_uri: &'p VersionedUri) -> Self {
        Self::All(vec![
            Self::for_base_uri(versioned_uri.base_uri()),
            Self::for_version(versioned_uri.version()),
        ])
    }

    /// Creates a `Filter` to search for a specific ontology type of kind `R`, identified by its
    /// [`OntologyTypeEditionId`].
    #[must_use]
    pub fn for_ontology_type_edition_id(
        ontology_type_edition_id: &'p OntologyTypeEditionId,
    ) -> Self {
        Self::All(vec![
            Self::for_base_uri(ontology_type_edition_id.base_id()),
            Self::for_version(ontology_type_edition_id.version().inner()),
        ])
    }
}

impl<'p> Filter<'p, Entity> {
    /// Creates a `Filter` to search for a specific entities, identified by its [`EntityId`].
    #[must_use]
    pub fn for_entity_by_id(entity_id: EntityId) -> Self {
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

#[derive(Debug, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Parameter<'p> {
    Boolean(bool),
    Number(f64),
    Text(Cow<'p, str>),
    #[serde(skip)]
    Uuid(Uuid),
    #[serde(skip)]
    SignedInteger(i64),
    #[serde(skip)]
    Timestamp(Timestamp<ProjectedTime>),
}

impl Parameter<'_> {
    fn to_owned(&self) -> Parameter<'static> {
        match self {
            Parameter::Boolean(bool) => Parameter::Boolean(*bool),
            Parameter::Number(number) => Parameter::Number(*number),
            Parameter::Text(text) => Parameter::Text(Cow::Owned(text.to_string())),
            Parameter::Uuid(uuid) => Parameter::Uuid(*uuid),
            Parameter::SignedInteger(integer) => Parameter::SignedInteger(*integer),
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
            Parameter::Boolean(boolean) => boolean.to_string(),
            Parameter::Number(number) => number.to_string(),
            Parameter::Text(text) => text.to_string(),
            Parameter::Uuid(uuid) => uuid.to_string(),
            Parameter::SignedInteger(integer) => integer.to_string(),
            Parameter::Timestamp(timestamp) => timestamp.to_string(),
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
            (_, ParameterType::Any)
            | (Parameter::Boolean(_), ParameterType::Boolean)
            | (Parameter::Number(_), ParameterType::Number)
            | (Parameter::Text(_), ParameterType::Text) => {
                // no action needed, exact match
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
            (Parameter::Number(number), ParameterType::UnsignedInteger) => {
                // Postgres cannot represent unsigned integer, so we use i64 instead
                let number = number.round() as i64;
                ensure!(!number.is_negative(), ParameterConversionError {
                    actual: self.to_owned(),
                    expected: ParameterType::UnsignedInteger
                });
                *self = Parameter::SignedInteger(number);
            }
            (Parameter::Text(text), ParameterType::UnsignedInteger) if text == "latest" => {
                // Special case for checking `version == "latest"
            }
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
    fn for_ontology_type_edition_id() {
        let uri = OntologyTypeEditionId::new(
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
            &Filter::<DataTypeWithMetadata>::for_ontology_type_edition_id(&uri),
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

        test_filter_representation(&Filter::for_entity_by_id(entity_id), &expected);
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

        test_filter_representation(&Filter::for_entity_by_id(entity_id), &expected);
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
