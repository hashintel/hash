use rand::Rng;

use super::{
    accessors::field_or_property, error::SimulationError, Context, Result, SharedBehavior, State,
};

pub fn behavior(state: &mut State<'_>, context: &Context<'_>) -> Result<()> {
    fn get_satisfaction(neighbor_count: i64, min_neighbors: i64, max_neighbors: i64) -> bool {
        let min_satisfied = neighbor_count >= min_neighbors;
        let min_defined = min_neighbors >= 0;
        let max_satisfied = neighbor_count <= max_neighbors;
        let max_defined = max_neighbors >= 0;

        // Both defined; both need to be satisfied.
        if min_defined && max_defined {
            return min_satisfied && max_satisfied;
        }

        // only min defined? only need to satisfy it.
        if min_defined {
            return min_satisfied;
        }

        // only max defined? only need to satisfy it.
        if max_defined {
            return max_satisfied;
        }

        // No checks defined; can't get no satisfaction.
        false
    }

    // Take a step forward, backwards, or nowhere by step_size.
    fn step(step_size: f64) -> f64 {
        let mod3 = rand::thread_rng().gen::<u8>() % 3;
        if mod3 == 0 {
            step_size
        } else if mod3 == 1 {
            -step_size
        } else {
            0.0
        }
    }

    let globals = &context.globals;

    let random_movement_seek_min_neighbors_property =
        globals.get("random_movement_seek_min_neighbors").cloned();
    let random_movement_seek_max_neighbors_property =
        globals.get("random_movement_seek_max_neighbors").cloned();
    let random_movement_step_size_property = globals.get("random_movement_step_size").cloned();

    let mut position = state.take_position()?;

    for i in 0..state.num_agents() {
        // If min and/or max neighbors are defined, move until our neighbor count is within those
        // bounds. if one or the other is undefined, it's open-ended.
        let neighbor_count = context.neighbors(i)?.len() as i64;
        let min_neighbors: i64 = field_or_property(
            &state.random_movement_seek_min_neighbors()?[i],
            &random_movement_seek_min_neighbors_property,
            -1.0,
        )? as i64;

        let max_neighbors: i64 = field_or_property(
            &state.random_movement_seek_max_neighbors()?[i],
            &random_movement_seek_max_neighbors_property,
            -1.0,
        )? as i64;

        if get_satisfaction(neighbor_count, min_neighbors, max_neighbors) {
            // Our neighbor metrics are satisfied, no need to move.
            continue;
        }

        let step_size = field_or_property(
            &state.random_movement_step_size()?[i],
            &random_movement_step_size_property,
            1.0,
        )?;

        if let Some(pos) = &mut position[i] {
            pos["x"] += step(step_size);
            pos["y"] += step(step_size);
        } else {
            Err(SimulationError::from("Expected position to exist on agent"))?;
        }
    }

    state.set_position(position);

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/random_movement/random_movement.rs".into(),
        name: "@hash/random_movement/random_movement.rs".into(),
        shortnames: vec!["@hash/random_movement/random_movement.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("random_movement.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::{
    behaviors::get_state_or_property,
    prelude::{AgentState, Context, SimulationResult},
};
use rand::Rng;

/// # Errors
/// This function cannot fail
pub fn random_movement(state: &mut AgentState, context: &Context) -> SimulationResult<()> {
    fn get_satisfaction(neighbor_count: i64, min_neighbors: i64, max_neighbors: i64) -> bool {
        let min_satisfied = neighbor_count >= min_neighbors;
        let min_defined = min_neighbors >= 0;
        let max_satisfied = neighbor_count <= max_neighbors;
        let max_defined = max_neighbors >= 0;

        // Both defined; both need to be satisfied.
        if min_defined && max_defined {
            return min_satisfied && max_satisfied;
        }

        // only min defined? only need to satisfy it.
        if min_defined {
            return min_satisfied;
        }

        // only max defined? only need to satisfy it.
        if max_defined {
            return max_satisfied;
        }

        // No checks defined; can't get no satisfaction.
        false
    }

    // Take a step forward, backwards, or nowhere by step_size.
    fn step(step_size: f64) -> f64 {
        let mod3 = rand::thread_rng().gen::<u8>() % 3;
        if mod3 == 0 {
            step_size
        } else if mod3 == 1 {
            -step_size
        } else {
            0.0
        }
    }

    // If min and/or max neighbors are defined, move until our neighbor count is within those bounds.
    // if one or the other is undefined, it's open-ended.
    let neighbor_count = context.neighbors.len() as i64;
    let min_neighbors: i64 =
        get_state_or_property(&state, &context, "random_movement_seek_min_neighbors", -1);

    let max_neighbors: i64 =
        get_state_or_property(&state, &context, "random_movement_seek_max_neighbors", -1);

    if get_satisfaction(neighbor_count, min_neighbors, max_neighbors) {
        // Our neighbor metrics are satisfied, no need to move.
        return Ok(());
    }

    let step_size: f64 = get_state_or_property(&state, &context, "random_movement_step_size", 1.0);

    let pos = state.get_pos_mut()?;
    pos["x"] += step(step_size);
    pos["y"] += step(step_size);

    Ok(())
}
*/
