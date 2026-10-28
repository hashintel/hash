use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{arcs::ArcEndpoint, extensions::items};

#[derive(Clone, Copy)]
pub(crate) enum FieldKind {
    Text,
    Id,
    NullableId,
    Boolean,
    Number,
    Capacity,
    Metadata,
    Array,
    PositiveNumber,
    Choice(&'static [&'static str]),
    Endpoint,
}

impl FieldKind {
    fn accepts(self, value: &Value) -> bool {
        match self {
            Self::Text => value.is_string(),
            Self::Id => value.as_str().is_some_and(|text| !text.is_empty()),
            Self::NullableId => value.is_null() || Self::Id.accepts(value),
            Self::Boolean => value.is_boolean(),
            Self::Number => value.as_f64().is_some_and(f64::is_finite),
            Self::Capacity => {
                value.is_null()
                    || value.as_f64().is_some_and(|number| {
                        number.is_finite()
                            && (0.0..=9_007_199_254_740_991.0).contains(&number)
                            && number.fract() == 0.0
                    })
            }
            Self::Metadata => value.is_object(),
            Self::Array => value.is_array(),
            Self::PositiveNumber => value
                .as_f64()
                .is_some_and(|number| number.is_finite() && number > 0.0),
            Self::Choice(choices) => value.as_str().is_some_and(|text| choices.contains(&text)),
            Self::Endpoint => serde_json::from_value::<ArcEndpoint>(value.clone())
                .is_ok_and(|endpoint| endpoint.validate().is_ok()),
        }
    }
}

pub(crate) fn validate_fields(
    value: &Value,
    required: &[(&str, FieldKind)],
    optional: &[(&str, FieldKind)],
) -> Result<(), String> {
    let object = value.as_object().ok_or("Entity must be an object")?;
    for (key, kind) in required {
        if !object.get(*key).is_some_and(|value| kind.accepts(value)) {
            return Err(format!("Entity field `{key}` is missing or invalid"));
        }
    }
    for (key, value) in object {
        let (_, kind) = required
            .iter()
            .chain(optional)
            .find(|(name, _)| *name == key)
            .ok_or_else(|| format!("Unknown entity field `{key}`"))?;
        if !kind.accepts(value) {
            return Err(format!("Entity field `{key}` is invalid"));
        }
    }
    Ok(())
}

pub(crate) fn validate_update(
    update: &Map<String, Value>,
    allowed: &[(&str, FieldKind)],
) -> Result<(), String> {
    validate_fields(&Value::Object(update.clone()), &[], allowed)
}

pub(crate) fn trim_name(value: &mut Value, pascal_case: bool) -> Result<(), String> {
    let name = value["name"]
        .as_str()
        .ok_or("Entity name must be a string")?
        .trim();
    let mut digits = false;
    if name.is_empty()
        || (pascal_case
            && (!name.starts_with(|character: char| character.is_ascii_uppercase())
                || !name.chars().all(|character| {
                    if character.is_ascii_digit() {
                        digits = true;
                        true
                    } else {
                        !digits && character.is_ascii_alphabetic()
                    }
                })))
    {
        return Err("Entity name is empty or has an invalid format".to_owned());
    }
    value["name"] = Value::String(name.to_owned());
    Ok(())
}

pub(crate) const PLACE_UPDATE_FIELDS: &[(&str, FieldKind)] = &[
    ("name", FieldKind::Text),
    ("colorId", FieldKind::NullableId),
    ("dynamicsEnabled", FieldKind::Boolean),
    ("differentialEquationId", FieldKind::NullableId),
    ("description", FieldKind::Text),
    ("metadata", FieldKind::Metadata),
    ("capacity", FieldKind::Capacity),
    ("isPort", FieldKind::Boolean),
    ("visualizerCode", FieldKind::Text),
    ("showAsInitialState", FieldKind::Boolean),
];

/// A validated place. IDs must already use the document's identifier namespace.
#[derive(Debug, Clone, Deserialize, Serialize, tsify::Tsify)]
#[serde(try_from = "Value")]
#[tsify(type = "PlaceData")]
pub struct Place(Value);

impl Place {
    pub(crate) const fn as_value(&self) -> &Value {
        &self.0
    }

    pub(crate) fn into_value(self) -> Value {
        self.0
    }
}

impl TryFrom<Value> for Place {
    type Error = String;

    fn try_from(mut value: Value) -> Result<Self, Self::Error> {
        validate_fields(
            &value,
            &[
                ("id", FieldKind::Id),
                ("name", FieldKind::Text),
                ("colorId", FieldKind::NullableId),
                ("dynamicsEnabled", FieldKind::Boolean),
                ("differentialEquationId", FieldKind::NullableId),
                ("x", FieldKind::Number),
                ("y", FieldKind::Number),
            ],
            PLACE_UPDATE_FIELDS,
        )?;
        trim_name(&mut value, true)?;
        Ok(Self(value))
    }
}

pub(crate) const TRANSITION_UPDATE_FIELDS: &[(&str, FieldKind)] = &[
    ("name", FieldKind::Text),
    ("description", FieldKind::Text),
    ("metadata", FieldKind::Metadata),
    (
        "lambdaType",
        FieldKind::Choice(&["predicate", "stochastic"]),
    ),
    ("lambdaCode", FieldKind::Text),
    ("transitionKernelCode", FieldKind::Text),
];

fn validate_arc(arc: &Value, input: bool) -> Result<(), String> {
    let mut required = vec![("weight", FieldKind::PositiveNumber)];
    if input {
        required.push((
            "type",
            FieldKind::Choice(&["standard", "inhibitor", "read"]),
        ));
    }
    validate_fields(
        arc,
        &required,
        &[
            ("placeId", FieldKind::Id),
            ("endpoint", FieldKind::Endpoint),
        ],
    )?;
    if arc.get("placeId").is_some() == arc.get("endpoint").is_some() {
        return Err("Arc must specify exactly one of `placeId` and `endpoint`".to_owned());
    }
    Ok(())
}

/// A validated transition, including its arc shapes and code fields.
#[derive(Debug, Clone, Deserialize, Serialize, tsify::Tsify)]
#[serde(try_from = "Value")]
#[tsify(type = "TransitionData")]
pub struct Transition(Value);

impl Transition {
    pub(crate) const fn as_value(&self) -> &Value {
        &self.0
    }

    pub(crate) fn into_value(self) -> Value {
        self.0
    }
}

impl TryFrom<Value> for Transition {
    type Error = String;

    fn try_from(mut value: Value) -> Result<Self, Self::Error> {
        validate_fields(
            &value,
            &[
                ("id", FieldKind::Id),
                ("name", FieldKind::Text),
                ("inputArcs", FieldKind::Array),
                ("outputArcs", FieldKind::Array),
                (
                    "lambdaType",
                    FieldKind::Choice(&["predicate", "stochastic"]),
                ),
                ("lambdaCode", FieldKind::Text),
                ("transitionKernelCode", FieldKind::Text),
                ("x", FieldKind::Number),
                ("y", FieldKind::Number),
            ],
            TRANSITION_UPDATE_FIELDS,
        )?;
        trim_name(&mut value, false)?;
        for arc in items(&value, "inputArcs") {
            validate_arc(arc, true)?;
        }
        for arc in items(&value, "outputArcs") {
            validate_arc(arc, false)?;
        }
        Ok(Self(value))
    }
}

pub(crate) fn apply_update(
    value: &mut Value,
    update: &Map<String, Value>,
    unset: &[String],
    allowed: &[(&str, FieldKind)],
) -> Result<(), String> {
    validate_update(update, allowed)?;
    let fields = value.as_object_mut().ok_or("Entity must be an object")?;
    fields.extend(update.clone());
    for key in unset {
        if !allowed.iter().any(|(name, _)| *name == key) {
            return Err(format!("Unknown entity update field `{key}`"));
        }
        fields.remove(key);
    }
    Ok(())
}
