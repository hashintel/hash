use crate::{
    behaviors::get_state_or_property,
    prelude::{AgentState, Context, SimulationResult},
};

pub fn diffusion(mut state: AgentState, context: &Context) -> SimulationResult<AgentState> {
    let diffusion_coef: f64 = get_state_or_property(&state, &context, "diffusion_coef", 0.5);

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

    let diffusion_targets: Vec<String> =
        match serde_json::from_value(state["diffusion_targets"].clone()) {
            Ok(target) => target,
            Err(_) => return Ok(state),
        };

    for (_i, target) in diffusion_targets.iter().enumerate() {
        if state[target].is_number() {
            let state_value = state[target].as_f64().ok_or("not a number")?;

            let target_array = vec![state_value];

            let new_value = diffuse_multiple(target_array, &target, &context, diffusion_coef);

            state[target] = json!(new_value[0]);
        } else if state[target].is_array() {
            let state_value: Vec<f64> = serde_json::from_value(state[target].clone())?;

            let new_values = diffuse_multiple(state_value, &target, &context, diffusion_coef);

            state[target] = json!(new_values);
        }
    }

    Ok(state)
}
