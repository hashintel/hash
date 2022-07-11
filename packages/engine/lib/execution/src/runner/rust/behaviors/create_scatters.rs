use super::{Context, Result, SharedBehavior, State};
use rand::Rng;
use serde_json::json;

pub fn behavior(state: &mut State, context: &Context) -> Result<()> {
    let globals = &context.globals();
    let topology = globals
        .get("topology")
        .ok_or_else(|| "Topology is missing yet it was required")?;

    let x_bounds = topology
        .get("x_bounds")
        .ok_or_else(|| "Topology x_bounds is missing yet it was required")?;

    let y_bounds = topology
        .get("y_bounds")
        .ok_or_else(|| "Topology y_bounds is missing yet it was required")?;

    let width = x_bounds[1].as_f64().ok_or("x_bounds[1] is not a number")?
        - x_bounds[0].as_f64().ok_or("x_bounds[0] is not a number")?;
    let height = y_bounds[1].as_f64().ok_or("y_bounds[1] is not a number")?
        - y_bounds[0].as_f64().ok_or("y_bounds[0] is not a number")?;

    for i in 0..state.num_agents() {
        if let Some(scatter_templates) = &state.scatter_templates()?[i] {
            let mut agents = json!({});
            if let Some(state_agents) = &state.agents()?[i] {
                if let Some(agent_object) = state_agents.as_object() {
                    agents = json!(agent_object);
                }
            }
            if let Some(template_array) = scatter_templates.as_array() {
                for scatter_template in template_array {
                    let template_name = scatter_template["template_name"]
                        .as_str()
                        .ok_or("template_name is not a string")?;
                    agents[template_name] = json!([]);

                    for _ in 0..scatter_template["template_count"]
                        .as_f64()
                        .ok_or("template_count is not a number")?
                        as i64
                    {
                        let x = (rand::thread_rng().gen_range(0.0..1.0) * width).floor()
                            + x_bounds[0].as_f64().ok_or("x_bounds[0] is not a number")?;
                        let y = (rand::thread_rng().gen_range(0.0..1.0) * height).floor()
                            + y_bounds[0].as_f64().ok_or("y_bounds[0] is not a number")?;

                        let mut template = scatter_template.clone();
                        template["position"] = json!([x, y]);
                        if let Some(template_object) = template.as_object_mut() {
                            template_object.remove("template_name");
                            template_object.remove("template_count");
                        }
                        if let Some(agent_array) = agents[template_name].as_array_mut() {
                            agent_array.push(template);
                        }
                    }
                }
            }
            state.agents_mut()?[i] = Some(agents);
        }
    }

    Ok(())
}

pub fn get_named_behavior() -> SharedBehavior {
    SharedBehavior {
        id: "@hash/create_scatters/create_scatters.rs".into(),
        name: "@hash/create_scatters/create_scatters.rs".into(),
        shortnames: vec!["@hash/create_scatters/create_scatters.rs".into()],
        behavior_src: None,
        behavior_keys_src: Some(include_str!("create_scatters.rs.json").to_string()),
    }
}

// Original Source
/*
use crate::prelude::{AgentState, Context, SimulationResult};
use rand::Rng;

/// # Errors
/// This function will fail if
/// 1. `topology` is not available in `globals`
/// 2. `x_bounds` or `y_bounds` is missing from `topology` or they do not start with numbers
/// 3. `template_name` is not a string
/// 4. `template_count` is not a number
pub fn create_scatters(state: &mut AgentState, context: &Context) -> SimulationResult<()> {
    let globals = context.globals;
    let topology = globals
        .get("topology")
        .ok_or_else(|| "Topology is missing yet it was required")?;

    let x_bounds = topology
        .get("x_bounds")
        .ok_or_else(|| "Topology x_bounds is missing yet it was required")?;

    let y_bounds = topology
        .get("y_bounds")
        .ok_or_else(|| "Topology y_bounds is missing yet it was required")?;

    let width = x_bounds[1].as_f64().ok_or("x_bounds[1] is not a number")?
        - x_bounds[0].as_f64().ok_or("x_bounds[0] is not a number")?;
    let height = y_bounds[1].as_f64().ok_or("y_bounds[1] is not a number")?
        - y_bounds[0].as_f64().ok_or("y_bounds[0] is not a number")?;

    if let Some(scatter_templates) = state.get_custom::<serde_json::Value>("scatter_templates") {
        let mut agents = json!({});
        if let Some(state_agents) = state.get_custom::<serde_json::Value>("agents") {
            if let Some(agent_object) = state_agents.as_object() {
                agents = json!(agent_object);
            }
        }
        if let Some(template_array) = scatter_templates.as_array() {
            for scatter_template in template_array {
                let template_name = scatter_template["template_name"]
                    .as_str()
                    .ok_or("template_name is not a string")?;
                agents[template_name] = json!([]);

                for _ in 0..scatter_template["template_count"]
                    .as_f64()
                    .ok_or("template_count is not a number")? as i64
                {
                    let x = (rand::thread_rng().gen_range(0.0, 1.0) * width).floor()
                        + x_bounds[0].as_f64().ok_or("x_bounds[0] is not a number")?;
                    let y = (rand::thread_rng().gen_range(0.0, 1.0) * height).floor()
                        + y_bounds[0].as_f64().ok_or("y_bounds[0] is not a number")?;

                    let mut template = scatter_template.clone();
                    template["position"] = json!([x, y]);
                    if let Some(template_object) = template.as_object_mut() {
                        template_object.remove("template_name");
                        template_object.remove("template_count");
                    }
                    if let Some(agent_array) = agents[template_name].as_array_mut() {
                        agent_array.push(template);
                    }
                }
            }
        }
        state.set("agents", json!(agents))?;
    }

    Ok(())
}
*/
