use alloc::collections::BTreeSet;

use serde_json::{Value, json};
use uuid::Uuid;

use super::{
    ColorData, ComponentData, EndpointData, InitialStateData, Nullable, ParameterData,
    ParameterType, PlaceData, Sdcpn, TransitionData,
};

const ID_NAMESPACE: Uuid = Uuid::from_u128(0xF346_239E_B5E3_53B6_BB7E_2970_46D1_AC64);
const RESERVED: &[&str] = &[
    "__proto__",
    "constructor",
    "prototype",
    "toString",
    "toLocaleString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
];

#[must_use]
pub fn canonical_id(id: &str) -> String {
    if id.len() == 36
        && let Ok(uuid) = Uuid::parse_str(id)
    {
        return uuid.to_string();
    }
    Uuid::new_v5(&ID_NAMESPACE, id.as_bytes()).to_string()
}

pub(crate) fn normalize_ids(value: &mut Value) -> Result<(), String> {
    match value {
        Value::Object(fields) => {
            for (key, value) in fields.iter_mut() {
                if key == "metadata" {
                    continue;
                }
                if matches!(
                    key.as_str(),
                    "id" | "placeId"
                        | "transitionId"
                        | "typeId"
                        | "elementId"
                        | "equationId"
                        | "parameterId"
                        | "scenarioId"
                        | "metricId"
                        | "subnetId"
                        | "targetSubnetId"
                        | "instanceId"
                        | "componentInstanceId"
                        | "portPlaceId"
                        | "colorId"
                        | "differentialEquationId"
                        | "oldPlaceId"
                        | "newPlaceId"
                ) {
                    if let Some(id) = value.as_str() {
                        if id.is_empty() {
                            return Err(format!("Identifier `{key}` must not be empty"));
                        }
                        *value = json!(canonical_id(id));
                    }
                } else if matches!(key.as_str(), "parameterValues" | "parameterOverrides") {
                    rekey(value)?;
                } else {
                    normalize_ids(value)?;
                }
            }
            if fields.get("type").and_then(Value::as_str) == Some("per_place")
                && let Some(content) = fields.get_mut("content")
            {
                rekey(content)?;
            }
            if fields.get("type").and_then(Value::as_str) == Some("adhoc")
                && let Some(content) = fields.get_mut("content")
                && let Some(places) = content.get_mut("places")
            {
                rekey(places)?;
            }
        }
        Value::Array(values) => {
            for value in values {
                normalize_ids(value)?;
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {}
    }
    Ok(())
}

fn rekey(value: &mut Value) -> Result<(), String> {
    let fields = value
        .as_object_mut()
        .ok_or("Identifier map must be an object")?;
    let mut result = serde_json::Map::new();
    for (key, value) in core::mem::take(fields) {
        if key.is_empty() {
            return Err("Identifier map key must not be empty".to_owned());
        }
        result.insert(canonical_id(&key), value);
    }
    *fields = result;
    Ok(())
}

fn defaults(net: &mut Value) -> Result<(), String> {
    let fields = net.as_object_mut().ok_or("Document must be an object")?;
    for key in ["types", "parameters", "differentialEquations"] {
        fields.entry(key).or_insert_with(|| json!([]));
    }
    for key in ["places", "transitions"] {
        if !fields.get(key).is_some_and(Value::is_array) {
            return Err(format!("Document field `{key}` must be an array"));
        }
    }
    for place in fields
        .get_mut("places")
        .and_then(Value::as_array_mut)
        .into_iter()
        .flatten()
    {
        let place = place.as_object_mut().ok_or("Place must be an object")?;
        place.entry("colorId").or_insert(Value::Null);
        place.entry("dynamicsEnabled").or_insert(json!(false));
        place.entry("differentialEquationId").or_insert(Value::Null);
    }
    for transition in fields
        .get_mut("transitions")
        .and_then(Value::as_array_mut)
        .into_iter()
        .flatten()
    {
        let transition = transition
            .as_object_mut()
            .ok_or("Transition must be an object")?;
        transition.entry("lambdaType").or_insert(json!("predicate"));
        transition.entry("lambdaCode").or_insert(json!(""));
        transition
            .entry("transitionKernelCode")
            .or_insert(json!(""));
        for field in ["inputArcs", "outputArcs"] {
            for arc in transition
                .get_mut(field)
                .and_then(Value::as_array_mut)
                .into_iter()
                .flatten()
            {
                let arc = arc.as_object_mut().ok_or("Arc must be an object")?;
                arc.entry("weight").or_insert(json!(1));
                if field == "inputArcs" {
                    arc.entry("type").or_insert(json!("standard"));
                }
            }
        }
    }
    Ok(())
}

pub(super) fn normalize(value: &mut Value) -> Result<(), String> {
    defaults(value)?;
    for subnet in value
        .get_mut("subnets")
        .and_then(Value::as_array_mut)
        .into_iter()
        .flatten()
    {
        defaults(subnet)?;
    }
    for scenario in value
        .get_mut("scenarios")
        .and_then(Value::as_array_mut)
        .into_iter()
        .flatten()
    {
        if let Some(fields) = scenario.as_object_mut() {
            fields
                .entry("parameterOverrides")
                .or_insert_with(|| json!({}));
        }
    }
    normalize_ids(value)
}

pub(crate) fn name(name: &str, pascal: bool) -> Result<(), String> {
    let name = name.trim();
    let mut digits = false;
    if name.is_empty()
        || (pascal
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
    Ok(())
}

pub(crate) fn identifier(value: &str, snake: bool) -> bool {
    !RESERVED.contains(&value)
        && if snake {
            value.starts_with(|character: char| character.is_ascii_lowercase())
                && value.chars().all(|character| {
                    character.is_ascii_lowercase() || character.is_ascii_digit() || character == '_'
                })
        } else {
            value.starts_with(|character: char| {
                character.is_ascii_alphabetic() || character == '_' || character == '$'
            }) && value.chars().all(|character| {
                character.is_ascii_alphanumeric() || character == '_' || character == '$'
            })
        }
}

#[expect(
    clippy::float_arithmetic,
    clippy::suboptimal_flops,
    reason = "JavaScript Number conversion rounds each operation separately"
)]
pub(crate) fn js_number(text: &str) -> Option<f64> {
    let text = text.trim();
    if text.is_empty() {
        return Some(0.0);
    }
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0b", 2),
        ("0B", 2),
        ("0o", 8),
        ("0O", 8),
    ] {
        if let Some(digits) = text.strip_prefix(prefix) {
            if digits.is_empty() {
                return None;
            }
            return digits
                .chars()
                .try_fold(0.0, |number, character| {
                    character
                        .to_digit(radix)
                        .map(|digit| number * f64::from(radix) + f64::from(digit))
                })
                .filter(|number| number.is_finite());
        }
    }
    text.parse::<f64>().ok().filter(|number| number.is_finite())
}

pub(crate) fn parameter(parameter: &ParameterData) -> Result<(), String> {
    name(&parameter.name, false)?;
    let variable = parameter.variable_name.trim();
    if !identifier(variable, true) || variable.contains("__") || variable.ends_with('_') {
        return Err("Parameter variable name must be lower_snake_case".to_owned());
    }
    let value = &parameter.default_value;
    let valid = match parameter.kind_type {
        ParameterType::Boolean => value == "true" || value == "false",
        ParameterType::Real => !value.trim().is_empty() && js_number(value).is_some(),
        ParameterType::Integer => {
            !value.trim().is_empty() && js_number(value).is_some_and(|number| number.fract() == 0.0)
        }
    };
    if !valid {
        return Err("Parameter default value does not match its type".to_owned());
    }
    Ok(())
}

fn finite(values: &[f64]) -> Result<(), String> {
    if values.iter().all(|number| number.is_finite()) {
        Ok(())
    } else {
        Err("Document numbers must be finite".to_owned())
    }
}

fn arc(place_id: Option<&str>, endpoint: Option<&EndpointData>, weight: f64) -> Result<(), String> {
    if place_id.is_some() == endpoint.is_some() {
        return Err("Arc must specify exactly one of `placeId` and `endpoint`".to_owned());
    }
    if !weight.is_finite() || weight <= 0.0 {
        return Err("Arc weight must be a positive finite number".to_owned());
    }
    Ok(())
}

fn net(
    places: &[PlaceData],
    transitions: &[TransitionData],
    colors: &[ColorData],
    parameters: &[ParameterData],
    components: Option<&[ComponentData]>,
) -> Result<(), String> {
    for place in places {
        name(&place.name, true)?;
        finite(&[place.x, place.y])?;
        if let Some(Nullable::Value(capacity)) = place.capacity
            && (!capacity.is_finite()
                || !(0.0..=9_007_199_254_740_991.0).contains(&capacity)
                || capacity.fract() != 0.0)
        {
            return Err("Place capacity must be a non-negative safe integer".to_owned());
        }
    }
    for transition in transitions {
        name(&transition.name, false)?;
        finite(&[transition.x, transition.y])?;
        for input in &transition.input_arcs {
            arc(
                input.place_id.as_deref(),
                input.endpoint.as_ref(),
                input.weight,
            )?;
        }
        for output in &transition.output_arcs {
            arc(
                output.place_id.as_deref(),
                output.endpoint.as_ref(),
                output.weight,
            )?;
        }
    }
    for color in colors {
        name(&color.name, false)?;
        if color.icon_slug.is_empty() || color.display_color.is_empty() {
            return Err("Token type icon and display color must not be empty".to_owned());
        }
        for element in &color.elements {
            if !identifier(element.name.trim(), false) {
                return Err(
                    "Token attribute name must be a non-reserved JavaScript identifier".to_owned(),
                );
            }
        }
    }
    for item in parameters {
        parameter(item)?;
    }
    for component in components.unwrap_or_default() {
        name(&component.name, true)?;
        finite(&[component.x, component.y])?;
    }
    Ok(())
}

pub(super) fn validate(document: &Sdcpn) -> Result<(), String> {
    net(
        &document.places,
        &document.transitions,
        &document.types,
        &document.parameters,
        document.component_instances.as_deref(),
    )?;
    for equation in &document.differential_equations {
        name(&equation.name, false)?;
    }
    for subnet in document.subnets.as_deref().unwrap_or_default() {
        name(&subnet.name, false)?;
        net(
            &subnet.places,
            &subnet.transitions,
            &subnet.types,
            &subnet.parameters,
            subnet.component_instances.as_deref(),
        )?;
        for equation in &subnet.differential_equations {
            name(&equation.name, false)?;
        }
    }
    for metric in document.metrics.as_deref().unwrap_or_default() {
        name(&metric.name, false)?;
    }
    for scenario in document.scenarios.as_deref().unwrap_or_default() {
        name(&scenario.name, false)?;
        let mut identifiers = BTreeSet::new();
        for parameter in &scenario.scenario_parameters {
            if !identifier(&parameter.identifier, true)
                || !identifiers.insert(&parameter.identifier)
            {
                return Err(
                    "Scenario parameter identifiers must be unique, non-reserved snake_case names"
                        .to_owned(),
                );
            }
            finite(&[parameter.default])?;
        }
        if let InitialStateData::PerPlace(content) = &scenario.initial_state {
            for initial in content.values() {
                if let super::PlaceInitialState::Rows(rows) = initial {
                    for cell in rows.iter().flatten() {
                        if let super::TokenCell::Number(number) = cell {
                            finite(&[*number])?;
                        }
                    }
                }
            }
        }
    }
    Ok(())
}
