use alloc::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tsify::Tsify;
use uuid::Uuid;

use crate::{
    Extensions,
    definitions::{EntityTarget, update_fields, validate_entity},
    document::{items_mut, net_mut},
    extensions::items,
    model::{ColorElementData, validation::js_number},
};

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditTypeElements {
    pub target: EntityTarget,
    pub edit: TypeElementEdit,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum TypeElementEdit {
    Add {
        element: ColorElementData,
    },
    Update {
        element_id: String,
        #[tsify(type = "Record<string, JsonValue>")]
        update: Map<String, Value>,
        #[serde(default)]
        unset: Vec<String>,
    },
    Remove {
        element_id: String,
    },
    Move {
        element_id: String,
        to_index: u64,
    },
}

impl EditTypeElements {
    pub(crate) fn apply(&self, document: &mut Value, extensions: Extensions) -> Result<(), String> {
        if !extensions.colors {
            return Ok(());
        }
        let target = net_mut(document, self.target.target_subnet_id.as_deref())?;
        let Some(color) = items_mut(target, "types")?
            .iter_mut()
            .find(|color| color["id"] == self.target.id)
        else {
            return Ok(());
        };
        let elements = items_mut(color, "elements")?;
        let mut source: Vec<Option<usize>> = (0..elements.len()).map(Some).collect();
        let mut coerce = None;
        match &self.edit {
            TypeElementEdit::Add { element } => {
                elements.push(serde_json::to_value(element).map_err(|error| error.to_string())?);
                let index = elements
                    .iter()
                    .position(|item| item["elementId"] == element.element_id)
                    .ok_or("Added element is missing")?;
                source.insert(index, None);
            }
            TypeElementEdit::Update {
                element_id,
                update,
                unset,
            } => {
                let Some(index) = elements
                    .iter()
                    .position(|element| element["elementId"] == *element_id)
                else {
                    return Ok(());
                };
                let element = elements
                    .get_mut(index)
                    .ok_or("Type element index is invalid")?;
                let before = element["type"].clone();
                update_fields(element, update, unset, &["name", "type"])?;
                if element["type"] != before {
                    coerce = Some(index);
                }
            }
            TypeElementEdit::Remove { element_id } => {
                let Some(index) = elements
                    .iter()
                    .position(|element| element["elementId"] == *element_id)
                else {
                    return Ok(());
                };
                elements.remove(index);
                source.remove(index);
            }
            TypeElementEdit::Move {
                element_id,
                to_index,
            } => {
                let Some(index) = elements
                    .iter()
                    .position(|element| element["elementId"] == *element_id)
                else {
                    return Ok(());
                };
                let element = elements.remove(index);
                let destination = usize::try_from(*to_index)
                    .unwrap_or(usize::MAX)
                    .min(elements.len());
                elements.insert(destination, element);
                let original = source.remove(index);
                source.insert(destination, original);
                if index == destination {
                    return Ok(());
                }
            }
        }
        *color = validate_entity("types", color.clone())?;
        if matches!(self.edit, TypeElementEdit::Update { .. }) && coerce.is_none() {
            return Ok(());
        }
        migrate_rows(document, &self.target.id, &source, coerce);
        Ok(())
    }
}

fn default_cell(kind: &str) -> Value {
    match kind {
        "boolean" => json!(false),
        "uuid" => json!(Uuid::nil().to_string()),
        "string" => json!(""),
        _ => json!(0),
    }
}

fn stringify(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(number) => ryu_js::Buffer::new()
            .format_finite(number.as_f64().unwrap_or_default())
            .to_owned(),
        Value::Null => String::new(),
        Value::Array(_) | Value::Object(_) => unreachable!("scenario cells are scalar values"),
    }
}

#[expect(
    clippy::float_arithmetic,
    reason = "Scenario integer coercion follows JavaScript Math.round, including negative ties"
)]
fn coerce_cell(kind: &str, value: &Value) -> Value {
    if value.is_null() {
        return default_cell(kind);
    }
    match kind {
        "real" | "integer" => {
            let number = match value {
                Value::Bool(value) => Some(f64::from(u8::from(*value))),
                Value::Number(number) => number.as_f64(),
                Value::String(text) => js_number(text),
                Value::Null | Value::Array(_) | Value::Object(_) => None,
            }
            .unwrap_or_default();
            if kind == "integer" {
                let floor = number.floor();
                json!(if number - floor < 0.5 {
                    floor
                } else {
                    floor + 1.0
                })
            } else {
                json!(number)
            }
        }
        "boolean" => json!(match value {
            Value::Bool(value) => *value,
            Value::Number(number) => number.as_f64().is_some_and(|number| number != 0.0),
            Value::String(text) => matches!(text.trim().to_lowercase().as_str(), "true" | "1"),
            Value::Null | Value::Array(_) | Value::Object(_) => false,
        }),
        "string" => json!(stringify(value)),
        "uuid" => {
            let text = stringify(value);
            let uuid = if text.len() == 36 {
                Uuid::parse_str(&text).ok()
            } else {
                None
            };
            json!(
                uuid.unwrap_or_else(|| Uuid::new_v5(
                    &Uuid::from_u128(0x6D5B_6D5E_3C1B_4F7E_9C39_4B6F_1E2A_8D90),
                    text.as_bytes()
                ))
                .to_string()
            )
        }
        _ => default_cell(kind),
    }
}

fn migrate_rows(
    document: &mut Value,
    type_id: &str,
    source: &[Option<usize>],
    coerce: Option<usize>,
) {
    let nets: Vec<&Value> = core::iter::once(&*document)
        .chain(items(document, "subnets"))
        .collect();
    let Some(color) = nets
        .iter()
        .flat_map(|net| items(net, "types"))
        .find(|color| color["id"] == type_id)
    else {
        return;
    };
    let elements = items(color, "elements").to_vec();
    let places: BTreeSet<String> = nets
        .iter()
        .flat_map(|net| items(net, "places"))
        .filter(|place| place["colorId"] == type_id)
        .filter_map(|place| place["id"].as_str().map(str::to_owned))
        .collect();
    for scenario in document
        .get_mut("scenarios")
        .and_then(Value::as_array_mut)
        .into_iter()
        .flatten()
    {
        if scenario
            .get("initialState")
            .and_then(|state| state.get("type"))
            .and_then(Value::as_str)
            != Some("per_place")
        {
            continue;
        }
        let Some(content) = scenario
            .get_mut("initialState")
            .and_then(|state| state.get_mut("content"))
            .and_then(Value::as_object_mut)
        else {
            continue;
        };
        for place_id in &places {
            if let Some(rows) = content.get_mut(place_id).and_then(Value::as_array_mut) {
                for row in rows {
                    *row = Value::Array(
                        elements
                            .iter()
                            .enumerate()
                            .map(|(index, element)| {
                                let kind = element["type"].as_str().unwrap_or("real");
                                let cell = source
                                    .get(index)
                                    .copied()
                                    .flatten()
                                    .and_then(|source_index| row.get(source_index))
                                    .unwrap_or(&Value::Null);
                                if Some(index) == coerce {
                                    coerce_cell(kind, cell)
                                } else if cell.is_null() {
                                    default_cell(kind)
                                } else {
                                    cell.clone()
                                }
                            })
                            .collect(),
                    );
                }
            }
        }
    }
}
