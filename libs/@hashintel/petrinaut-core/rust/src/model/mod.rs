use alloc::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tsify::Tsify;

pub(crate) mod validation;
pub use validation::canonical_id;

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(untagged)]
pub enum JsonValue {
    Null,
    Boolean(bool),
    Number(f64),
    String(String),
    Array(Vec<Self>),
    Object(BTreeMap<String, Self>),
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(untagged)]
pub enum Nullable<T> {
    Value(T),
    Null,
}

fn present<'de, D: serde::Deserializer<'de>, T: Deserialize<'de>>(
    deserializer: D,
) -> Result<Option<T>, D::Error> {
    T::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub enum ElementType {
    Real,
    Integer,
    Boolean,
    Uuid,
    String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub enum ParameterType {
    Real,
    Integer,
    Boolean,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub enum ScenarioParameterType {
    Real,
    Integer,
    Boolean,
    Ratio,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub enum LambdaType {
    Predicate,
    Stochastic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub enum ArcType {
    Standard,
    Inhibitor,
    Read,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub enum OptimizeScale {
    Linear,
    Log,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaceData {
    pub id: String,

    pub name: String,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub description: Option<String>,

    #[serde(deserialize_with = "Option::deserialize")]
    pub color_id: Option<String>,

    pub dynamics_enabled: bool,

    #[serde(deserialize_with = "Option::deserialize")]
    pub differential_equation_id: Option<String>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub capacity: Option<Nullable<f64>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub is_port: Option<bool>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub visualizer_code: Option<String>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub show_as_initial_state: Option<bool>,

    pub x: f64,

    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum EndpointData {
    Place {
        place_id: String,
    },
    ComponentPort {
        component_instance_id: String,
        port_place_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InputArcData {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub place_id: Option<String>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub endpoint: Option<EndpointData>,

    pub weight: f64,

    #[serde(rename = "type")]
    pub kind_type: ArcType,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputArcData {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub place_id: Option<String>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub endpoint: Option<EndpointData>,

    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TransitionData {
    pub id: String,

    pub name: String,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub description: Option<String>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    #[tsify(type = "Record<string, JsonValue>")]
    pub metadata: Option<BTreeMap<String, Value>>,

    pub input_arcs: Vec<InputArcData>,

    pub output_arcs: Vec<OutputArcData>,

    pub lambda_type: LambdaType,

    pub lambda_code: String,

    pub transition_kernel_code: String,

    pub x: f64,

    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ColorElementData {
    pub element_id: String,

    pub name: String,

    #[serde(rename = "type")]
    pub kind_type: ElementType,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ColorData {
    pub id: String,

    pub name: String,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub description: Option<String>,

    pub icon_slug: String,

    pub display_color: String,

    pub elements: Vec<ColorElementData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EquationData {
    pub id: String,

    pub name: String,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub description: Option<String>,

    #[serde(deserialize_with = "Option::deserialize")]
    pub color_id: Option<String>,

    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParameterData {
    pub id: String,

    pub name: String,

    pub variable_name: String,

    #[serde(rename = "type")]
    pub kind_type: ParameterType,

    pub default_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MetricData {
    pub id: String,

    pub name: String,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub description: Option<String>,

    pub code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ComponentData {
    pub id: String,

    pub name: String,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub description: Option<String>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    #[tsify(type = "Record<string, JsonValue>")]
    pub metadata: Option<BTreeMap<String, Value>>,

    pub subnet_id: String,

    pub parameter_values: BTreeMap<String, String>,

    pub x: f64,

    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubnetData {
    pub id: String,

    pub name: String,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub description: Option<String>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    #[tsify(type = "Record<string, JsonValue>")]
    pub metadata: Option<BTreeMap<String, Value>>,

    pub places: Vec<PlaceData>,

    pub transitions: Vec<TransitionData>,

    pub types: Vec<ColorData>,

    pub differential_equations: Vec<EquationData>,

    pub parameters: Vec<ParameterData>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub component_instances: Option<Vec<ComponentData>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OptimizeSettings {
    pub min: String,

    pub max: String,

    pub scale: OptimizeScale,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub step: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdHocValueData {
    pub expression: String,

    #[serde(deserialize_with = "Option::deserialize")]
    pub optimize: Option<OptimizeSettings>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub retained_optimize: Option<OptimizeSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdHocVariableData {
    pub expression: String,

    #[serde(deserialize_with = "Option::deserialize")]
    pub optimize: Option<OptimizeSettings>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub retained_optimize: Option<OptimizeSettings>,

    pub name: String,

    #[serde(rename = "type")]
    pub kind_type: ScenarioParameterType,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub exposed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdHocParameterData {
    pub expression: String,

    #[serde(deserialize_with = "Option::deserialize")]
    pub optimize: Option<OptimizeSettings>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub retained_optimize: Option<OptimizeSettings>,

    pub parameter_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AdHocRowData {
    Fixed {
        cells: Vec<AdHocValueData>,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "present"
        )]
        retained_count: Option<AdHocValueData>,
    },
    Template {
        count: AdHocValueData,
        cells: Vec<AdHocValueData>,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum AdHocPlaceData {
    Coloured {
        variables: Vec<AdHocVariableData>,
        rows: Vec<AdHocRowData>,
        shared_columns: BTreeMap<String, AdHocValueData>,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "present"
        )]
        retained_shared_columns: Option<BTreeMap<String, AdHocValueData>>,
    },
    Uncoloured {
        count: AdHocValueData,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(untagged)]
pub enum TokenCell {
    Number(f64),
    Boolean(bool),
    String(String),
}
#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(untagged)]
pub enum PlaceInitialState {
    Expression(String),
    Rows(Vec<Vec<TokenCell>>),
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdHocStateData {
    pub variables: Vec<AdHocVariableData>,

    pub net_parameters: Vec<AdHocParameterData>,

    pub places: BTreeMap<String, AdHocPlaceData>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(tag = "type", content = "content", deny_unknown_fields)]
pub enum InitialStateData {
    #[serde(rename = "per_place")]
    PerPlace(BTreeMap<String, PlaceInitialState>),
    #[serde(rename = "code")]
    Code(String),
    #[serde(rename = "adhoc")]
    Adhoc(AdHocStateData),
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScenarioParameterData {
    #[serde(rename = "type")]
    pub kind_type: ScenarioParameterType,

    pub identifier: String,

    pub default: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScenarioData {
    pub id: String,

    pub name: String,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub description: Option<String>,

    pub scenario_parameters: Vec<ScenarioParameterData>,

    pub parameter_overrides: BTreeMap<String, String>,

    pub initial_state: InitialStateData,
}

#[derive(Debug, Clone, Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Sdcpn {
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub description: Option<String>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    #[tsify(type = "Record<string, JsonValue>")]
    pub metadata: Option<BTreeMap<String, Value>>,

    pub places: Vec<PlaceData>,

    pub transitions: Vec<TransitionData>,

    pub types: Vec<ColorData>,

    pub differential_equations: Vec<EquationData>,

    pub parameters: Vec<ParameterData>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub component_instances: Option<Vec<ComponentData>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub scenarios: Option<Vec<ScenarioData>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub metrics: Option<Vec<MetricData>>,

    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "present"
    )]
    pub subnets: Option<Vec<SubnetData>>,
}

impl Sdcpn {
    /// Normalizes authoring defaults and identifiers, then validates every entity shape.
    ///
    /// # Errors
    /// Returns an error for malformed entities or values outside the document schema.
    pub fn from_input(mut value: Value) -> Result<Self, String> {
        validation::normalize(&mut value)?;
        Self::from_normalized(value)
    }

    pub(crate) fn from_normalized(value: Value) -> Result<Self, String> {
        let document: Self = serde_json::from_value(value).map_err(|error| error.to_string())?;
        document.validate()?;
        Ok(document)
    }

    /// Validates entity values without requiring references to be resolved while editing.
    ///
    /// # Errors
    /// Returns an error for invalid names, numbers, endpoints, or parameter values.
    pub fn validate(&self) -> Result<(), String> {
        validation::validate(self)
    }

    /// Serializes a validated document.
    ///
    /// # Panics
    /// Panics if a custom serializer cannot represent the document.
    #[must_use]
    pub fn to_json(&self) -> Value {
        serde_json::to_value(self).expect("validated document should serialize")
    }
}
