use crate::prelude::{AgentState, Context, SimulationResult};

pub fn counter(mut state: AgentState, _context: &Context) -> SimulationResult<AgentState> {
    let mut counter = match state["counter"].as_f64() {
        Some(value) => value,
        None => 0.0,
    };

    let increment = match state["counter_increment"].as_f64() {
        Some(value) => value,
        None => 1.0,
    };

    if let Some(value) = state["counter_reset_at"].as_f64() {
        // compare within same error
        if (counter - value).abs() < std::f64::EPSILON {
            if let Some(reset_value) = state["counter_reset_to"].as_f64() {
                state["counter"] = json!(reset_value);
                return Ok(state);
            }
        }
    }

    counter += increment;
    state["counter"] = json!(counter);

    Ok(state)
}
