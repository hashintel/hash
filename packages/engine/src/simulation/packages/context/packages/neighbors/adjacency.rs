use crate::config::{TopologyConfig};
use crate::config::topology::{AxisBoundary, WrappingBehavior};

use super::map::{Direction, Position};

/// Performs all the bounds checking and shifts points over depending on the topology config
/// Takes in a single position and returns a vector containing all the possible wrapping
/// of that position around the boundaries.
#[must_use]
pub fn wrapped_positions(pos: &Position, topology: &TopologyConfig) -> Vec<Position> {
    let mut all_points = Vec::with_capacity(topology.wrapping_combinations);
    all_points.push(*pos);

    for coord in 0..=2 {
        for i in 0..all_points.len() {
            // Go from z to x: we have to go backward to handle
            // the OffsetReflection case. Look at cfg.rs for more
            // details.
            //
            // Only add to the array if the position will be wrapped.
            if get_wrap_mode(2 - coord, topology) != WrappingBehavior::NoWrap {
                let mut pos = all_points[i];
                wrap_pos_coord(&mut pos, 2 - coord, topology);
                all_points.push(pos);
            }
        }
    }

    all_points
}

/// Wrap the position if the agent is out of bounds
pub fn correct_agent(
    mut pos: Option<&mut Position>,
    mut dir: Option<&mut Direction>,
    topology: &TopologyConfig,
) -> bool {
    let mut position_was_corrected = false;

    if let Some(ref mut pos) = pos {
        for i in 0..=2 {
            let bounds = get_bounds(i, topology);
            if pos[i] < bounds.min || pos[i] >= bounds.max {
                wrap_pos_coord(pos, i, topology);
                if let Some(ref mut dir) = dir {
                    wrap_dir_coord(dir, i, topology);
                }
                position_was_corrected = true;
            }
        }
    }

    return position_was_corrected;
}

fn wrap_pos_coord(pos: &mut Position, i: usize, config: &TopologyConfig) {
    use crate::config::topology::WrappingBehavior::{Continuous, NoWrap, OffsetReflection, Reflection};
    match get_wrap_mode(i, config) {
        Continuous => {
            if pos[i] > get_half(i, config) {
                pos[i] -= get_size(i, config);
            } else {
                pos[i] += get_size(i, config);
            }
        }
        Reflection => {
            if pos[i] < get_half(i, config) {
                pos[i] += 2.0 * (get_bounds(i, config).min - pos[i]);
            } else {
                pos[i] += 2.0 * (get_bounds(i, config).max - pos[i]) - 1.0;
            }
        }
        OffsetReflection => {
            // we need to reflect along i and offset along j
            let j = if i == 0 { 2 } else { i - 1 };
            if pos[j] < get_half(j, config) {
                pos[j] += get_size(j, config) * 0.5;
            } else {
                pos[j] -= get_size(j, config) * 0.5;
            }
            if pos[i] < get_half(i, config) {
                pos[i] += 2.0 * (get_bounds(i, config).min - pos[i]);
            } else {
                pos[i] += 2.0 * (get_bounds(i, config).max - pos[i]) - 1.0;
            }
        }
        NoWrap => (),
    }
}

fn wrap_dir_coord(dir: &mut Direction, i: usize, config: &TopologyConfig) {
    use crate::config::topology::WrappingBehavior::{OffsetReflection, Reflection};
    match get_wrap_mode(i, config) {
        Reflection | OffsetReflection => {
            dir[i] = -dir[i];
        }
        _ => (),
    }
}

fn get_half(i: usize, config: &TopologyConfig) -> f64 {
    match i {
        0 => config.get_half_x(),
        1 => config.get_half_y(),
        _ => config.get_half_z(),
    }
}

fn get_size(i: usize, config: &TopologyConfig) -> f64 {
    match i {
        0 => config.get_x_size(),
        1 => config.get_y_size(),
        _ => config.get_z_size(),
    }
}

fn get_wrap_mode(i: usize, config: &TopologyConfig) -> WrappingBehavior {
    match i {
        0 => config.wrap_x_mode,
        1 => config.wrap_y_mode,
        _ => config.wrap_z_mode,
    }
}

fn get_bounds(i: usize, config: &TopologyConfig) -> AxisBoundary {
    match i {
        0 => config.x_bounds,
        1 => config.y_bounds,
        _ => config.z_bounds,
    }
}
