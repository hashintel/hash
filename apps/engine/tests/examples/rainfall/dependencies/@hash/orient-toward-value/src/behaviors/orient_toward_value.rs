use crate::prelude::{AgentState, Context, SimulationResult};
use std::collections::HashMap;

pub fn orient_toward_value(
    mut state: AgentState,
    context: &Context,
) -> SimulationResult<AgentState> {
    if !state["orient_toward_value"].is_string() {
        return Ok(state);
    }

    let target = state["orient_toward_value"]
        .as_str()
        .ok_or("not a string")?;

    // True -> looking for max (greater) value
    // False -> looking for min (smaller) value
    let uphill = match state["orient_toward_value_uphill"].as_bool() {
        Some(value) => value,
        None => true,
    };

    let cumulative = match state["orient_toward_value_cumulative"].as_bool() {
        Some(value) => value,
        None => false,
    };

    if let Some(target_value) = state[target].as_f64() {
        let neighbors = context.neighbors.iter();

        let mut current_max = target_value;

        let mut neighbor_map = HashMap::new();

        for (_i, neighbor) in neighbors.enumerate() {
            if let Some(neighbor_value) = neighbor[target].as_f64() {
                let position = neighbor.get_pos()?.to_grid();

                if cumulative && neighbor_map.contains_key(&position) {
                    *neighbor_map.get_mut(&position).unwrap() += neighbor_value;
                }

                neighbor_map.insert(position, neighbor_value);
            }
        }

        for (position, neighbor_value) in neighbor_map {
            let my_position = state.get_pos()?;
            if uphill {
                if neighbor_value > current_max {
                    current_max = neighbor_value;

                    let x_change = position[0] as f64 - my_position[0];
                    let y_change = position[1] as f64 - my_position[1];

                    state.direction = Some([x_change, y_change].into());
                }
            } else if neighbor_value < current_max {
                current_max = neighbor_value;

                let x_change = position[0] as f64 - my_position[0];
                let y_change = position[1] as f64 - my_position[1];

                state.direction = Some([x_change, y_change].into());
            }
        }

        // compare within same error
        if (current_max - target_value).abs() <= std::f64::EPSILON {
            state.direction = Some([].into());
        }
    }

    Ok(state)
}
