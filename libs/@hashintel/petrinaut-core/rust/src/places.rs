use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{
    Extensions, Place,
    document::{items_mut, net_mut, text},
    entity::{PLACE_UPDATE_FIELDS, apply_update, validate_update},
    extensions::items,
    kernel::sanitize_all_transitions,
};

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddPlace {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub place: Place,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdatePlace {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub place_id: String,
    #[tsify(type = "Record<string, JsonValue>")]
    pub update: Map<String, Value>,
    #[serde(default)]
    pub unset: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemovePlace {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub place_id: String,
}

pub(crate) fn validate_dynamics(place: &Value, net: &Value) -> Result<(), String> {
    if place["differentialEquationId"].is_null() {
        return Ok(());
    }
    let name = text(place, "name");
    let equation_id = text(place, "differentialEquationId");
    let equation = items(net, "differentialEquations")
        .iter()
        .find(|equation| equation["id"] == equation_id)
        .ok_or_else(|| {
            format!(
                "Place `{name}` references differential equation ID `{equation_id}` which does \
                 not exist."
            )
        })?;
    let equation_color = text(equation, "colorId");
    if place["colorId"].is_null() {
        return Err(format!(
            "Place `{name}` has a differential equation but no `colorId`. Set the place's \
             `colorId` to match the equation's `colorId` (`{equation_color}`)."
        ));
    }
    if !equation["colorId"].is_null() && equation["colorId"] != place["colorId"] {
        let color = text(place, "colorId");
        let equation_name = text(equation, "name");
        return Err(format!(
            "Place `{name}` (colorId `{color}`) references differential equation \
             `{equation_name}` (colorId `{equation_color}`); the equation's `colorId` must match \
             the place's `colorId`."
        ));
    }
    Ok(())
}

impl AddPlace {
    pub(crate) fn apply(&self, document: &mut Value, extensions: Extensions) -> Result<(), String> {
        let net = net_mut(document, self.target_subnet_id.as_deref())?;
        let mut place = self.place.as_value().clone();
        extensions.sanitize_place(&mut place);
        validate_dynamics(&place, net)?;
        items_mut(net, "places")?.push(place);
        Ok(())
    }
}

impl UpdatePlace {
    pub(crate) fn apply(&self, document: &mut Value, extensions: Extensions) -> Result<(), String> {
        validate_update(&self.update, PLACE_UPDATE_FIELDS)?;
        let net = net_mut(document, self.target_subnet_id.as_deref())?;
        let Some(index) = items(net, "places")
            .iter()
            .position(|place| place["id"] == self.place_id)
        else {
            return Ok(());
        };
        let mut place = items(net, "places")
            .get(index)
            .ok_or("Place index is invalid")?
            .clone();
        apply_update(&mut place, &self.update, &self.unset, PLACE_UPDATE_FIELDS)?;
        extensions.sanitize_place(&mut place);
        let place = Place::try_from(place)?.into_value();
        validate_dynamics(&place, net)?;
        *items_mut(net, "places")?
            .get_mut(index)
            .ok_or("Place index is invalid")? = place;
        sanitize_all_transitions(document, extensions);
        Ok(())
    }
}

fn retain_arcs(net: &mut Value, keep: impl Fn(&Value) -> bool) {
    if let Some(transitions) = net.get_mut("transitions").and_then(Value::as_array_mut) {
        for transition in transitions {
            for direction in ["inputArcs", "outputArcs"] {
                if let Some(arcs) = transition.get_mut(direction).and_then(Value::as_array_mut) {
                    arcs.retain(&keep);
                }
            }
        }
    }
}

fn remove_port_arcs(net: &mut Value, subnet_id: &str, place_id: &str) {
    let instances: Vec<Value> = items(net, "componentInstances")
        .iter()
        .filter(|instance| instance["subnetId"] == subnet_id)
        .map(|instance| instance["id"].clone())
        .collect();
    retain_arcs(net, |arc| {
        let endpoint = arc.get("endpoint").unwrap_or(&Value::Null);
        !(endpoint["kind"] == "componentPort"
            && endpoint["portPlaceId"] == place_id
            && instances.contains(&endpoint["componentInstanceId"]))
    });
}

impl RemovePlace {
    pub(crate) fn apply(&self, document: &mut Value, extensions: Extensions) -> Result<(), String> {
        let net = net_mut(document, self.target_subnet_id.as_deref())?;
        let places = items_mut(net, "places")?;
        let Some(index) = places.iter().position(|place| place["id"] == self.place_id) else {
            return Ok(());
        };
        places.remove(index);
        retain_arcs(net, |arc| {
            arc.get("endpoint")
                .map_or(arc["placeId"] != self.place_id, |endpoint| {
                    endpoint["kind"] != "place" || endpoint["placeId"] != self.place_id
                })
        });
        if let Some(subnet_id) = &self.target_subnet_id {
            remove_port_arcs(document, subnet_id, &self.place_id);
            if let Some(subnets) = document.get_mut("subnets").and_then(Value::as_array_mut) {
                for subnet in subnets {
                    remove_port_arcs(subnet, subnet_id, &self.place_id);
                }
            }
        }
        sanitize_all_transitions(document, extensions);
        Ok(())
    }
}
