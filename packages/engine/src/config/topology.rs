use crate::config::globals::Globals;
use crate::config::topology::functions::{conway, euclidean, euclidean_squared, manhattan};
use crate::Result;
use std::sync::Arc;

// TODO OS - think about creating a system of ConfigProviders whereby packages can depend on them
//   and decrease the amount of assumptions the core engine has to make, for example position
//   correction and neighbour search depend on this config, but this config is useless if those
//   packages are not run

#[allow(clippy::module_name_repetitions)]
pub trait DistanceFn: Fn(&[f64], &[f64]) -> f64 + Send + Sync + 'static {}
impl<T> DistanceFn for T where T: Fn(&[f64], &[f64]) -> f64 + Send + Sync + 'static {}

pub mod functions {
    /// The distance function associated with the infinite norm
    /// In simpler terms - the distance function that returns the largest distance in any given axes
    ///
    /// Takes two positions as an array of coordinates
    #[must_use]
    pub fn conway(a: &[f64], b: &[f64]) -> f64 {
        debug_assert!(a.len() == b.len());
        a.iter()
            .zip(b.iter()) // Line the two coordinates up in a set of hstacked pairs
            .map(|(x1, x2)| (*x1 - *x2).abs()) // pull in each hstack pair and return the abs of their difference
            .fold(0_f64, |a, b| a.max(b)) //
    }

    /// The distance function associated with the L-1 norm
    /// Also known as the Taxicab distance - returns the total distance traveled in all axes
    ///
    /// Takes two positions as an array of coordinates
    #[must_use]
    pub fn manhattan(a: &[f64], b: &[f64]) -> f64 {
        debug_assert!(a.len() == b.len());
        a.iter()
            .zip(b.iter())
            .map(|(x1, x2)| (*x1 - *x2).abs())
            .fold(0_f64, |acc, add| acc + add)
    }

    /// The distance function associated with the L-2 norm
    /// Most familiar distance function - is the straightline distance between two points
    /// Results are left squared for efficient comparisons
    ///
    /// Takes two positions as an array of coordinates
    #[must_use]
    pub fn euclidean_squared(a: &[f64], b: &[f64]) -> f64 {
        debug_assert!(a.len() == b.len());
        a.iter()
            .zip(b.iter())
            .map(|(x1, x2)| (*x1 - *x2).powi(2))
            .fold(0_f64, |acc, add| acc + add)
    }

    /// The distance function associated with the L-2 norm
    /// Most familiar distance function - is the straightline distance between two points
    ///
    /// Takes two positions as an array of coordinates
    #[must_use]
    pub fn euclidean(a: &[f64], b: &[f64]) -> f64 {
        debug_assert!(a.len() == b.len());
        a.iter()
            .zip(b.iter())
            .map(|(x1, x2)| (*x1 - *x2).powi(2))
            .fold(0_f64, |acc, add| acc + add)
            .sqrt()
    }
}

#[derive(Clone, Copy, Debug)]
pub struct AxisBoundary {
    pub min: f64,
    pub max: f64,
}

impl std::default::Default for AxisBoundary {
    fn default() -> AxisBoundary {
        AxisBoundary {
            min: std::f64::NEG_INFINITY,
            max: std::f64::INFINITY,
        }
    }
}

/// Configuration of the topology relevant to movement and neighbor calculation
pub struct Config {
    /// Dimensions of board associated with "width"
    pub x_bounds: AxisBoundary,

    /// Dimensions of board associated with "length"
    pub y_bounds: AxisBoundary,

    /// Dimensions of board associated with "height"
    pub z_bounds: AxisBoundary,

    /// Determines how agents interact with the boundaries of the simulation associated with "width"
    pub wrap_x_mode: WrappingBehavior,

    /// Determines how agents interact with the boundaries of the simulation associated with "length"
    pub wrap_y_mode: WrappingBehavior,

    /// Determines how agents interact with the boundaries of the simulation associated with "height"
    pub wrap_z_mode: WrappingBehavior,

    /// The search radius for the kd-tree distance function
    pub search_radius: Option<f64>,

    /// The type of distance function to be used
    /// Currently can be any of Manhattan, Euclidean, Lnorm(p), and Chebyshev
    pub distance_function: Box<dyn DistanceFn>,

    /// Whether or not position and velocity wrapping are enabled by default
    pub move_wrapped_agents: bool,

    /// Cache how many wrapped points we need to calculate
    pub wrapping_combinations: usize,
}

impl std::default::Default for Config {
    fn default() -> Config {
        Config {
            x_bounds: AxisBoundary::default(),
            y_bounds: AxisBoundary::default(),
            z_bounds: AxisBoundary::default(),
            wrap_x_mode: WrappingBehavior::default(),
            wrap_y_mode: WrappingBehavior::default(),
            wrap_z_mode: WrappingBehavior::default(),
            search_radius: None,
            distance_function: Box::new(functions::conway),
            move_wrapped_agents: true,
            wrapping_combinations: 1,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum WrappingBehavior {
    /// Agents crossing the border re-enter on the other side
    ///
    /// An example would be a 2D surface on a torus
    Continuous,

    /// Agents crossing the border are reflected
    ///
    /// En example would be balls bouncing against a wall
    Reflection,

    /// Agents crossing the border are reflected and offset by half the border width
    ///
    /// An example would be a 2D on a sphere
    OffsetReflection,

    /// No changes in behavior
    ///
    /// Distances are calculated ignoring the size of the board
    NoWrap,
}

impl std::default::Default for WrappingBehavior {
    fn default() -> WrappingBehavior {
        WrappingBehavior::NoWrap
    }
}

impl WrappingBehavior {
    pub fn from_string<S>(source: S) -> Option<WrappingBehavior>
    where
        S: AsRef<str>,
    {
        Some(match source.as_ref() {
            "continuous" => WrappingBehavior::Continuous,
            "reflection" => WrappingBehavior::Reflection,
            "offset_reflection" => WrappingBehavior::OffsetReflection,
            "none" => WrappingBehavior::NoWrap,
            _ => return None,
        })
    }
}

impl Config {
    /// # Errors
    /// Will return an error if there is no suitable `topology::Config` specified within
    /// the Globals JSON object.
    pub fn create_from_globals(globals: &Arc<Globals>) -> Result<Self> {
        Self::_try_extract_topology_config(globals)
            .ok_or_else(|| "TopologyConfig not found within Globals".into())
    }

    /// `_try_extract_topology_config` will attempt to create a `topology::Config` struct from the given json
    /// value stored within the globals, otherwise it will return None.
    ///
    /// This should be used in conjunction with `topology::Config::default()`
    #[allow(clippy::cognitive_complexity, clippy::too_many_lines)] // TODO: split up
    #[must_use]
    fn _try_extract_topology_config(globals: &Arc<Globals>) -> Option<Self> {
        // Start interpreting the user's global properties into a topology without tripping on errors
        if let Some(serde_json::Value::Object(topology_props)) = globals.0.get("topology") {
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

    /// Get the halfway axis of x dimensions
    #[must_use]
    pub fn get_half_x(&self) -> f64 {
        self.x_bounds.max - (self.x_bounds.max - self.x_bounds.min) * 0.5
    }

    /// Get the halfway axis of x dimensions
    #[must_use]
    pub fn get_half_y(&self) -> f64 {
        self.y_bounds.max - (self.y_bounds.max - self.y_bounds.min) * 0.5
    }

    /// Get the halfway axis of x dimensions
    #[must_use]
    pub fn get_half_z(&self) -> f64 {
        self.z_bounds.max - (self.z_bounds.max - self.z_bounds.min) * 0.5
    }

    /// Get distance between each end of the dimension
    #[must_use]
    pub fn get_x_size(&self) -> f64 {
        self.x_bounds.max - self.x_bounds.min
    }

    /// Get distance between each end of the dimension
    #[must_use]
    pub fn get_y_size(&self) -> f64 {
        self.y_bounds.max - self.y_bounds.min
    }

    /// Get distance between each end of the dimension
    #[must_use]
    pub fn get_z_size(&self) -> f64 {
        self.z_bounds.max - self.z_bounds.min
    }
}
