use serde::Deserialize;
use serde_json::{Value, json};

#[expect(
    clippy::struct_excessive_bools,
    reason = "Each flag enables an independent document extension"
)]
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Extensions {
    pub colors: bool,
    pub stochasticity: bool,
    pub dynamics: bool,
    pub parameters: bool,
    pub subnets: bool,
}

impl Default for Extensions {
    fn default() -> Self {
        Self {
            colors: true,
            stochasticity: true,
            dynamics: true,
            parameters: true,
            subnets: true,
        }
    }
}

pub(crate) fn items<'a>(value: &'a Value, field: &str) -> &'a [Value] {
    value
        .get(field)
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}

pub(crate) fn resolve_place<'a>(
    document: &'a Value,
    net: &'a Value,
    arc: &Value,
    component_ports: bool,
) -> Option<&'a Value> {
    if arc.get("endpoint").unwrap_or(&Value::Null)["kind"] == "componentPort" {
        if !component_ports {
            return None;
        }
        let instance = items(net, "componentInstances").iter().find(|instance| {
            instance["id"] == arc.get("endpoint").unwrap_or(&Value::Null)["componentInstanceId"]
        })?;
        let subnet = items(document, "subnets")
            .iter()
            .find(|subnet| subnet["id"] == instance["subnetId"])?;
        items(subnet, "places").iter().find(|place| {
            place["id"] == arc.get("endpoint").unwrap_or(&Value::Null)["portPlaceId"]
                && place["isPort"] == true
        })
    } else {
        let id = arc
            .get("endpoint")
            .map_or(&arc["placeId"], |endpoint| &endpoint["placeId"]);
        items(net, "places")
            .iter()
            .rev()
            .find(|place| place["id"] == *id)
    }
}

impl Extensions {
    pub(crate) fn sanitize_place(self, place: &mut Value) {
        if !self.colors {
            place["colorId"] = Value::Null;
            if let Some(object) = place.as_object_mut() {
                object.remove("visualizerCode");
            }
        }
        if !self.colors || !self.dynamics {
            place["dynamicsEnabled"] = Value::Bool(false);
            place["differentialEquationId"] = Value::Null;
        }
    }

    pub(crate) fn kernel_available(
        self,
        document: &Value,
        net: &Value,
        transition: &Value,
    ) -> bool {
        self.colors
            && items(transition, "outputArcs").iter().any(|arc| {
                resolve_place(document, net, arc, self.subnets)
                    .is_some_and(|place| !place["colorId"].is_null())
            })
    }

    pub(crate) fn sanitize_transition(self, document: &Value, net: &Value, transition: &mut Value) {
        let predicate = self.stochasticity
            || (self.colors
                && items(transition, "inputArcs").iter().any(|arc| {
                    arc["type"] != "inhibitor"
                        && resolve_place(document, net, arc, self.subnets)
                            .is_some_and(|place| !place["colorId"].is_null())
                }));
        let lambda_type = match transition["lambdaType"].as_str() {
            Some("predicate") if predicate => "predicate",
            _ if self.stochasticity => "stochastic",
            _ => "predicate",
        };
        if !predicate || transition["lambdaType"] != lambda_type {
            transition["lambdaCode"] = json!("");
        }
        transition["lambdaType"] = json!(lambda_type);
        if !self.kernel_available(document, net, transition) {
            transition["transitionKernelCode"] = json!("");
        }
    }

    pub(crate) fn sanitize_document(self, document: &mut Value) {
        // Resolve ports against the same pre-sanitization subnet view as the TypeScript handle.
        let original = document.clone();
        self.sanitize_net(&original, document);
        for scenario in document
            .get_mut("scenarios")
            .and_then(Value::as_array_mut)
            .into_iter()
            .flatten()
        {
            if !self.parameters {
                scenario["parameterOverrides"] = json!({});
            }
            if !self.colors
                && scenario.get("initialState").unwrap_or(&Value::Null)["type"] == "per_place"
                && let Some(content) = scenario
                    .get_mut("initialState")
                    .and_then(|state| state.get_mut("content"))
                    .and_then(Value::as_object_mut)
            {
                for value in content.values_mut() {
                    if let Some(rows) = value.as_array() {
                        *value = json!(rows.len().to_string());
                    }
                }
            }
        }
        // Root edits are visible while subnet policy is applied.
        let root_view = document.clone();
        if let Some(subnets) = document.get_mut("subnets").and_then(Value::as_array_mut) {
            for subnet in subnets {
                self.sanitize_net(&root_view, subnet);
            }
        }
    }

    fn sanitize_net(self, document: &Value, net: &mut Value) {
        if !self.colors {
            net["types"] = json!([]);
        }
        if !self.colors || !self.dynamics {
            net["differentialEquations"] = json!([]);
        }
        if !self.parameters {
            net["parameters"] = json!([]);
        }
        if let Some(places) = net.get_mut("places").and_then(Value::as_array_mut) {
            for place in places {
                self.sanitize_place(place);
            }
        }
        let view = net.clone();
        if let Some(transitions) = net.get_mut("transitions").and_then(Value::as_array_mut) {
            for transition in transitions {
                if !self.subnets {
                    for field in ["inputArcs", "outputArcs"] {
                        if let Some(arcs) = transition.get_mut(field).and_then(Value::as_array_mut)
                        {
                            arcs.retain(|arc| {
                                arc.get("endpoint").unwrap_or(&Value::Null)["kind"]
                                    != "componentPort"
                            });
                        }
                    }
                }
                self.sanitize_transition(document, &view, transition);
            }
        }
    }
}
