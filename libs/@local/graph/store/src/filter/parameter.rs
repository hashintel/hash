use alloc::borrow::Cow;
use core::{error::Error, fmt, mem, str::FromStr as _};

use derive_where::derive_where;
use error_stack::{Report, ResultExt as _, bail};
use hash_codec::numeric::Real;
use hash_graph_temporal_versioning::Timestamp;
use hash_graph_types::Embedding;
use serde::Deserialize;
use type_system::{
    knowledge::{
        PropertyValue,
        entity::id::{EntityEditionId, EntityUuid},
    },
    ontology::{
        data_type::DataTypeUuid,
        entity_type::EntityTypeUuid,
        id::{OntologyTypeVersion, VersionedUrl},
        property_type::PropertyTypeUuid,
    },
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::filter::QueryRecord;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Parameter<'p> {
    Boolean(bool),
    Decimal(Real),
    Text(Cow<'p, str>),
    Vector(Embedding<'p>),
    Any(PropertyValue),
    #[serde(skip)]
    Uuid(#[serde(with = "hash_codec::serde::valid_uuid")] Uuid),
    #[serde(skip)]
    OntologyTypeVersion(Cow<'p, OntologyTypeVersion>),
    #[serde(skip)]
    Timestamp(Timestamp<()>),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ParameterType {
    Boolean,
    Integer,
    Decimal,
    OntologyTypeVersion,
    Text,
    Vector(Box<Self>),
    Uuid,
    BaseUrl,
    VersionedUrl,
    TimeInterval,
    Timestamp,
    Object,
    Any,
}

impl fmt::Display for ParameterType {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Boolean => fmt.write_str("boolean"),
            Self::Integer => fmt.write_str("signed 32 bit integral number"),
            Self::Decimal => fmt.write_str("64 bit floating point number"),
            Self::OntologyTypeVersion => fmt.write_str("ontology type version"),
            Self::Text => fmt.write_str("text"),
            Self::Vector(inner) => write!(fmt, "{inner}[]"),
            Self::Uuid => fmt.write_str("UUID"),
            Self::BaseUrl => fmt.write_str("base URL"),
            Self::VersionedUrl => fmt.write_str("versioned URL"),
            Self::TimeInterval => fmt.write_str("time interval"),
            Self::Timestamp => fmt.write_str("timestamp"),
            Self::Object => fmt.write_str("object"),
            Self::Any => fmt.write_str("any"),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ParameterList<'p> {
    DataTypeIds(&'p [DataTypeUuid]),
    PropertyTypeIds(&'p [PropertyTypeUuid]),
    EntityTypeIds(&'p [EntityTypeUuid]),
    EntityEditionIds(&'p [EntityEditionId]),
    EntityUuids(&'p [EntityUuid]),
    WebIds(&'p [WebId]),
}

/// A leaf value in a [`Filter`].
#[derive_where(Debug, Clone, PartialEq, Eq; R::QueryPath<'p>)]
pub enum FilterExpressionList<'p, R: QueryRecord> {
    Path { path: R::QueryPath<'p> },
    ParameterList { parameters: ParameterList<'p> },
}

impl Parameter<'_> {
    #[must_use]
    pub fn to_owned(&self) -> Parameter<'static> {
        match self {
            Parameter::Boolean(bool) => Parameter::Boolean(*bool),
            Parameter::Decimal(number) => Parameter::Decimal(number.to_owned()),
            Parameter::Text(text) => Parameter::Text(Cow::Owned(text.clone().into_owned())),
            Parameter::Vector(vector) => Parameter::Vector(vector.to_owned()),
            Parameter::Any(value) => Parameter::Any(value.clone()),
            Parameter::Uuid(uuid) => Parameter::Uuid(*uuid),
            Parameter::OntologyTypeVersion(version) => {
                Parameter::OntologyTypeVersion(Cow::Owned(version.clone().into_owned()))
            }
            Parameter::Timestamp(timestamp) => Parameter::Timestamp(*timestamp),
        }
    }

    #[must_use]
    pub fn parameter_type(&self) -> ParameterType {
        match self {
            Parameter::Boolean(_) => ParameterType::Boolean,
            Parameter::Decimal(_) => ParameterType::Decimal,
            Parameter::Text(_) => ParameterType::Text,
            Parameter::Vector(_) => ParameterType::Vector(Box::new(ParameterType::Decimal)),
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
    Value(PropertyValue),
}

impl From<Parameter<'static>> for ActualParameterType {
    fn from(value: Parameter<'static>) -> Self {
        Self::Parameter(value)
    }
}

impl From<PropertyValue> for ActualParameterType {
    fn from(value: PropertyValue) -> Self {
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
    ConversionError {
        from: ParameterType,
        to: ParameterType,
    },
}

impl fmt::Display for ParameterConversionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidParameterType { actual, expected } => {
                let actual = match actual {
                    ActualParameterType::Parameter(parameter) => match parameter {
                        Parameter::Any(PropertyValue::Null) => "null".to_owned(),
                        Parameter::Boolean(boolean)
                        | Parameter::Any(PropertyValue::Bool(boolean)) => boolean.to_string(),
                        Parameter::Decimal(number)
                        | Parameter::Any(PropertyValue::Number(number)) => number.to_string(),
                        Parameter::Text(text) => format!("\"{text}\""),
                        Parameter::Vector(_) => "vector".to_owned(),
                        Parameter::Any(PropertyValue::String(string)) => string.clone(),
                        Parameter::Uuid(uuid) => uuid.to_string(),
                        Parameter::OntologyTypeVersion(version) => version.to_string(),
                        Parameter::Timestamp(timestamp) => timestamp.to_string(),
                        Parameter::Any(PropertyValue::Object(_)) => "object".to_owned(),
                        Parameter::Any(PropertyValue::Array(_)) => "array".to_owned(),
                    },
                    ActualParameterType::Value(value) => match value {
                        PropertyValue::Null => "null".to_owned(),
                        PropertyValue::Bool(boolean) => boolean.to_string(),
                        PropertyValue::Number(number) => number.to_string(),
                        PropertyValue::String(string) => string.clone(),
                        PropertyValue::Array(_) => "array".to_owned(),
                        PropertyValue::Object(_) => "object".to_owned(),
                    },
                };

                write!(fmt, "could not convert {actual} to {expected}")
            }
            Self::NoConversionFound { from, to } => {
                write!(fmt, "no conversion found from `{from}` to `{to}`")
            }
            Self::ConversionError { from, to } => {
                write!(fmt, "could not convert from `{from}` to `{to}`")
            }
        }
    }
}

impl Error for ParameterConversionError {}

impl Parameter<'_> {
    pub(crate) fn convert_to_parameter_type(
        &mut self,
        expected: &ParameterType,
    ) -> Result<(), Report<ParameterConversionError>> {
        match (&mut *self, expected) {
            // identity
            (actual, expected) if actual.parameter_type() == *expected => {}

            // Boolean conversions
            (Parameter::Boolean(bool), ParameterType::Any) => {
                *self = Parameter::Any(PropertyValue::Bool(*bool));
            }
            (Parameter::Any(PropertyValue::Bool(bool)), ParameterType::Boolean) => {
                *self = Parameter::Boolean(*bool);
            }

            // Ontology type conversions
            (Parameter::Text(text), ParameterType::OntologyTypeVersion) => {
                // Special case for checking `version == "latest"
                if text != "latest" {
                    *self = Parameter::OntologyTypeVersion(Cow::Owned(
                        text.parse().change_context_lazy(|| {
                            ParameterConversionError::InvalidParameterType {
                                actual: self.to_owned().into(),
                                expected: ParameterType::OntologyTypeVersion,
                            }
                        })?,
                    ));
                }
            }

            // Floating point conversions
            (Parameter::Decimal(number), ParameterType::Any) => {
                *self = Parameter::Any(PropertyValue::Number(number.to_owned()));
            }
            (Parameter::Any(PropertyValue::Number(number)), ParameterType::Decimal) => {
                *self = Parameter::Decimal(number.to_owned());
            }

            // Text conversions
            (Parameter::Text(text), ParameterType::Any) => {
                *self = Parameter::Any(PropertyValue::String((*text).to_string()));
            }
            (Parameter::Any(PropertyValue::String(string)), ParameterType::Text) => {
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
                *self = Parameter::Any(PropertyValue::Array(
                    vector
                        .iter()
                        .map(|value| {
                            Real::try_from(value)
                                .change_context_lazy(|| ParameterConversionError::ConversionError {
                                    from: ParameterType::Vector(Box::new(ParameterType::Decimal)),
                                    to: ParameterType::Decimal,
                                })
                                .map(PropertyValue::Number)
                        })
                        .collect::<Result<_, _>>()?,
                ));
            }
            (Parameter::Any(PropertyValue::Array(array)), ParameterType::Vector(rhs))
                if **rhs == ParameterType::Decimal =>
            {
                *self = Parameter::Vector(
                    mem::take(array)
                        .into_iter()
                        .map(|value| {
                            let PropertyValue::Number(number) = value else {
                                bail!(ParameterConversionError::InvalidParameterType {
                                    actual: self.to_owned().into(),
                                    expected: expected.clone(),
                                });
                            };
                            Ok(number.to_f32_lossy())
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
