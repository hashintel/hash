use alloc::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tsify::Tsify;

use crate::{
    ArcEndpoint, Extensions,
    document::{items_mut, net_mut, text},
    kernel::sanitize_all_transitions,
    model::validation::canonical_id,
    places::remove_port_arcs,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub enum ItemKind {
    Place,
    Transition,
    Arc,
    ComponentInstance,
    Type,
    DifferentialEquation,
    Parameter,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(deny_unknown_fields)]
pub struct SelectedItem {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: ItemKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteItems {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub items: Vec<SelectedItem>,
}

fn canonical_side(side: &str) -> String {
    if let Some(place) = side
        .strip_prefix("place:")
        .filter(|place| !place.is_empty())
    {
        return format!("place:{}", canonical_id(place));
    }
    if let Some(rest) = side.strip_prefix("componentPort:")
        && let Some((instance, port)) = rest.split_once(':')
        && !instance.is_empty()
        && !port.is_empty()
    {
        return format!(
            "componentPort:{}:{}",
            canonical_id(instance),
            canonical_id(port)
        );
    }
    canonical_id(side)
}

fn canonical_arc(id: &str) -> String {
    let Some((source, target)) = id.strip_prefix("$A_").and_then(|id| id.split_once("___")) else {
        return id.to_owned();
    };
    let target = target.split("___").next().unwrap_or_default();
    if source.is_empty() || target.is_empty() {
        return id.to_owned();
    }
    format!("$A_{}___{}", canonical_side(source), canonical_side(target))
}

impl DeleteItems {
    pub(crate) fn normalized(&self) -> Result<Self, String> {
        if self.target_subnet_id.as_deref() == Some("")
            || self.items.iter().any(|item| item.id.is_empty())
        {
            return Err("Selected item identifiers must not be empty".to_owned());
        }
        Ok(Self {
            target_subnet_id: self.target_subnet_id.as_deref().map(canonical_id),
            items: self
                .items
                .iter()
                .map(|item| SelectedItem {
                    kind: item.kind,
                    id: if item.kind == ItemKind::Arc {
                        canonical_arc(&item.id)
                    } else {
                        canonical_id(&item.id)
                    },
                })
                .collect(),
        })
    }

    pub(crate) fn apply(&self, document: &mut Value, extensions: Extensions) -> Result<(), String> {
        let ids = |kind| {
            self.items
                .iter()
                .filter(|item| item.kind == kind)
                .map(|item| item.id.clone())
                .collect::<BTreeSet<_>>()
        };
        let places = ids(ItemKind::Place);
        let transitions = ids(ItemKind::Transition);
        let arcs = ids(ItemKind::Arc);
        let components = ids(ItemKind::ComponentInstance);
        let types = ids(ItemKind::Type);
        let equations = ids(ItemKind::DifferentialEquation);
        let parameters = ids(ItemKind::Parameter);
        let canvas = !places.is_empty()
            || !transitions.is_empty()
            || !arcs.is_empty()
            || !components.is_empty();
        let target = net_mut(document, self.target_subnet_id.as_deref())?;
        delete_arcs(target, &transitions, &arcs, &places, &components)?;
        let mut removed_places = Vec::new();
        items_mut(target, "places")?.retain(|place| {
            if places.contains(text(place, "id")) {
                removed_places.push(text(place, "id").to_owned());
                false
            } else {
                true
            }
        });
        for (field, removed) in [
            ("componentInstances", &components),
            ("types", &types),
            ("differentialEquations", &equations),
            ("parameters", &parameters),
        ] {
            if let Some(values) = target.get_mut(field).and_then(Value::as_array_mut) {
                values.retain(|value| !removed.contains(text(value, "id")));
            }
        }
        for place in items_mut(target, "places")? {
            if types.contains(text(place, "colorId")) {
                place["colorId"] = Value::Null;
            }
            if equations.contains(text(place, "differentialEquationId")) {
                place["differentialEquationId"] = Value::Null;
            }
        }
        for equation in items_mut(target, "differentialEquations")? {
            if types.contains(text(equation, "colorId")) {
                equation["colorId"] = Value::Null;
            }
        }
        if let Some(subnet_id) = &self.target_subnet_id {
            for place_id in removed_places {
                remove_port_arcs(document, subnet_id, &place_id);
                for subnet in document
                    .get_mut("subnets")
                    .and_then(Value::as_array_mut)
                    .into_iter()
                    .flatten()
                {
                    remove_port_arcs(subnet, subnet_id, &place_id);
                }
            }
        }
        if canvas || !types.is_empty() {
            sanitize_all_transitions(document, extensions);
        }
        Ok(())
    }
}

fn delete_arcs(
    target: &mut Value,
    transitions: &BTreeSet<String>,
    arcs: &BTreeSet<String>,
    places: &BTreeSet<String>,
    components: &BTreeSet<String>,
) -> Result<(), String> {
    items_mut(target, "transitions")?
        .retain(|transition| !transitions.contains(text(transition, "id")));
    for transition in items_mut(target, "transitions")? {
        let transition_id = text(transition, "id").to_owned();
        for field in ["inputArcs", "outputArcs"] {
            items_mut(transition, field)?.retain(|arc| {
                let Some(endpoint) = ArcEndpoint::from_arc(arc) else {
                    return true;
                };
                let key = match endpoint {
                    ArcEndpoint::Place { place_id } => {
                        if places.contains(&place_id) {
                            return false;
                        }
                        format!("place:{place_id}")
                    }
                    ArcEndpoint::ComponentPort {
                        component_instance_id,
                        port_place_id,
                    } => {
                        if components.contains(&component_instance_id) {
                            return false;
                        }
                        format!("componentPort:{component_instance_id}:{port_place_id}")
                    }
                };
                let id = if field == "inputArcs" {
                    format!("$A_{key}___{transition_id}")
                } else {
                    format!("$A_{transition_id}___{key}")
                };
                !arcs.contains(&id)
            });
        }
    }
    Ok(())
}
