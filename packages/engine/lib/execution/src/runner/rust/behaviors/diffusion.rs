use super::{Context, Result, State};
use crate::experiment::SharedBehavior;
use crate::worker::runner::rust::behaviors::accessors::field_or_property;
use serde_json::json;

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/diffusion/diffusion.rs".into(),
        name: "@hash/diffusion/diffusion.rs".into(),
        shortnames: vec!["@hash/diffusion/diffusion.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("diffusion.rs.json").to_string()),
    }
}

fn diffuse_multiple(
    target_value: Vec<f64>,
    target: &str,
    context: &Context,
    diffusion_coef: f64,
) -> Vec<f64> {
    let neighbors = context.neighbors.iter();

    let target_value_length = target_value.len();

    let mut values = vec![target_value];

    for (_i, index) in neighbors.enumerate() {
        if index[target].is_array() {
            if let Ok(value) = serde_json::from_value(index[target].clone()) {
                values.push(value);
            }
        } else if let Some(value) = index[target].as_f64() {
            values.push(vec![value]);
        }
    }

    let values_length: f64 = values.iter().count() as f64;

    let mut total_values: Vec<f64> = vec![0.0; target_value_length];

    for (_i, index) in values.iter().enumerate() {
        for x in 0..index.len() {
            total_values[x] += index[x];
        }
    }

    let mut avg_values = vec![];
    for x in total_values {
        avg_values.push(x / values_length);
    }

    let original_value = &values[0];

    let mut difference = vec![];
    for x in 0..avg_values.len() {
        difference.push(avg_values[x] - original_value[x]);
    }

    let mut new_values = vec![];
    for x in 0..difference.len() {
        let value = ((diffusion_coef * difference[x]) + original_value[x]) as f64;
        new_values.push(value);
    }

    new_values
}

/// # Errors
/// This function can fail when a diffusion target is not a valid f64
pub fn behavior(state: &mut State, context: &Context) -> Result<()> {
    let diffusion_targets: Vec<String> =
        match serde_json::from_value(state.diffusion_targets()?[0].clone()) {
            Ok(target) => target,
            Err(_) => return Ok(()),
        };
    let diffusion_coef: f64 = field_or_property(
        &state.diffusion_coef()?[0],
        &context.globals.get("diffusion_coef"),
        0.5,
    )?;

    for target in diffusion_targets.iter() {
        let target_value = state.get_value(target)?;

        if target_value.is_number() {
            let state_value = target_value.as_f64().ok_or("not a number")?;
            let target_array = vec![state_value];
            let new_value = diffuse_multiple(target_array, &target, &context, diffusion_coef);
            state.set_value(target, json!(new_value[0]))?;
        } else if target_value.is_array() {
            let state_value: Vec<f64> = serde_json::from_value(target_value)?;
            let new_values = diffuse_multiple(state_value, &target, &context, diffusion_coef);
            state.set_value(target, json!(new_values))?;
        }
        // TODO: Else return error?
    }

    Ok(())
}
