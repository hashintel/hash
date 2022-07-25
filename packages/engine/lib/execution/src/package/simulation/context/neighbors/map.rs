use std::collections::HashSet;

use kdtree::KdTree;
use rayon::iter::{IntoParallelRefIterator, ParallelIterator};
use stateful::state::AgentIndex;

use crate::{package::simulation::state::topology::TopologyConfig, Error, Result};

pub(super) type PositionSubType = f64;
pub(super) type Position = [PositionSubType; 3];

pub type Tree<'a> = KdTree<PositionSubType, AgentIndex, Position>;

#[derive(Debug)]
pub struct NeighborMap {
    pub data: Vec<Vec<AgentIndex>>,
    // Sum of neighbor counts
    pub total_count: usize,
}

pub type NeighborRef = ((Option<[f64; 3]>, AgentIndex), Option<f64>);

/// # Errors
/// This function will not fail
fn agents_adjacency_map(agents: &'_ [NeighborRef]) -> Result<Tree<'_>> {
    let mut tree = kdtree::kdtree::KdTree::new(3);
    agents.iter().try_for_each(|((pos, idx), _)| {
        pos.map_or(Ok(()), |unwrapped| {
            tree.add(unwrapped, *idx).map_err(Error::from)
        })
    })?;
    Ok(tree)
}

#[allow(clippy::module_name_repetitions)]
fn gather_neighbors(
    adjacency_map: &Tree<'_>,
    idx: AgentIndex,
    position: &Position,
    search_radius: &Option<PositionSubType>,
    topology: &TopologyConfig,
) -> Result<Vec<AgentIndex>> {
    // Check if the agent has a custom search radius. If not, fall back to the topology search
    // radius
    let search_radius = match *search_radius {
        Some(radius) => radius,
        None => match topology.search_radius {
            Some(global_radius) => global_radius,
            None => return Ok(Vec::with_capacity(0)),
        },
    };

    // if wrapping_combinations is 1, it means that we don't wrap around the boundaries
    // so let's leave it as is.

    let mut final_neighbors = Vec::new();
    if topology.wrapping_combinations == 1 {
        adjacency_map
            .within(position, search_radius, &topology.distance_function)
            .map_err(Error::from)?
            .into_iter()
            .filter(|point| !point.1.eq(&idx))
            .for_each(|point| final_neighbors.push(*point.1));
    } else {
        // We keep the idxs of the agents in the agent state
        // This assumes the idxs don't change from step to step.
        // This is fine for when the kdtree gets rebuilt every step but will be unreliable when the
        // vec changes. A better approach would be to use a hashmap to hold all the agents
        // and use a resouce id uuid rather than string. We can't actually use the agent id
        // because it's a string, which sucks
        let mut seen_neighbors_idxs = HashSet::new();

        let wrapped = super::adjacency::wrapped_positions(position, topology);
        wrapped
            .into_iter()
            .try_for_each::<_, Result<()>>(|pos: Position| {
                adjacency_map
                    .within(&pos, search_radius, &topology.distance_function)
                    .map_err(Error::from)?
                    .into_iter()
                    .filter(|point| seen_neighbors_idxs.insert(*point.1))
                    .filter(|point| !point.1.eq(&idx))
                    .for_each(|point| final_neighbors.push(*point.1));
                Ok(())
            })?;
    }

    Ok(final_neighbors)
}

impl NeighborMap {
    pub fn gather(
        states: Vec<NeighborRef>,
        topology_config: &TopologyConfig,
    ) -> Result<NeighborMap> {
        let num_states = states.len();
        let adjacency_map = agents_adjacency_map(&states)?;
        states
            .par_iter()
            .try_fold(
                || (Vec::new(), 0),
                |(mut neighbors_col, len), ((pos, index), search_radius)| {
                    if let Some(pos) = pos {
                        match gather_neighbors(
                            &adjacency_map,
                            *index,
                            pos,
                            search_radius,
                            topology_config,
                        ) {
                            Ok(neighbors) => {
                                let neighbor_count = neighbors.len();
                                neighbors_col.push(neighbors);
                                Ok((neighbors_col, len + neighbor_count))
                            }
                            Err(e) => Err(e),
                        }
                    } else {
                        neighbors_col.push(Vec::with_capacity(0));
                        Ok((neighbors_col, len))
                    }
                },
            )
            .try_reduce(
                || (Vec::with_capacity(num_states), 0),
                |(mut v, mut len), (mut v_in, len_in)| {
                    v.append(&mut v_in);
                    len += len_in;
                    Ok((v, len))
                },
            )
            .map(|(data, total_count)| NeighborMap { data, total_count })
    }
}
