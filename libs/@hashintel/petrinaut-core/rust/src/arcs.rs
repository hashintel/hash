use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    Extensions,
    document::{items_mut, net, net_mut, text},
    extensions::items,
    kernel::sanitize_transition,
};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq, tsify::Tsify)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ArcEndpoint {
    Place {
        place_id: String,
    },
    ComponentPort {
        component_instance_id: String,
        port_place_id: String,
    },
}

impl ArcEndpoint {
    pub(crate) fn validate(&self) -> Result<(), String> {
        let valid = match self {
            Self::Place { place_id } => !place_id.is_empty(),
            Self::ComponentPort {
                component_instance_id,
                port_place_id,
            } => !component_instance_id.is_empty() && !port_place_id.is_empty(),
        };
        if valid {
            Ok(())
        } else {
            Err("Arc endpoint IDs must not be empty".to_owned())
        }
    }

    fn from_arc(arc: &Value) -> Option<Self> {
        arc.get("endpoint").map_or_else(
            || {
                arc["placeId"].as_str().map(|id| Self::Place {
                    place_id: id.to_owned(),
                })
            },
            |endpoint| serde_json::from_value(endpoint.clone()).ok(),
        )
    }

    fn set_reference(&self, arc: &mut Value) -> Result<(), String> {
        let fields = arc.as_object_mut().ok_or("Arc must be an object")?;
        fields.remove("placeId");
        fields.remove("endpoint");
        match self {
            Self::Place { place_id } => {
                fields.insert("placeId".to_owned(), json!(place_id));
            }
            Self::ComponentPort { .. } => {
                fields.insert("endpoint".to_owned(), json!(self));
            }
        }
        Ok(())
    }

    fn validate_reference(&self, document: &Value, target: &Value) -> Result<(), String> {
        self.validate()?;
        match self {
            Self::Place { place_id } => {
                if !items(target, "places")
                    .iter()
                    .any(|place| place["id"] == *place_id)
                {
                    return Err(format!(
                        "Arc references place ID `{place_id}` which does not exist in the target \
                         net."
                    ));
                }
            }
            Self::ComponentPort {
                component_instance_id,
                port_place_id,
            } => {
                let instance = items(target, "componentInstances")
                    .iter()
                    .find(|instance| instance["id"] == *component_instance_id)
                    .ok_or_else(|| {
                        format!(
                            "Arc references component instance ID `{component_instance_id}` which \
                             does not exist in the target net."
                        )
                    })?;
                let instance_name = text(instance, "name");
                let subnet_id = text(instance, "subnetId");
                let subnet = items(document, "subnets")
                    .iter()
                    .find(|subnet| subnet["id"] == subnet_id)
                    .ok_or_else(|| {
                        format!(
                            "Arc references component instance `{instance_name}`, but its subnet \
                             ID `{subnet_id}` does not exist."
                        )
                    })?;
                let subnet_name = text(subnet, "name");
                let port = items(subnet, "places")
                    .iter()
                    .find(|place| place["id"] == *port_place_id)
                    .ok_or_else(|| {
                        format!(
                            "Arc references subnet port place ID `{port_place_id}` which does not \
                             exist in subnet `{subnet_name}`."
                        )
                    })?;
                if port["isPort"] != true {
                    let name = text(port, "name");
                    return Err(format!(
                        "Arc references subnet place `{name}`, but only places marked `isPort` \
                         can be used as component ports."
                    ));
                }
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Serialize, tsify::Tsify)]
#[serde(rename_all = "camelCase")]
pub enum ArcDirection {
    Input,
    Output,
}

impl ArcDirection {
    const fn field(self) -> &'static str {
        match self {
            Self::Input => "inputArcs",
            Self::Output => "outputArcs",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, tsify::Tsify)]
#[serde(rename_all = "camelCase")]
pub enum InputArcType {
    #[default]
    Standard,
    Read,
    Inhibitor,
}

impl InputArcType {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Standard => "standard",
            Self::Read => "read",
            Self::Inhibitor => "inhibitor",
        }
    }
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArcTarget {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[tsify(type = "string | null")]
    pub target_subnet_id: Option<String>,
    pub transition_id: String,
    pub arc_direction: ArcDirection,
    pub endpoint: ArcEndpoint,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AddArc {
    pub target: ArcTarget,
    pub weight: f64,
    #[serde(rename = "type")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arc_type: Option<InputArcType>,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateArcWeight {
    pub target: ArcTarget,
    pub weight: f64,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateArcType {
    pub target: ArcTarget,
    #[serde(rename = "type")]
    pub arc_type: InputArcType,
}

#[derive(Debug, Deserialize, Serialize, tsify::Tsify, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateArcPlace {
    pub target: ArcTarget,
    pub new_endpoint: ArcEndpoint,
}

pub(crate) enum ArcEdit<'a> {
    Add {
        weight: f64,
        arc_type: Option<InputArcType>,
    },
    Remove,
    Weight(f64),
    Type(InputArcType),
    Endpoint(&'a ArcEndpoint),
}

impl ArcTarget {
    pub(crate) fn apply(
        &self,
        document: &mut Value,
        extensions: Extensions,
        edit: &ArcEdit<'_>,
    ) -> Result<(), String> {
        self.endpoint.validate()?;
        if self.transition_id.is_empty() {
            return Err("Transition ID must not be empty".to_owned());
        }
        if let ArcEdit::Add { weight, .. } | ArcEdit::Weight(weight) = edit
            && (!weight.is_finite() || *weight <= 0.0)
        {
            return Err("Arc weight must be a positive finite number".to_owned());
        }
        if self.arc_direction == ArcDirection::Output
            && matches!(
                edit,
                ArcEdit::Type(_)
                    | ArcEdit::Add {
                        arc_type: Some(_),
                        ..
                    }
            )
        {
            return Err("Output arcs do not have an input arc type".to_owned());
        }
        let target = net(document, self.target_subnet_id.as_deref())?;
        match edit {
            ArcEdit::Add { .. } => self.endpoint.validate_reference(document, target)?,
            ArcEdit::Endpoint(endpoint) => endpoint.validate_reference(document, target)?,
            ArcEdit::Remove | ArcEdit::Weight(_) | ArcEdit::Type(_) => {}
        }
        let Some((index, transition)) = items(target, "transitions")
            .iter()
            .enumerate()
            .find(|(_, transition)| transition["id"] == self.transition_id)
        else {
            return if matches!(edit, ArcEdit::Add { .. }) {
                Err(format!(
                    "Arc references transition ID `{}` which does not exist in the target net.",
                    self.transition_id
                ))
            } else {
                Ok(())
            };
        };
        let mut transition = transition.clone();
        let arcs = items_mut(&mut transition, self.arc_direction.field())?;
        let position = arcs
            .iter()
            .position(|arc| ArcEndpoint::from_arc(arc).as_ref() == Some(&self.endpoint));
        match edit {
            ArcEdit::Add { weight, arc_type } => {
                if position.is_some() {
                    return Ok(());
                }
                let mut arc = json!({"weight":weight});
                self.endpoint.set_reference(&mut arc)?;
                if self.arc_direction == ArcDirection::Input {
                    arc.as_object_mut().ok_or("Arc must be an object")?.insert(
                        "type".to_owned(),
                        json!(arc_type.unwrap_or_default().as_str()),
                    );
                }
                arcs.push(arc);
            }
            ArcEdit::Remove => {
                if let Some(position) = position {
                    arcs.remove(position);
                }
            }
            ArcEdit::Weight(weight) => {
                if let Some(arc) = position.and_then(|position| arcs.get_mut(position)) {
                    arc["weight"] = json!(weight);
                }
            }
            ArcEdit::Type(arc_type) => {
                if let Some(arc) = position.and_then(|position| arcs.get_mut(position)) {
                    arc["type"] = json!(arc_type.as_str());
                }
            }
            ArcEdit::Endpoint(endpoint) => {
                if let Some(arc) = position.and_then(|position| arcs.get_mut(position)) {
                    endpoint.set_reference(arc)?;
                }
            }
        }
        if !matches!(edit, ArcEdit::Weight(_)) {
            sanitize_transition(
                document,
                target,
                &mut transition,
                extensions,
                !matches!(edit, ArcEdit::Remove),
            );
        }
        *items_mut(
            net_mut(document, self.target_subnet_id.as_deref())?,
            "transitions",
        )?
        .get_mut(index)
        .ok_or("Transition index is invalid")? = transition;
        Ok(())
    }
}
