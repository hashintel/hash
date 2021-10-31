use super::{
    error::Result,
    topology::{Config, WrappingBehavior},
};
use serde::{Deserialize, Serialize};

// We also have some consts that come in along with our initial world state.
// These, we call 'properties', and store them in context.
// For now, they're... you guessed it, JSON.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Properties(pub serde_json::Value);
impl Properties {
    /// # Errors
    /// This function cannot fail, as Properties is a free-flowing JSON object.
    /// TODO: Audit this (Can a `serde_json::Value` be anything else?)
    pub fn from_json(value: serde_json::Value) -> Result<Properties, serde_json::Error> {
        serde_json::from_value(value)
    }

    #[must_use]
    pub fn from_json_unchecked(value: serde_json::Value) -> Properties {
        Properties::from_json(value)
            .expect("This should not happen (Properties is a free-flowing JSON object)")
    }

    #[must_use]
    pub fn empty() -> Properties {
        Properties(serde_json::Value::Object(serde_json::Map::new()))
    }

    pub fn get<S>(&self, key: S) -> Option<&serde_json::Value>
    where
        S: AsRef<str>,
    {
        self.0.get(key.as_ref())
    }

    pub fn get_cloned<S>(&self, key: S) -> Option<serde_json::Value>
    where
        S: AsRef<str>,
    {
        self.0.get(key.as_ref()).cloned()
    }

    #[must_use]
    pub fn topology_config_unchecked(&self) -> Config {
        self.topology_config()
            .expect("Expected topology configuration")
    }

    /// `topology` is a type safe SimulationResult-oriented getter for `topology::Config`
    ///
    /// # Errors
    /// `topology` will return an error if there is no suitable `topology::Config` specified within
    /// the Properties JSON object.
    pub fn topology(&self) -> Result<Config> {
        self.topology_config()
            .ok_or_else(|| "TopologyConfig not found within properties".into())
    }

    /// `topology_config` will attempt to create a `topology::Config` struct from the given json
    /// value stored within properties, otherwise it will return None.
    ///
    /// This should be used in conjunction with `topology::Config::default()`
    #[allow(clippy::cognitive_complexity, clippy::too_many_lines)] // TODO: split up
    #[must_use]
    pub fn topology_config(&self) -> Option<Config> {
        // Start interpreting the user's properties into a topology without tripping on errors
        if let Some(serde_json::Value::Object(topology_props)) = self.0.get("topology") {
            let mut config = Config::default();
            if let Some(serde_json::Value::Array(x_bounds_arr)) = topology_props.get("x_bounds") {
                if let Some(x_bounds_min) = x_bounds_arr.get(0).and_then(serde_json::Value::as_f64)
                {
                    config.x_bounds.min = x_bounds_min;
                }
                if let Some(x_bounds_max) = x_bounds_arr.get(1).and_then(serde_json::Value::as_f64)
                {
                    config.x_bounds.max = x_bounds_max;
                }
            }
            if let Some(serde_json::Value::Array(y_bounds_arr)) = topology_props.get("y_bounds") {
                if let Some(y_bounds_min) = y_bounds_arr.get(0).and_then(serde_json::Value::as_f64)
                {
                    config.y_bounds.min = y_bounds_min;
                }
                if let Some(y_bounds_max) = y_bounds_arr.get(1).and_then(serde_json::Value::as_f64)
                {
                    config.y_bounds.max = y_bounds_max;
                }
            }
            if let Some(serde_json::Value::Array(z_bounds_arr)) = topology_props.get("z_bounds") {
                if let Some(z_bounds_min) = z_bounds_arr.get(0).and_then(serde_json::Value::as_f64)
                {
                    config.z_bounds.min = z_bounds_min;
                }
                if let Some(z_bounds_max) = z_bounds_arr.get(1).and_then(serde_json::Value::as_f64)
                {
                    config.z_bounds.max = z_bounds_max;
                }
            }
            // Misspellings currently default to NoWrap but don't alert the user. Need to add error alerts here
            if let Some(wrap) = topology_props
                .get("wrap_x_mode")
                .and_then(|v| v.as_str().and_then(WrappingBehavior::from_string))
            {
                config.wrap_x_mode = wrap;
            }

            if let Some(wrap) = topology_props
                .get("wrap_y_mode")
                .and_then(|v| v.as_str().and_then(WrappingBehavior::from_string))
            {
                config.wrap_y_mode = wrap;
            }

            if let Some(wrap) = topology_props
                .get("wrap_z_mode")
                .and_then(|v| v.as_str().and_then(WrappingBehavior::from_string))
            {
                config.wrap_z_mode = wrap;
            }

            // Override whatever the user entered for x and y wrap if they entered a preset
            if let Some(serde_json::Value::String(wrapping_preset_str)) =
                topology_props.get("wrapping_preset")
            {
                match &**wrapping_preset_str {
                    "spherical" => {
                        config.wrap_x_mode = WrappingBehavior::Continuous;
                        config.wrap_y_mode = WrappingBehavior::OffsetReflection;
                    }
                    "torus" => {
                        config.wrap_x_mode = WrappingBehavior::Continuous;
                        config.wrap_y_mode = WrappingBehavior::Continuous;
                    }
                    "continuous" => {
                        config.wrap_x_mode = WrappingBehavior::Continuous;
                        config.wrap_y_mode = WrappingBehavior::Continuous;
                        config.wrap_z_mode = WrappingBehavior::Continuous;
                    }
                    "reflection" => {
                        config.wrap_x_mode = WrappingBehavior::Reflection;
                        config.wrap_y_mode = WrappingBehavior::Reflection;
                        config.wrap_z_mode = WrappingBehavior::Reflection;
                    }
                    _ => {}
                }
            }

            if config.x_bounds.min > std::f64::NEG_INFINITY
                && config.x_bounds.max < std::f64::INFINITY
                && config.wrap_x_mode == WrappingBehavior::NoWrap
            {
                config.wrap_x_mode = WrappingBehavior::Reflection;
            }

            if config.y_bounds.min > std::f64::NEG_INFINITY
                && config.y_bounds.max < std::f64::INFINITY
                && config.wrap_y_mode == WrappingBehavior::NoWrap
            {
                config.wrap_y_mode = WrappingBehavior::Reflection;
            }

            if config.z_bounds.min > std::f64::NEG_INFINITY
                && config.z_bounds.max < std::f64::INFINITY
                && config.wrap_z_mode == WrappingBehavior::NoWrap
            {
                config.wrap_z_mode = WrappingBehavior::Reflection;
            }

            /*
               We only support ONE OffsetReflection, and not on the x axis. The "offset" axis,
               which is always the previous one (eg: x if y is OffsetReflection, y if z is
               OffsetReflection), gets always set to Continuous.

               This is related to the way in which we calculate the wrapped positions
               for each agent. We expect each wrap mode to have exactly one wrapped
               position, but for OffsetReflection, this is not true: an agent may
               have two wrapped positions.
               Implementing the general case is very computationally expensive. Limiting
               ourselves to only have one OffsetReflection axis makes it more manageable.

               To understand why OffsetReflection generates two wrapped positions,
               look at this example situation:

               __________________
               |        x       |

               the agent "x" is at the middle of the top border of the map. Which
               are its wrapped positions? They are:

               _x_______________x
               |        x       |

               but our algorithm only considers one:

               _x________________
               |        x       |

               The "trick" to overcome this problem is to always consider the axis with OffsetReflection
               before the axis along which the offset happens (which is always the "previous" one), and to
               mandate that the offset axis is set to Continuous wrapping mode, because at that point
               the other wrap mode kicks in and covers the issue:

               _x_______________x
               x       |        x       |

               If it does not make sense, try to answer this question: what algorithm should we use to find
               all the neighbors of this point:

               __________________
               |        x       |

               with all possible combinations of wrapping behaviors? You'll either find a solution that works
               and you can get rid of this whole comment, or understand what I am trying to say :D
            */
            if config.wrap_x_mode == WrappingBehavior::OffsetReflection {
                panic!("HASH does not support OffsetReflection along the x axis");
            }

            if config.wrap_y_mode == WrappingBehavior::OffsetReflection
                && config.wrap_z_mode == WrappingBehavior::OffsetReflection
            {
                panic!("HASH support only one axis with OffsetReflection (either y or z)");
            }

            if config.wrap_y_mode == WrappingBehavior::OffsetReflection {
                config.wrap_x_mode = WrappingBehavior::Continuous;
            }
            if config.wrap_z_mode == WrappingBehavior::OffsetReflection {
                config.wrap_y_mode = WrappingBehavior::Continuous;
            }

            let wrapping_combinations =
                vec![config.wrap_x_mode, config.wrap_y_mode, config.wrap_z_mode]
                    .iter()
                    .fold(1, |acc, wrap| -> usize {
                        if let WrappingBehavior::NoWrap = wrap {
                            acc
                        } else {
                            acc * 2
                        }
                    });
            config.wrapping_combinations = wrapping_combinations;

            if let Some(search_radius) = topology_props
                .get("search_radius")
                .and_then(serde_json::Value::as_f64)
            {
                config.search_radius = Some(search_radius);
            }

            if let Some(serde_json::Value::String(distance_func_str)) =
                topology_props.get("distance_function")
            {
                use super::distance::functions::{conway, euclidean, euclidean_squared, manhattan};
                config.distance_function = Box::new(match &**distance_func_str {
                    "manhattan" => manhattan,
                    "euclidean" => euclidean,
                    "euclidean_squared" => euclidean_squared,
                    // "conway" | "chebyshev" => conway,
                    // default is already conway, TODO nicer alternative
                    _ => conway,
                });
            }

            if let Some(serde_json::Value::Bool(move_wrapped_agents)) =
                topology_props.get("move_wrapped_agents")
            {
                config.move_wrapped_agents = *move_wrapped_agents;
            }

            return Some(config);
        }
        None
    }
}

impl std::default::Default for Properties {
    fn default() -> Properties {
        Properties::empty()
    }
}
