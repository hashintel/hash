use crate::prelude::{AgentState, Context, SimulationResult};

pub fn age(mut state: AgentState, _context: &Context) -> SimulationResult<AgentState> {
    let age = match state["age"].as_i64() {
        Some(age) => age + 1,
        None => 1,
    };

    state["age"] = json!(age);

    Ok(state)
}
