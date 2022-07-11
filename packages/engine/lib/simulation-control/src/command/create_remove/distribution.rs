use crate::command::{
    create_remove::{batch::PendingBatch, WorkerIndex},
    Error, Result,
};

/// Represents the distribution of agents per worker.
/// Each worker has its own collection of batches (usually one for smaller simulations).
/// When agents are created this struct is used to distribute agents as evenly
/// as possible across all workers. Once this distribution is done, then the inbound
/// agents are distributed across the batches of each worker.
#[derive(Debug)]
pub struct BatchDistribution {
    inner: Vec<Vec<PendingBatch>>,
    target_max_group_size: usize,
}

impl BatchDistribution {
    pub fn new(
        num_workers: usize,
        current_batches: Vec<PendingBatch>,
        target_max_group_size: usize,
    ) -> BatchDistribution {
        let mut inner = vec![vec![]; num_workers];

        for batch in current_batches {
            inner[batch.old_worker_unchecked()].push(batch);
        }

        BatchDistribution {
            inner,
            target_max_group_size,
        }
    }

    // TODO: these are unused
    pub fn _get_mut_unchecked(
        &mut self,
        worker_index: WorkerIndex,
        worker_batch_index: usize,
    ) -> &mut PendingBatch {
        &mut self.inner[worker_index][worker_batch_index]
    }

    pub fn _get_elem(
        &mut self,
        worker_index: WorkerIndex,
        worker_batch_index: usize,
    ) -> Result<&PendingBatch> {
        self.inner
            .get(worker_index)
            .ok_or_else(|| Error::from(format!("Worker index out of bounds: {}", worker_index)))?
            .get(worker_batch_index)
            .ok_or_else(|| {
                Error::from(format!(
                    "Worker batch index out of bounds: {}",
                    worker_batch_index
                ))
            })
    }

    fn get_current_worker_level_distribution(&self) -> Vec<usize> {
        self.inner
            .iter()
            .map(|worker_batches| {
                worker_batches
                    .iter()
                    .fold(0, |sum, next| sum + next.num_agents())
            })
            .collect()
    }

    /// Given an inbound-to-worker distribution of agents,
    /// distribute each inbound group into the batches
    /// which may or may not already exist.
    pub fn set_batch_level_inbounds(&mut self, worker_level_inbound: Vec<usize>) -> Result<()> {
        self.inner
            .iter_mut()
            .zip(worker_level_inbound.into_iter())
            .try_for_each::<_, Result<()>>(|(batches, number_inbound)| {
                let mut current_distribution =
                    batches.iter().map(|b| b.num_agents()).collect::<Vec<_>>();
                let current_num_agents: usize = current_distribution.iter().sum();
                let total_num_agents = current_num_agents + number_inbound;
                let average_total_num_agents_per_batch = if !batches.is_empty() {
                    total_num_agents / batches.len()
                } else {
                    0
                };
                if average_total_num_agents_per_batch > self.target_max_group_size {
                    // Create more pending batches, as inbound count is large
                    let target_number_batches = ((total_num_agents as f64)
                        / (self.target_max_group_size as f64))
                        .ceil() as usize;
                    (0..target_number_batches - batches.len()).for_each(|_| {
                        current_distribution.push(0);
                        batches.push(PendingBatch::new(None, 0));
                    });
                }
                for (batch_index, inbound_count) in
                    get_inbound_distribution(&current_distribution, number_inbound)?
                        .into_iter()
                        .enumerate()
                {
                    batches[batch_index].add_inbound_count(inbound_count);
                }
                Ok(())
            })?;

        Ok(())
    }

    pub fn get_worker_level_distribution(&mut self, number_inbound: usize) -> Result<Vec<usize>> {
        // `number_inbound`: number of agents that are created (or are migrating from other batches)
        let current_distribution = self.get_current_worker_level_distribution();
        get_inbound_distribution(&current_distribution, number_inbound)
    }

    pub fn iter(&self) -> impl Iterator<Item = (WorkerIndex, &PendingBatch)> {
        self.inner
            .iter()
            .enumerate()
            .flat_map(|(worker_index, batches)| {
                batches.iter().map(move |batch| (worker_index, batch))
            })
    }
}

/// Given a discrete distribution of objects, get the distribution which would
/// distribute `number_inbound` objects such that the result would be as even as possible
fn get_inbound_distribution(
    current_distribution: &[usize],
    number_inbound: usize,
) -> Result<Vec<usize>> {
    let num_buckets = current_distribution.len();

    let mut inbound_distribution = vec![0; num_buckets];

    // `indices`: sorted bucket indices such that the bucket
    //            with the least number of objects comes first
    let mut indices = (0..num_buckets).collect::<Vec<_>>();
    indices.sort_by(|a, b| current_distribution[*a].cmp(&current_distribution[*b]));

    if number_inbound == 0 {
        return Ok(inbound_distribution);
    }

    let mut this_added = 0;
    let mut this_bucket_level = current_distribution[indices[0]];
    let mut chosen_number_of_buckets = 1;
    // Start off with the assumption that the first bucket gets all
    let mut target_level = this_bucket_level + number_inbound;
    for i in 1..num_buckets {
        let last_level = this_bucket_level;
        let last_added = this_added;
        this_bucket_level = current_distribution[indices[i]];
        debug_assert!(this_bucket_level >= last_level);
        let added = i * (this_bucket_level - last_level);
        this_added = last_added + added;
        if this_added >= number_inbound {
            // We've found enough space to accommodate all inbound objects
            chosen_number_of_buckets = i;
            let diff = this_added - number_inbound;
            target_level = (this_bucket_level as f32 - (diff as f32 / i as f32).floor()) as usize;
            break;
        } else if i == num_buckets - 1 {
            chosen_number_of_buckets = num_buckets;
            let diff = number_inbound - this_added;
            target_level =
                (diff as f32 / chosen_number_of_buckets as f32).ceil() as usize + this_bucket_level;
        }
        // Otherwise just continue searching for more space,
        // we haven't found enough to accommodate all
        // inbound objects.
    }

    debug_assert!(
        target_level > 0,
        "Target level of objects on buckets must be greater than zero"
    );

    debug_assert!(
        (0..chosen_number_of_buckets).fold(number_inbound as isize, |acc, i| {
            acc - (target_level - current_distribution[indices[i]]) as isize
        }) <= 0_isize
    );

    // Now we know the ~target amount of objects per each bucket
    // (which is in the chosen subset).

    let mut untaken = number_inbound;
    // Iterate over all buckets that we're planning to give work to
    #[allow(clippy::needless_range_loop)]
    for i in 0..chosen_number_of_buckets {
        let bucket_index = indices[i];
        let bucket_level = current_distribution[bucket_index];
        let target_take_amount = target_level - bucket_level;
        if target_take_amount <= untaken {
            inbound_distribution[bucket_index] = target_take_amount;
            untaken -= target_take_amount;
        } else {
            inbound_distribution[bucket_index] = untaken;
            break;
        }
    }
    Ok(inbound_distribution)
}
