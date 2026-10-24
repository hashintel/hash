use serde::Deserialize;
use serde_json::{Map, Value};

#[derive(Clone, Copy)]
pub(crate) enum FieldKind {
    Text,
    Id,
    NullableId,
    Boolean,
    Number,
    Capacity,
    Metadata,
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
#[derive(Debug, Clone, Deserialize)]
#[serde(try_from = "Value")]
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
