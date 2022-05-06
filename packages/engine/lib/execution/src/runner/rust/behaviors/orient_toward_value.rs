use std::collections::HashMap;

use super::{Context, Error, Result, SharedBehavior, State};

pub fn behavior(state: &mut State, context: &Context) -> Result<()> {
    let mut json_state = state.get_json_state()?;

    for i in 0..state.num_agents() {
        if !json_state[i]["orient_toward_value"].is_string() {
            return Ok(());
        }

        let target = json_state[i]["orient_toward_value"]
            .as_str()
            .ok_or("not a string")?;

        // True -> looking for max (greater) value
        // False -> looking for min (smaller) value
        let uphill = match json_state[i]["orient_toward_value_uphill"].as_bool() {
            Some(value) => value,
            None => true,
        };

        let cumulative = match json_state[i]["orient_toward_value_cumulative"].as_bool() {
            Some(value) => value,
            None => false,
        };

        if let Some(target_value) = json_state[i].get_as_json(target)?.as_f64() {
            let mut current_max = target_value;

            let mut neighbor_map = HashMap::new();

            for neighbor in context.neighbors(i)? {
                if let Some(neighbor_value) = neighbor.get_custom_as_json(target)?.as_f64() {
                    let position = neighbor
                        .position()
                        .ok_or("Neighbors should have position")?
                        .to_grid();

                    if neighbor_map.contains_key(&position) {
                        let old_value = *neighbor_map[&position];
                        let monotone = uphill == (old_value < neighbor_value);
                        if cumulative {
                            neighbor_map.insert(position, old_value + neighbor_value);
                        } else if monotone {
                            neighbor_map.insert(position, neighbor_value);
                        }
                    } else {
                        neighbor_map.insert(position, neighbor_value);
                    }
                }
            }

            for (position, neighbor_value) in neighbor_map {
                let my_position = json_state[i]
                    .get_pos()
                    .map_err(|e| Error::from(e.to_string()))?;
                if uphill {
                    if neighbor_value > current_max {
                        current_max = neighbor_value;

                        let x_change = position[0] as f64 - my_position[0];
                        let y_change = position[1] as f64 - my_position[1];

                        json_state[i].direction = Some([x_change, y_change].into());
                    }
                } else if neighbor_value < current_max {
                    current_max = neighbor_value;

                    let x_change = position[0] as f64 - my_position[0];
                    let y_change = position[1] as f64 - my_position[1];

                    json_state[i].direction = Some([x_change, y_change].into());
                }
            }

            // compare within same error
            if (current_max - target_value).abs() <= std::f64::EPSILON {
                json_state[i].direction = Some([].into());
            }
        }
    }

    // Important to call this for continuity of state
    state.set_json_state(json_state)?;
    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/orient_toward_value/orient_toward_value.rs".into(),
        name: "@hash/orient_toward_value/orient_toward_value.rs".into(),
        shortnames: vec!["@hash/orient_toward_value/orient_toward_value.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("orient_toward_value.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::prelude::{AgentState, Context, SimulationResult};
use std::collections::HashMap;

// TODO: investigate if is clippy false pos
#[allow(clippy::map_entry)]
/// # Errors
/// This function can fail when the value to orient to is not a string
pub fn orient_toward_value(state: &mut AgentState, context: &Context) -> SimulationResult<()> {
    if !state["orient_toward_value"].is_string() {
        return Ok(());
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

                if neighbor_map.contains_key(&position) {
                    let old_value = *neighbor_map[&position];
                    let monotone = uphill == (old_value < neighbor_value);
                    if cumulative {
                        neighbor_map.insert(position, old_value + neighbor_value);
                    } else if monotone {
                        neighbor_map.insert(position, neighbor_value);
                    }
                } else {
                    neighbor_map.insert(position, neighbor_value);
                }
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

    Ok(())
}
*/
