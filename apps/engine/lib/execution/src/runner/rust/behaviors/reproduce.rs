use super::super::OutboundMessage;
use super::{Context, Result, SharedBehavior, State};

use rand::Rng;

pub fn behavior(state: &mut State<'_>, _context: &Context<'_>) -> Result<()> {
    let mut messages = state.take_messages()?;
    let children = state.child()?;
    for (i, mut child) in children.into_iter().enumerate() {
        let rate = match state.reproduction_rate()?[i] {
            Some(rate) => rate,
            None => 1.0,
        };

        let mut num_children = (rate / 1.0) as i64;

        let chance = rate - (num_children as f64);

        if rand::thread_rng().gen_range(0.0..1.0) < chance {
            num_children += 1;
        }

        if let Some(map) = &state.reproduction_child_values()?[i]
            .as_ref()
            .map(|v| v.as_object())
            .flatten()
        {
            for (key, value) in *map {
                child.set(key, value.clone()).map_err(|e| e.to_string())?;
            }
        }

        for _x in 0..num_children {
            messages[i].push(OutboundMessage::create_agent(child.clone()));
        }
    }
    state.set_messages(messages);
    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/reproduce/reproduce.rs".into(),
        name: "@hash/reproduce/reproduce.rs".into(),
        shortnames: vec!["@hash/reproduce/reproduce.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("reproduce.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::prelude::{AgentState, Context, OutboundMessage, SimulationResult};
use rand::Rng;

/// # Errors
/// This function cannot fail
pub fn reproduce(state: &mut AgentState, _context: &Context) -> SimulationResult<()> {
    let rate = match state["reproduction_rate"].as_f64() {
        Some(rate) => rate,
        None => 1.0,
    };

    let mut num_children = (rate / 1.0) as i64;

    let chance = rate - (num_children as f64);

    if rand::thread_rng().gen_range(0.0, 1.0) < chance {
        num_children += 1;
    }

    let mut child = state.child();
    if let Some(map) = state["reproduction_child_values"].as_object() {
        for (key, value) in map {
            child.set(key, value.clone())?;
        }
    }

    for _x in 0..num_children {
        state
            .messages
            .push(OutboundMessage::create_agent(child.child()));
    }

    Ok(())
}
*/
