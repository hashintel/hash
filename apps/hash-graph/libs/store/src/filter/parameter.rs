use alloc::borrow::Cow;
use core::{fmt, mem, str::FromStr};

use error_stack::{Context, Report, ResultExt, bail};
use graph_types::{
    Embedding,
    knowledge::entity::EntityEditionId,
    ontology::{EntityTypeId, PropertyTypeId},
};
use serde::Deserialize;
use serde_json::{Number as JsonNumber, Value as JsonValue};
use temporal_versioning::Timestamp;
use type_system::{
    schema::DataTypeId,
    url::{OntologyTypeVersion, VersionedUrl},
};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Parameter<'p> {
    Boolean(bool),
    I32(i32),
    F64(f64),
    Text(Cow<'p, str>),
    Vector(Embedding<'p>),
    Any(JsonValue),
    #[serde(skip)]
    Uuid(Uuid),
    #[serde(skip)]
    OntologyTypeVersion(OntologyTypeVersion),
    #[serde(skip)]
    Timestamp(Timestamp<()>),
}
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ParameterType {
    Boolean,
    I32,
    F64,
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
            Self::I32 => fmt.write_str("signed 32 bit integral number"),
            Self::F64 => fmt.write_str("64 bit floating point number"),
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
    DataTypeIds(&'p [DataTypeId]),
    PropertyTypeIds(&'p [PropertyTypeId]),
    EntityTypeIds(&'p [EntityTypeId]),
    EntityEditionIds(&'p [EntityEditionId]),
}

impl Parameter<'_> {
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
    Value(JsonValue),
}

impl From<Parameter<'static>> for ActualParameterType {
    fn from(value: Parameter<'static>) -> Self {
        Self::Parameter(value)
    }
}

impl From<JsonValue> for ActualParameterType {
    fn from(value: JsonValue) -> Self {
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
                        Parameter::Any(JsonValue::Null) => "null".to_owned(),
                        Parameter::Boolean(boolean) | Parameter::Any(JsonValue::Bool(boolean)) => {
                            boolean.to_string()
                        }
                        Parameter::I32(number) => number.to_string(),
                        Parameter::F64(number) => number.to_string(),
                        Parameter::Any(JsonValue::Number(number)) => number.to_string(),
                        Parameter::Text(text) => text.to_string(),
                        Parameter::Vector(_) => "vector".to_owned(),
                        Parameter::Any(JsonValue::String(string)) => string.clone(),
                        Parameter::Uuid(uuid) => uuid.to_string(),
                        Parameter::OntologyTypeVersion(version) => version.inner().to_string(),
                        Parameter::Timestamp(timestamp) => timestamp.to_string(),
                        Parameter::Any(JsonValue::Object(_)) => "object".to_owned(),
                        Parameter::Any(JsonValue::Array(_)) => "array".to_owned(),
                    },
                    ActualParameterType::Value(value) => match value {
                        JsonValue::Null => "null".to_owned(),
                        JsonValue::Bool(boolean) => boolean.to_string(),
                        JsonValue::Number(number) => number.to_string(),
                        JsonValue::String(string) => string.clone(),
                        JsonValue::Array(_) => "array".to_owned(),
                        JsonValue::Object(_) => "object".to_owned(),
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
    pub(crate) fn convert_to_parameter_type(
        &mut self,
        expected: ParameterType,
    ) -> Result<(), Report<ParameterConversionError>> {
        match (&mut *self, &expected) {
            // identity
            (actual, expected) if actual.parameter_type() == *expected => {}

            // Boolean conversions
            (Parameter::Boolean(bool), ParameterType::Any) => {
                *self = Parameter::Any(JsonValue::Bool(*bool));
            }
            (Parameter::Any(JsonValue::Bool(bool)), ParameterType::Boolean) => {
                *self = Parameter::Boolean(*bool);
            }

            // Integral conversions
            (Parameter::I32(number), ParameterType::Any) => {
                *self = Parameter::Any(JsonValue::Number(JsonNumber::from(*number)));
            }
            (Parameter::Any(JsonValue::Number(number)), ParameterType::I32) => {
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
                *self = Parameter::Any(JsonValue::Number(
                    JsonNumber::from_f64(*number).ok_or_else(|| {
                        Report::new(ParameterConversionError::InvalidParameterType {
                            actual: self.to_owned().into(),
                            expected,
                        })
                    })?,
                ));
            }
            (Parameter::Any(JsonValue::Number(number)), ParameterType::F64) => {
                *self = Parameter::F64(number.as_f64().ok_or_else(|| {
                    Report::new(ParameterConversionError::InvalidParameterType {
                        actual: self.to_owned().into(),
                        expected,
                    })
                })?);
            }

            // Text conversions
            (Parameter::Text(text), ParameterType::Any) => {
                *self = Parameter::Any(JsonValue::String((*text).to_string()));
            }
            (Parameter::Any(JsonValue::String(string)), ParameterType::Text) => {
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
                *self = Parameter::Any(JsonValue::Array(
                    vector
                        .iter()
                        .map(|value| {
                            JsonNumber::from_f64(f64::from(value))
                                .ok_or_else(|| {
                                    Report::new(ParameterConversionError::InvalidParameterType {
                                        actual: Parameter::Vector(vector.to_owned()).into(),
                                        expected: expected.clone(),
                                    })
                                })
                                .map(JsonValue::Number)
                        })
                        .collect::<Result<_, _>>()?,
                ));
            }
            (Parameter::Any(JsonValue::Array(array)), ParameterType::Vector(rhs))
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
