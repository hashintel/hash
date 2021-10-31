use super::{Context, Result, SharedBehavior, State};

pub fn behavior(state: &mut State<'_>, _context: &Context<'_>) -> Result<()> {
    let age = state.age_mut()?;
    age.iter_mut().for_each(|opt| {
        if let Some(v) = opt {
            *v += 1.0;
        } else {
            *opt = Some(1.0);
        }
    });
    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/age/age.rs".into(),
        name: "@hash/age/age.rs".into(),
        shortnames: vec!["@hash/age/age.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("age.rs.json").to_string()),
    }
}

// Original Source
/*
    use crate::prelude::{AgentState, Context, SimulationResult};

    /// # Errors
    /// This function will not error
    pub fn age(state: &mut AgentState, _context: &Context) -> SimulationResult<()> {
        let age = match state["age"].as_i64() {
            Some(age) => age + 1,
            None => 1,
        };

        state["age"] = json!(age);

        Ok(())
    }
*/
