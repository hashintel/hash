use super::{Context, Result, SharedBehavior, State};

pub fn behavior(state: &mut State<'_>, context: &Context<'_>) -> Result<()> {
    let alive = state.alive_mut()?;
    alive
        .iter_mut()
        .enumerate()
        .try_for_each::<_, Result<()>>(|(i, agent_alive)| {
            let neighbors = context.neighbors(i)?;
            let live_neighbors = neighbors.iter().filter(|neighbor| neighbor.alive()).count();

            let is_alive = if *agent_alive {
                !(live_neighbors < 2 || live_neighbors > 3)
            } else {
                live_neighbors == 3
            };

            *agent_alive = is_alive;
            Ok(())
        })?;
    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/conway/conway.rs".into(),
        name: "@hash/conway/conway.rs".into(),
        shortnames: vec!["@hash/conway/conway.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("conway.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::prelude::{AgentState, Context, SimulationResult};

/// Implements Conway's Game of Life rules for an agent.
/// Depends on the agent and its neighbors having position, and alive properties.
/// This version assumes that each "Grid cell" will be an agent.
///
/// # Errors
/// `conway` will error if there is no `alive` field in the `AgentState`
pub fn conway(state: &mut AgentState, context: &Context) -> SimulationResult<()> {
    // Every cell interacts with its eight neighbors, which are the cells that are horizontally, vertically, or diagonally adjacent. At each step in time, the following transitions occur:

    // Any live cell with fewer than two live neighbors dies, as if by underpopulation.
    // Any live cell with two or three live neighbors lives on to the next generation.
    // Any live cell with more than three live neighbors dies, as if by overpopulation.
    // Any dead cell with exactly three live neighbors becomes a live cell, as if by reproduction.
    // --    https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life

    let alive = state["alive"]
        .as_bool()
        .ok_or("Expected 'alive' in agent state")?;

    let live_neighbors = context
        .neighbors
        .iter()
        .filter(|neighbor| match neighbor["alive"].as_bool() {
            Some(alive) => alive,
            None => false,
        })
        .count();

    let is_alive = if alive {
        !(live_neighbors < 2 || live_neighbors > 3)
    } else {
        live_neighbors == 3
    };

    if is_alive == alive {
        // no modifications.
        return Ok(());
    }

    state["alive"] = json!(is_alive);

    Ok(())
}
*/
