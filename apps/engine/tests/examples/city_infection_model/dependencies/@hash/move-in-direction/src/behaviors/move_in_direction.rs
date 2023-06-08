use crate::prelude::{AgentState, Context, SimulationResult};

// deps: 'direction' = a vector (x, y)
// moves the agent in its current direction.
pub fn move_in_direction(
    mut state: AgentState,
    _context: &Context,
) -> SimulationResult<AgentState> {
    if let Some(dir) = &state.direction {
        let (dx, dy) = (dir.x(), dir.y());
        let pos = state.get_pos_mut()?;
        pos[0] += dx;
        pos[1] += dy;
    }

    Ok(state)
}
