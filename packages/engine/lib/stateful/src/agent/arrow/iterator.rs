use arrow2::datatypes::DataType;

use crate::{
    agent::{arrow::record_batch, AgentBatch},
    field::{POSITION_DIM, UUID_V4_LEN},
    state::AgentIndex,
    Result,
};

// TODO: We probably want to wrap `[AgentBatch]` into `AgentBatchPool` or similar for avoiding free
//   standing functions.

pub fn agent_id_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
) -> Result<impl Iterator<Item = &'b [u8; UUID_V4_LEN]> + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let iterable = agent_batch.id_iter()?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}

pub fn agent_name_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
) -> Result<impl Iterator<Item = Option<&'b str>> + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let iterable = record_batch::agent_name_iter(agent_batch.batch.record_batch()?)?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}

pub fn json_value_iter_cols<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
    field_name: &str,
    data_type: &DataType,
) -> Result<Box<dyn Iterator<Item = serde_json::Value> + Send + Sync + 'a>> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let iterable =
            record_batch::json_values(agent_batch.batch.record_batch()?, field_name, data_type)?;
        iterables.push(iterable.into_iter());
    }
    Ok(Box::new(iterables.into_iter().flatten()))
}

/// Get the index of an agent in Context Batch
pub fn index_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
) -> impl Iterator<Item = AgentIndex> + 'a {
    agent_pool
        .iter()
        .enumerate()
        .flat_map(|(group_index, agent_batch)| {
            let num_agents = agent_batch.num_agents() as u32;
            let group_index = group_index as u32;
            (0..num_agents).map(move |agent_index| AgentIndex {
                group_index,
                agent_index,
            })
        })
}

pub fn position_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
) -> Result<impl Iterator<Item = Option<[f64; POSITION_DIM]>> + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let iterable = record_batch::position_iter(agent_batch.batch.record_batch()?)?;
        iterables.push(iterable);
    }

    Ok(iterables.into_iter().flatten())
}

pub fn search_radius_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
) -> Result<impl Iterator<Item = Option<f64>> + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let iterable = record_batch::search_radius_iter(agent_batch.batch.record_batch()?)?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}

pub fn f64_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
    field_name: &str,
) -> Result<impl Iterator<Item = Option<f64>> + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let iterable = record_batch::f64_iter(agent_batch.batch.record_batch()?, field_name)?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}

pub fn exists_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
    field_name: &str,
) -> Result<impl Iterator<Item = bool> + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let iterable = record_batch::exists_iter(agent_batch.batch.record_batch()?, field_name)?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}

pub fn str_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
    field_name: &str,
) -> Result<impl Iterator<Item = Option<&'b str>> + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let iterable = record_batch::str_iter(agent_batch.batch.record_batch()?, field_name)?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}

pub fn bool_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
    field_name: &str,
) -> Result<impl Iterator<Item = Option<bool>> + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let iterable = record_batch::bool_iter(agent_batch.batch.record_batch()?, field_name)?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}

pub fn json_serialized_value_iter<'b: 'a, 'a>(
    agent_pool: &'a [&'b AgentBatch],
    field_name: &str,
) -> Result<impl Iterator<Item = serde_json::Value> + Send + Sync + 'a> {
    let mut iterables = Vec::with_capacity(agent_pool.len());

    // Collect iterators first, because we want to check for any errors.
    for agent_batch in agent_pool {
        let record_batch = agent_batch.batch.record_batch()?;
        let iterable = record_batch::json_deserialize_str_value_iter(record_batch, field_name)?;
        iterables.push(iterable);
    }
    Ok(iterables.into_iter().flatten())
}
