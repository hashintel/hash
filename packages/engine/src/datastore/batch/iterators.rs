pub mod agent {
    use std::ops::Deref;

    use arrow::datatypes::DataType;

    use crate::datastore::{prelude::*, POSITION_DIM, UUID_V4_LEN};

    pub fn agent_id_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> Result<impl Iterator<Item = &[u8; UUID_V4_LEN]>> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().agent_id_iter()?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    // TODO: unused?
    pub fn agent_id_iter_ref<'b: 'a, 'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [&'b B],
    ) -> Result<impl Iterator<Item = &'b [u8; UUID_V4_LEN]> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = (*agent_batch).as_ref().agent_id_iter()?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn agent_name_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> Result<impl Iterator<Item = Option<&str>>> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().agent_name_iter()?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    // TODO: unused?
    pub fn agent_name_iter_ref<'b: 'a, 'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [&'b B],
    ) -> Result<impl Iterator<Item = Option<&'b str>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = (*agent_batch).as_ref().agent_name_iter()?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn json_value_iter_cols<'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
        data_type: &DataType,
    ) -> Result<Box<dyn Iterator<Item = serde_json::Value> + Send + Sync + 'a>> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().json_values(field_name, data_type)?;
            iterables.push(iterable.into_iter());
        }
        Ok(Box::new(iterables.into_iter().flatten()))
    }

    /// Get the index of an agent in Context Batch
    pub fn index_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> impl Iterator<Item = AgentIndex> + '_ {
        agent_pool.iter().enumerate().flat_map(|(i, g)| {
            let num_agents = g.as_ref().batch.num_rows() as u32;
            let group_index = i as u32;
            (0..num_agents).map(move |j| (group_index, j))
        })
    }

    pub fn position_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> Result<impl Iterator<Item = Option<&[f64; POSITION_DIM]>>> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().position_iter()?;
            iterables.push(iterable);
        }

        Ok(iterables.into_iter().flatten())
    }

    pub fn search_radius_iter<B: Deref<Target = AgentBatch>>(
        agent_pool: &[B],
    ) -> Result<impl Iterator<Item = Option<f64>> + '_> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().search_radius_iter()?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn behavior_list_bytes_iter<'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [B],
    ) -> Result<impl Iterator<Item = Vec<&[u8]>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().behavior_list_bytes_iter()?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn f64_iter<'a, B: Deref<Target = AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = Option<f64>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().f64_iter(field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn exists_iter<'a, B: AsRef<AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = bool> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().exists_iter(field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn str_iter<'a, B: AsRef<AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = Option<&'a str>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().str_iter(field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn bool_iter<'a, B: AsRef<AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = Option<bool>> + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch.as_ref().bool_iter(field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }

    pub fn json_serialized_value_iter<'a, B: AsRef<AgentBatch>>(
        agent_pool: &'a [B],
        field_name: &str,
    ) -> Result<impl Iterator<Item = serde_json::Value> + Send + Sync + 'a> {
        let mut iterables = Vec::with_capacity(agent_pool.len());

        // Collect iterators first, because we want to check for any errors.
        for agent_batch in agent_pool {
            let iterable = agent_batch
                .as_ref()
                .json_deserialize_str_value_iter(field_name)?;
            iterables.push(iterable);
        }
        Ok(iterables.into_iter().flatten())
    }
}

// TODO: add unit tests
