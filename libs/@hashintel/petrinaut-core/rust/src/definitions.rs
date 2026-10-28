use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use tsify::Tsify;

use crate::{
    Extensions,
    document::{items_mut, net_mut},
    extensions::items,
    kernel::sanitize_all_transitions,
    model::Sdcpn,
    places::validate_dynamics,
};

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateEntity<T> {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub entity: T,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityTarget {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEntity {
    pub target: EntityTarget,
    #[tsify(type = "Record<string, JsonValue>")]
    pub update: Map<String, Value>,
    #[serde(default)]
    pub unset: Vec<String>,
}

pub(crate) fn validate_entity(field: &str, mut value: Value) -> Result<Value, String> {
    crate::entity::trim_name(&mut value, field == "componentInstances")?;
    if field == "parameters"
        && let Some(variable) = value.get_mut("variableName")
        && let Some(text) = variable.as_str()
    {
        *variable = json!(text.trim());
    }
    if field == "types" {
        for element in value
            .get_mut("elements")
            .and_then(Value::as_array_mut)
            .into_iter()
            .flatten()
        {
            crate::entity::trim_name(element, false)?;
        }
    }
    if field == "scenarios"
        && let Some(object) = value.as_object_mut()
    {
        object
            .entry("parameterOverrides")
            .or_insert_with(|| json!({}));
    }
    let mut document =
        json!({"places":[],"transitions":[],"types":[],"parameters":[],"differentialEquations":[]});
    document
        .as_object_mut()
        .ok_or("Document must be an object")?
        .insert(field.to_owned(), json!([value]));
    let validated = Sdcpn::from_normalized(document)?.to_json();
    validated
        .get(field)
        .and_then(Value::as_array)
        .and_then(|values| values.first())
        .cloned()
        .ok_or_else(|| "Validated entity is missing".to_owned())
}

pub(crate) fn collection_mut<'a>(
    document: &'a mut Value,
    field: &str,
    subnet_id: Option<&str>,
) -> Result<&'a mut Vec<Value>, String> {
    let target = if matches!(field, "scenarios" | "metrics" | "subnets") {
        document
    } else {
        net_mut(document, subnet_id)?
    };
    if matches!(
        field,
        "scenarios" | "metrics" | "subnets" | "componentInstances"
    ) && let Some(object) = target.as_object_mut()
    {
        object.entry(field).or_insert_with(|| json!([]));
    }
    items_mut(target, field)
}

fn enabled(field: &str, extensions: Extensions) -> bool {
    match field {
        "types" => extensions.colors,
        "differentialEquations" => extensions.colors && extensions.dynamics,
        "parameters" => extensions.parameters,
        _ => true,
    }
}

pub(crate) fn create<T: Serialize>(
    document: &mut Value,
    field: &str,
    input: &CreateEntity<T>,
    extensions: Extensions,
) -> Result<(), String> {
    let value = validate_entity(
        field,
        serde_json::to_value(&input.entity).map_err(|error| error.to_string())?,
    )?;
    if !enabled(field, extensions) {
        return Ok(());
    }
    let id = crate::document::text(&value, "id").to_owned();
    collection_mut(document, field, input.target_subnet_id.as_deref())?.push(value);
    if field == "differentialEquations" {
        validate_equation_places(document, input.target_subnet_id.as_deref(), &id)?;
    }
    Ok(())
}

pub(crate) fn update_fields(
    value: &mut Value,
    update: &Map<String, Value>,
    unset: &[String],
    allowed: &[&str],
) -> Result<(), String> {
    for key in update.keys().chain(unset) {
        if !allowed.contains(&key.as_str()) {
            return Err(format!("Unknown entity update field `{key}`"));
        }
    }
    let object = value.as_object_mut().ok_or("Entity must be an object")?;
    object.extend(update.clone());
    for key in unset {
        object.remove(key);
    }
    Ok(())
}

pub(crate) fn update(
    document: &mut Value,
    field: &str,
    input: &UpdateEntity,
    extensions: Extensions,
) -> Result<(), String> {
    if !enabled(field, extensions) {
        return Ok(());
    }
    let allowed: &[&str] = match field {
        "types" => &["name", "description", "iconSlug", "displayColor"],
        "differentialEquations" => &["name", "colorId", "code"],
        "parameters" => &["name", "variableName", "type", "defaultValue"],
        "scenarios" => &[
            "name",
            "description",
            "scenarioParameters",
            "parameterOverrides",
            "initialState",
        ],
        "metrics" => &["name", "description", "code"],
        "subnets" => &["name", "description", "metadata"],
        "componentInstances" => &[
            "name",
            "description",
            "metadata",
            "subnetId",
            "parameterValues",
        ],
        _ => return Err("Unsupported entity collection".to_owned()),
    };
    let target = if matches!(field, "scenarios" | "metrics" | "subnets") {
        &mut *document
    } else {
        net_mut(document, input.target.target_subnet_id.as_deref())?
    };
    let Some(values) = target.get_mut(field).and_then(Value::as_array_mut) else {
        return Ok(());
    };
    let mut changed = false;
    for entity in values {
        if entity["id"] == input.target.id {
            update_fields(entity, &input.update, &input.unset, allowed)?;
            *entity = validate_entity(field, entity.clone())?;
            changed = true;
            break;
        }
    }
    if changed && field == "differentialEquations" {
        validate_equation_places(
            document,
            input.target.target_subnet_id.as_deref(),
            &input.target.id,
        )?;
    }
    Ok(())
}

fn validate_equation_places(
    document: &mut Value,
    subnet_id: Option<&str>,
    equation_id: &str,
) -> Result<(), String> {
    let target = net_mut(document, subnet_id)?;
    for place in items(target, "places")
        .iter()
        .filter(|place| place["differentialEquationId"] == equation_id)
    {
        validate_dynamics(place, target)?;
    }
    Ok(())
}

pub(crate) fn remove(
    document: &mut Value,
    field: &str,
    input: &EntityTarget,
    extensions: Extensions,
) -> Result<(), String> {
    if !enabled(field, extensions) {
        return Ok(());
    }
    let target = if matches!(field, "scenarios" | "metrics" | "subnets") {
        &mut *document
    } else {
        net_mut(document, input.target_subnet_id.as_deref())?
    };
    if let Some(values) = target.get_mut(field).and_then(Value::as_array_mut)
        && let Some(index) = values.iter().position(|value| value["id"] == input.id)
    {
        values.remove(index);
    }
    if field == "types" {
        for place in items_mut(target, "places")? {
            if place["colorId"] == input.id {
                place["colorId"] = Value::Null;
            }
        }
        for equation in items_mut(target, "differentialEquations")? {
            if equation["colorId"] == input.id {
                equation["colorId"] = Value::Null;
            }
        }
    }
    if field == "differentialEquations" {
        for place in items_mut(target, "places")? {
            if place["differentialEquationId"] == input.id {
                place["differentialEquationId"] = Value::Null;
            }
        }
    }
    if field == "types" {
        sanitize_all_transitions(document, extensions);
    }
    Ok(())
}
