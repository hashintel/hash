use super::{error::SimulationError, Context, Result, SharedBehavior, State};

use rand::Rng;

pub fn behavior(state: &mut State<'_>, context: &Context<'_>) -> Result<()> {
    let mut position = state.take_position()?;

    for i in 0..state.num_agents() {
        let neighbors = context.neighbors(i)?;
        if !neighbors.is_empty() {
            let random_neighbor_index = rand::thread_rng().gen_range(0..neighbors.len());
            let random_neighbor = &neighbors[random_neighbor_index];

            let neighbor_pos = random_neighbor.position();
            if let Some(neighbor_pos) = neighbor_pos {
                if let Some(pos) = &mut position[i] {
                    pos["x"] += pos.x() - neighbor_pos.x();
                    pos["y"] += pos.y() - neighbor_pos.y();
                    continue;
                }
            }
            Err(SimulationError::from("Expected position to exist on agent"))?;
        }
    }

    state.set_position(position);

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/random_away_movement/random_away_movement.rs".into(),
        name: "@hash/random_away_movement/random_away_movement.rs".into(),
        shortnames: vec!["@hash/random_away_movement/random_away_movement.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("random_away_movement.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::prelude::{AgentState, Context, SimulationResult};
use rand::Rng;

/// # Errors
/// This function cannot fail
pub fn random_away_movement(state: &mut AgentState, context: &Context) -> SimulationResult<()> {
    let neighbors = &context.neighbors;

    if !neighbors.is_empty() {
        let random_neighbor_index = rand::thread_rng().gen_range(0, neighbors.len());
        let random_neighbor = neighbors[random_neighbor_index];

        let neighbor_pos = random_neighbor.get_pos()?;
        let pos = state.get_pos_mut()?;

        pos["x"] += pos.x() - neighbor_pos.x();
        pos["y"] += pos.y() - neighbor_pos.y();
    }

    Ok(())
}
*/
