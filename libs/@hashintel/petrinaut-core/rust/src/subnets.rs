use alloc::collections::BTreeSet;

use serde_json::Value;

use crate::{
    Extensions,
    definitions::{self, CreateEntity, EntityTarget, UpdateEntity},
    document::{net, net_mut, text},
    extensions::items,
    model::ComponentData,
    places::retain_arcs,
};

fn validate_component(document: &Value, instance: &Value) -> Result<(), String> {
    let name = text(instance, "name");
    let subnet_id = text(instance, "subnetId");
    let subnet = items(document, "subnets")
        .iter()
        .find(|subnet| subnet["id"] == subnet_id)
        .ok_or_else(|| {
            format!(
                "Component instance `{name}` references subnet ID `{subnet_id}` which does not \
                 exist."
            )
        })?;
    if let Some(values) = instance.get("parameterValues").and_then(Value::as_object) {
        for id in values.keys() {
            if !items(subnet, "parameters")
                .iter()
                .any(|parameter| parameter["id"] == *id)
            {
                return Err(format!(
                    "Component instance `{name}` provides a value for unknown subnet parameter ID \
                     `{id}`."
                ));
            }
        }
    }
    Ok(())
}

pub(crate) fn create_component(
    document: &mut Value,
    input: &CreateEntity<ComponentData>,
    extensions: Extensions,
) -> Result<(), String> {
    let value = serde_json::to_value(&input.entity).map_err(|error| error.to_string())?;
    net(document, input.target_subnet_id.as_deref())?;
    validate_component(document, &value)?;
    definitions::create(document, "componentInstances", input, extensions)
}

pub(crate) fn update_component(
    document: &mut Value,
    input: &UpdateEntity,
    extensions: Extensions,
) -> Result<(), String> {
    definitions::update(document, "componentInstances", input, extensions)?;
    if let Some(instance) = items(
        net(document, input.target.target_subnet_id.as_deref())?,
        "componentInstances",
    )
    .iter()
    .find(|instance| instance["id"] == input.target.id)
    {
        validate_component(document, instance)?;
    }
    Ok(())
}

pub(crate) fn remove_component_arcs(net: &mut Value, ids: &BTreeSet<String>) {
    retain_arcs(net, |arc| {
        arc.get("endpoint").is_none_or(|endpoint| {
            endpoint["kind"] != "componentPort"
                || !ids.contains(text(endpoint, "componentInstanceId"))
        })
    });
}

pub(crate) fn remove_component(document: &mut Value, input: &EntityTarget) -> Result<(), String> {
    let target = net_mut(document, input.target_subnet_id.as_deref())?;
    if let Some(instances) = target
        .get_mut("componentInstances")
        .and_then(Value::as_array_mut)
        && let Some(index) = instances
            .iter()
            .position(|instance| instance["id"] == input.id)
    {
        instances.remove(index);
        remove_component_arcs(target, &BTreeSet::from([input.id.clone()]));
    }
    Ok(())
}

fn remove_instances(net: &mut Value, subnet_id: &str) {
    let mut removed = BTreeSet::new();
    if let Some(instances) = net
        .get_mut("componentInstances")
        .and_then(Value::as_array_mut)
    {
        instances.retain(|instance| {
            if instance["subnetId"] == subnet_id {
                removed.insert(text(instance, "id").to_owned());
                false
            } else {
                true
            }
        });
    }
    remove_component_arcs(net, &removed);
}

pub(crate) fn remove_subnet(document: &mut Value, input: &EntityTarget) {
    if let Some(subnets) = document.get_mut("subnets").and_then(Value::as_array_mut)
        && let Some(index) = subnets.iter().position(|subnet| subnet["id"] == input.id)
    {
        subnets.remove(index);
        for subnet in subnets {
            remove_instances(subnet, &input.id);
        }
        remove_instances(document, &input.id);
    }
}
