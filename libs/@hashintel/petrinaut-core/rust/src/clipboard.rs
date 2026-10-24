use alloc::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tsify::Tsify;

use crate::{
    ArcEndpoint, Extensions, Patch,
    document::{items_mut, net_mut, text},
    extensions::items,
    model::{
        ColorData, EquationData, ParameterData, PlaceData, TransitionData,
        validation::{canonical_id, normalize_ids},
    },
    selection::{ItemKind, SelectedItem},
};

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipboardData {
    pub places: Vec<PlaceData>,
    pub transitions: Vec<TransitionData>,
    pub types: Vec<ColorData>,
    pub differential_equations: Vec<EquationData>,
    pub parameters: Vec<ParameterData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PasteInput {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub data: ClipboardData,
    /// Host-generated IDs in places, transitions, types, equations, parameters, then type-element
    /// order.
    pub fresh_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasteResult {
    pub patches: Vec<Patch>,
    pub new_item_ids: Vec<SelectedItem>,
}

fn collect_ids(value: &Value, result: &mut BTreeSet<String>) {
    match value {
        Value::Object(object) => {
            for (key, value) in object {
                if key == "metadata" {
                    continue;
                }
                if matches!(key.as_str(), "id" | "elementId") {
                    if let Some(id) = value.as_str() {
                        result.insert(id.to_owned());
                    }
                } else {
                    collect_ids(value, result);
                }
            }
        }
        Value::Array(values) => {
            for value in values {
                collect_ids(value, result);
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
    }
}

#[expect(
    clippy::float_arithmetic,
    clippy::float_cmp,
    reason = "Name suffixes follow JavaScript Number arithmetic"
)]
fn unique_name(name: &str, existing: &mut BTreeSet<String>) -> Result<String, String> {
    if existing.insert(name.to_owned()) {
        return Ok(name.to_owned());
    }
    let suffix = name
        .trim_end_matches(|character: char| character.is_ascii_digit())
        .len();
    let first = name.chars().next().map_or(0, char::len_utf8);
    let split = suffix.max(first);
    let (base, mut number) = if split < name.len() && !name.contains(['\n', '\r']) {
        (
            name.get(..split).ok_or("Name prefix is invalid")?,
            name.get(split..)
                .and_then(|digits| digits.parse::<f64>().ok())
                .unwrap_or(1.0)
                + 1.0,
        )
    } else {
        (name, 2.0)
    };
    loop {
        let candidate = format!("{base}{}", ryu_js::Buffer::new().format(number));
        if existing.insert(candidate.clone()) {
            return Ok(candidate);
        }
        let next = number + 1.0;
        if next == number {
            return Err("Name suffix cannot be incremented without losing precision".to_owned());
        }
        number = next;
    }
}

fn remap_reference(value: &mut Value, field: &str, mapping: &BTreeMap<String, String>) {
    if let Some(id) = value.get(field).and_then(Value::as_str)
        && let Some(replacement) = mapping.get(id)
    {
        value[field] = json!(replacement);
    }
}

#[expect(
    clippy::float_arithmetic,
    reason = "Pasted node coordinates use the existing 50-unit offset"
)]
fn transform_entity(
    value: &mut Value,
    field: &str,
    mapping: &BTreeMap<String, String>,
    fresh: &mut impl Iterator<Item = String>,
    variables: &mut BTreeSet<String>,
) -> Result<(), String> {
    if field == "types" {
        for element in items_mut(value, "elements")? {
            element["elementId"] = json!(fresh.next().ok_or("A fresh type-element ID is missing")?);
        }
    }
    if field == "parameters" {
        value["variableName"] = json!(unique_name(text(value, "variableName"), variables)?);
    }
    for reference in ["colorId", "differentialEquationId"] {
        remap_reference(value, reference, mapping);
    }
    if matches!(field, "places" | "transitions") {
        for coordinate in ["x", "y"] {
            let position = value
                .get(coordinate)
                .and_then(Value::as_f64)
                .ok_or("Node coordinate must be finite")?
                + 50.0;
            if !position.is_finite() {
                return Err("Pasted node coordinate must be finite".to_owned());
            }
            value[coordinate] = json!(position);
        }
    }
    if field == "transitions" {
        for direction in ["inputArcs", "outputArcs"] {
            let arcs = items_mut(value, direction)?;
            let mut remapped = Vec::new();
            for arc in arcs.iter() {
                if let Some(ArcEndpoint::Place { place_id }) = ArcEndpoint::from_arc(arc)
                    && let Some(replacement) = mapping.get(&place_id)
                {
                    let mut arc = arc.as_object().ok_or("Arc must be an object")?.clone();
                    arc.remove("endpoint");
                    arc.insert("placeId".to_owned(), json!(replacement));
                    remapped.push(Value::Object(arc));
                }
            }
            *arcs = remapped;
        }
    }
    Ok(())
}

pub(crate) fn apply(
    document: &mut Value,
    input: &PasteInput,
    extensions: Extensions,
) -> Result<Vec<SelectedItem>, String> {
    let mut data = serde_json::to_value(&input.data).map_err(|error| error.to_string())?;
    normalize_ids(&mut data)?;
    let mut occupied = BTreeSet::new();
    collect_ids(document, &mut occupied);
    let mut fresh = Vec::new();
    for id in &input.fresh_ids {
        let id = canonical_id(id);
        if !occupied.insert(id.clone()) {
            return Err("Fresh paste IDs must be unique and absent from the document".to_owned());
        }
        fresh.push(id);
    }
    let required = input.data.places.len()
        + input.data.transitions.len()
        + input.data.types.len()
        + input.data.differential_equations.len()
        + input.data.parameters.len()
        + input
            .data
            .types
            .iter()
            .map(|color| color.elements.len())
            .sum::<usize>();
    if fresh.len() != required {
        return Err(format!("Paste requires {required} fresh IDs"));
    }
    let mut fresh = fresh.into_iter();
    let mut mapping = BTreeMap::new();
    for field in [
        "places",
        "transitions",
        "types",
        "differentialEquations",
        "parameters",
    ] {
        for value in items(&data, field) {
            mapping.insert(
                text(value, "id").to_owned(),
                fresh.next().ok_or("A fresh entity ID is missing")?,
            );
        }
    }
    let target_subnet_id = input.target_subnet_id.as_deref().map(canonical_id);
    let target = net_mut(document, target_subnet_id.as_deref())?;
    let mut variables = items(target, "parameters")
        .iter()
        .map(|value| text(value, "variableName").to_owned())
        .collect();
    let mut created = Vec::new();
    for (field, kind, enabled) in [
        ("types", ItemKind::Type, extensions.colors),
        (
            "differentialEquations",
            ItemKind::DifferentialEquation,
            extensions.colors && extensions.dynamics,
        ),
        ("parameters", ItemKind::Parameter, extensions.parameters),
        ("places", ItemKind::Place, true),
        ("transitions", ItemKind::Transition, true),
    ] {
        let mut names = items(target, field)
            .iter()
            .map(|value| text(value, "name").to_owned())
            .collect();
        for original in items(&data, field) {
            let mut value = original.clone();
            let id = mapping
                .get(text(original, "id"))
                .ok_or("Pasted entity ID mapping is missing")?
                .clone();
            let fields = value
                .as_object_mut()
                .ok_or("Pasted entity must be an object")?;
            fields.insert("id".to_owned(), json!(id));
            fields.insert(
                "name".to_owned(),
                json!(unique_name(text(original, "name"), &mut names)?),
            );
            transform_entity(&mut value, field, &mapping, &mut fresh, &mut variables)?;
            items_mut(target, field)?.push(value);
            if enabled {
                created.push(SelectedItem { id, kind });
            }
        }
    }
    extensions.sanitize_document(document);
    Ok(created)
}
