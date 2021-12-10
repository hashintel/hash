use super::{Context, Result, SharedBehavior, State};

pub fn behavior(state: &mut State<'_>, _context: &Context<'_>) -> Result<()> {
    let increment_col = state.counter_increment()?;
    let reset_at_col = state.counter_reset_at()?;
    let reset_to_col = state.counter_reset_to()?;
    let counter_col = state.counter()?;
    let mut counter_vec = Vec::with_capacity(increment_col.len());

    for i in 0..counter_col.len() {
        let counter = counter_col[i].unwrap_or(0.0);
        let increment = increment_col[i].unwrap_or(1.0);
        let reset_at = &reset_at_col[i];
        let reset_to = &reset_to_col[i];

        if let Some(value) = reset_at {
            // compare within same error
            if (counter - *value).abs() < std::f64::EPSILON {
                if let Some(reset_value) = reset_to {
                    counter_vec.push(Some(*reset_value));
                    continue;
                }
            }
        }

        counter_vec.push(Some(counter + increment));
    }

    debug_assert_eq!(counter_vec.len(), increment_col.len());
    state.counter_set(counter_vec)?;

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/counter/counter.rs".into(),
        name: "@hash/counter/counter.rs".into(),
        shortnames: vec!["@hash/counter/counter.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("counter.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::prelude::{AgentState, Context, SimulationResult};

/// # Errors
/// This function cannot fail
pub fn counter(state: &mut AgentState, _context: &Context) -> SimulationResult<()> {
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
                return Ok(());
            }
        }
    }

    counter += increment;
    state["counter"] = json!(counter);

    Ok(())
}
*/
