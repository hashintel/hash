use super::{error::SimulationError, Context, Result, SharedBehavior, State};

pub fn behavior(state: &mut State<'_>, _context: &Context<'_>) -> Result<()> {
    let mut position = state.take_position()?;

    for (i, direction) in state.direction()?.iter().enumerate() {
        if let Some(dir) = direction {
            let (dx, dy) = (dir.x(), dir.y());
            if let Some(pos) = &mut position[i] {
                pos[0] += dx;
                pos[1] += dy;
            } else {
                Err(SimulationError::from("Expected position to exist on agent"))?;
            }
        }
    }

    state.set_position(position);
    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/move_in_direction/move_in_direction.rs".into(),
        name: "@hash/move_in_direction/move_in_direction.rs".into(),
        shortnames: vec!["@hash/move_in_direction/move_in_direction.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("move_in_direction.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::prelude::{AgentState, Context, SimulationResult};

// deps: 'direction' = a vector (x, y)
// moves the agent in its current direction.
/// # Errors
/// This function cannot fail
pub fn move_in_direction(state: &mut AgentState, _context: &Context) -> SimulationResult<()> {
    if let Some(dir) = &state.direction {
        let (dx, dy) = (dir.x(), dir.y());
        let pos = state.get_pos_mut()?;
        pos[0] += dx;
        pos[1] += dy;
    }

    Ok(())
}
*/
