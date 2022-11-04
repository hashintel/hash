use std::{
    borrow::Cow,
    fmt,
    fmt::{Debug, Display, Formatter},
    str::FromStr,
};

use error_stack::{bail, ensure, Context, IntoReport, Report, ResultExt};
use serde::Deserialize;
use type_system::uri::VersionedUri;
use uuid::Uuid;

use crate::{
    identifier::{EntityIdentifier, EntityVersion},
    knowledge::{Entity, EntityId, EntityQueryPath, PersistedEntityIdentifier},
    store::query::{OntologyPath, ParameterType, QueryRecord, RecordPath},
};

/// A set of conditions used for queries.
#[derive(Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound = "'de: 'q, T::Path<'q>: Deserialize<'de>"
)]
pub enum Filter<'q, T: QueryRecord> {
    All(Vec<Self>),
    Any(Vec<Self>),
    Not(Box<Self>),
    Equal(
        Option<FilterExpression<'q, T>>,
        Option<FilterExpression<'q, T>>,
    ),
    NotEqual(
        Option<FilterExpression<'q, T>>,
        Option<FilterExpression<'q, T>>,
    ),
}

impl<'q, T> Filter<'q, T>
where
    T: QueryRecord,
    T::Path<'q>: OntologyPath,
{
    /// Creates a `Filter` to search for all ontology types of kind `T` at their latest version.
    #[must_use]
    pub fn for_latest_version() -> Self {
        Self::Equal(
            Some(FilterExpression::Path(<T::Path<'q>>::version())),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "latest",
            )))),
        )
    }

    /// Creates a `Filter` to search for a specific ontology type of kind `T`, identified by its
    /// [`VersionedUri`].
    #[must_use]
    pub fn for_versioned_uri(versioned_uri: &'q VersionedUri) -> Self {
        Self::All(vec![
            Self::Equal(
                Some(FilterExpression::Path(<T::Path<'q>>::base_uri())),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                    versioned_uri.base_uri().as_str(),
                )))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(<T::Path<'q>>::version())),
                Some(FilterExpression::Parameter(Parameter::SignedInteger(
                    versioned_uri.version().into(),
                ))),
            ),
        ])
    }
}

impl<'q> Filter<'q, Entity> {
    /// Creates a `Filter` to search for all entities at their latest version.
    #[must_use]
    pub const fn for_all_latest_entities() -> Self {
        Self::Equal(
            Some(FilterExpression::Path(EntityQueryPath::Version)),
            Some(FilterExpression::Parameter(Parameter::Text(Cow::Borrowed(
                "latest",
            )))),
        )
    }

    /// Creates a `Filter` to search for a specific entities at their latest version, identified by
    /// its [`EntityId`].
    #[must_use]
    pub fn for_latest_entity_by_entity_id(entity_identifier: EntityIdentifier) -> Self {
        Self::All(vec![
            Self::for_all_latest_entities(),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::OwnedById)),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_identifier.owned_by_id().as_uuid(),
                ))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Id)),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_identifier.entity_id().as_uuid(),
                ))),
            ),
        ])
    }

    /// Creates a `Filter` to search for a specific entity at specific version, identified by
    /// its [`EntityId`] and its [`EntityVersion`].
    #[must_use]
    pub fn for_entity_by_entity_id_and_entity_version(
        entity_edition_identifier: &PersistedEntityIdentifier,
    ) -> Self {
        Self::All(vec![
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::OwnedById)),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_edition_identifier
                        .entity_identifier()
                        .owned_by_id()
                        .as_uuid(),
                ))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Id)),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    entity_edition_identifier
                        .entity_identifier()
                        .entity_id()
                        .as_uuid(),
                ))),
            ),
            Self::Equal(
                Some(FilterExpression::Path(EntityQueryPath::Version)),
                Some(FilterExpression::Parameter(Parameter::Text(Cow::Owned(
                    entity_edition_identifier.version().to_string(),
                )))),
            ),
        ])
    }
}

impl<'q, T: QueryRecord> Filter<'q, T>
where
    T::Path<'q>: Display,
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

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> Debug for Filter<'q, T>
where
    T: QueryRecord<Path<'q>: Debug>,
{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::All(filters) => f.debug_tuple("All").field(filters).finish(),
            Self::Any(filters) => f.debug_tuple("Any").field(filters).finish(),
            Self::Not(filter) => f.debug_tuple("Not").field(filter).finish(),
            Self::Equal(lhs, rhs) => f.debug_tuple("Equal").field(lhs).field(rhs).finish(),
            Self::NotEqual(lhs, rhs) => f.debug_tuple("NotEqual").field(lhs).field(rhs).finish(),
        }
    }
}

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> PartialEq for Filter<'q, T>
where
    T: QueryRecord<Path<'q>: PartialEq>,
{
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::All(lhs), Self::All(rhs)) | (Self::Any(lhs), Self::Any(rhs)) => lhs == rhs,
            (Self::Not(lhs), Self::Not(rhs)) => lhs == rhs,
            (Self::Equal(lhs_1, lhs_2), Self::Equal(rhs_1, rhs_2))
            | (Self::NotEqual(lhs_1, lhs_2), Self::NotEqual(rhs_1, rhs_2)) => {
                lhs_1 == rhs_1 && lhs_2 == rhs_2
            }
            _ => false,
        }
    }
}

/// A leaf value in a [`Filter`].
// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
#[derive(Deserialize)]
#[serde(
    rename_all = "camelCase",
    bound = "'de: 'q, T::Path<'q>: Deserialize<'de>"
)]
pub enum FilterExpression<'q, T: QueryRecord> {
    Path(T::Path<'q>),
    Parameter(Parameter<'q>),
}

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> Debug for FilterExpression<'q, T>
where
    T: QueryRecord<Path<'q>: Debug>,
{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Path(path) => f.debug_tuple("Path").field(path).finish(),
            Self::Parameter(parameter) => f.debug_tuple("Parameter").field(parameter).finish(),
        }
    }
}

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> PartialEq for FilterExpression<'q, T>
where
    T: QueryRecord<Path<'q>: PartialEq>,
{
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Path(lhs), Self::Path(rhs)) => lhs == rhs,
            (Self::Parameter(lhs), Self::Parameter(rhs)) => lhs == rhs,
            _ => false,
        }
    }
}

#[derive(Debug, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Parameter<'q> {
    Boolean(bool),
    Number(f64),
    Text(Cow<'q, str>),
    #[serde(skip)]
    Uuid(Uuid),
    #[serde(skip)]
    SignedInteger(i64),
}

impl Parameter<'_> {
    fn to_owned(&self) -> Parameter<'static> {
        match self {
            Parameter::Boolean(bool) => Parameter::Boolean(*bool),
            Parameter::Number(number) => Parameter::Number(*number),
            Parameter::Text(text) => Parameter::Text(Cow::Owned(text.to_string())),
            Parameter::Uuid(uuid) => Parameter::Uuid(*uuid),
            Parameter::SignedInteger(integer) => Parameter::SignedInteger(*integer),
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
        write!(
            fmt,
            "could not convert `{}` to {}",
            self.actual, self.expected
        )
    }
}

impl Context for ParameterConversionError {}

impl Parameter<'_> {
    #[expect(clippy::match_same_arms, reason = "multiple empty bodies due to TODOs")]
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
            (_, ParameterType::Timestamp) => {
                // TODO: validate timestamps
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

impl fmt::Display for Parameter<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Parameter::Boolean(boolean) => fmt::Display::fmt(boolean, fmt),
            Parameter::Number(number) => fmt::Display::fmt(number, fmt),
            Parameter::Text(text) => fmt::Display::fmt(text, fmt),
            Parameter::Uuid(uuid) => fmt::Display::fmt(uuid, fmt),
            Parameter::SignedInteger(integer) => fmt::Display::fmt(integer, fmt),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use type_system::DataType;

    use super::*;
    use crate::ontology::DataTypeQueryPath;

    #[test]
    fn deserialize() {
        let latest_version_filter = json! {{
          "equal": [
            { "path": ["version"] },
            { "parameter": "latest" }
          ]
        }};
        assert_eq!(
            Filter::deserialize(&latest_version_filter).expect("could not deserialize filter"),
            Filter::Equal(
                Some(FilterExpression::<DataType>::Path(
                    DataTypeQueryPath::Version
                )),
                Some(FilterExpression::<DataType>::Parameter(Parameter::Text(
                    Cow::Borrowed("latest")
                ))),
            )
        );

        let specific_version_filter = json! {{
          "all": [
            { "equal": [
              { "path": ["baseUri"] },
              { "parameter": "https://blockprotocol.org/@blockprotocol/types/data-type/text/" }
            ]},
            { "equal": [
              { "path": ["version"] },
              { "parameter": 1 }
            ]}
          ]
        }};
        assert_eq!(
            Filter::deserialize(&specific_version_filter).expect("could not deserialize filter"),
            Filter::All(vec![
                Filter::Equal(
                    Some(FilterExpression::<DataType>::Path(
                        DataTypeQueryPath::BaseUri
                    )),
                    Some(FilterExpression::<DataType>::Parameter(Parameter::Text(
                        Cow::Borrowed(
                            "https://blockprotocol.org/@blockprotocol/types/data-type/text/"
                        )
                    ))),
                ),
                Filter::Equal(
                    Some(FilterExpression::<DataType>::Path(
                        DataTypeQueryPath::Version
                    )),
                    Some(FilterExpression::<DataType>::Parameter(Parameter::Number(
                        1.0
                    ))),
                ),
            ])
        );

        let null_check = json! {{
          "notEqual": [
            { "path": ["description"] },
            null
          ]
        }};
        assert_eq!(
            Filter::deserialize(&null_check).expect("could not deserialize filter"),
            Filter::NotEqual(
                Some(FilterExpression::<DataType>::Path(
                    DataTypeQueryPath::Description
                )),
                None,
            )
        );
    }
}
