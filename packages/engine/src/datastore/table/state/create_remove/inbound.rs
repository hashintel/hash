use std::rc::Rc;

use super::{AgentIndex, BatchIndex, Error, Result};

#[derive(Debug, Clone, Default)]
pub struct InboundAgents {
    pub copy: Vec<(BatchIndex, Rc<Vec<AgentIndex>>)>,
    pub create: Option<Rc<Vec<AgentIndex>>>,
}

impl InboundAgents {
    pub fn with_copy_capacity(capacity: usize) -> InboundAgents {
        InboundAgents {
            copy: Vec::with_capacity(capacity),
            create: None,
        }
    }

    pub fn get_total_size(&self) -> usize {
        self.copy
            .iter()
            .fold(0_usize, |acc, (_src, v)| acc + v.len())
            + self.create.as_ref().map(|create| create.len()).unwrap_or(0)
    }

    pub fn get_next_n_agents(
        &self,
        starting_src_index: usize,
        starting_agent_index: usize,
        n: usize,
    ) -> Result<InboundAgentSelection> {
        let total_num_sources = self.copy.len() + self.create.as_ref().and(Some(1)).unwrap_or(0);
        let creating_agents = self.create.is_some();
        // log::debug!(
        //     "Getting next n agents {} {} {} {}, total_size: {}",
        //     starting_src_index,
        //     starting_agent_index,
        //     n,
        //     total_num_sources,
        //     self.get_total_size()
        // );
        if starting_src_index > total_num_sources {
            return Err(Error::from("Invalid starting src index"));
        } else if starting_src_index == total_num_sources {
            return Ok(InboundAgentSelection::empty(
                starting_src_index,
                starting_agent_index,
            ));
        }

        let mut remaining = n;
        let mut next_src_index = starting_src_index;
        let mut next_agent_index = starting_agent_index;
        let mut copy = Vec::new();
        let mut create = None;
        while next_src_index != total_num_sources && remaining > 0 {
            let (src, agents) = if creating_agents && next_src_index == total_num_sources - 1 {
                // We leave the agents that are created as the last source
                (None, self.create.as_ref())
            } else {
                let (src, agents) = &self.copy[next_src_index];
                (Some(*src), Some(agents))
            };

            debug_assert!(agents.is_some());

            // We've checked that `agents` is not None
            let agents = agents.unwrap();

            if next_agent_index == 0 && agents.len() <= remaining {
                // We can take this in bulk
                let new = Rc::clone(agents);
                if let Some(src) = src {
                    copy.push((src.clone(), new));
                } else {
                    create = Some(new)
                }
                next_src_index += 1;
                next_agent_index = 0;
                remaining -= agents.len();
            } else if agents.len() - next_agent_index <= remaining {
                // We can take the remaining in the current
                let take_amount = agents.len() - next_agent_index;
                let mut v = Vec::with_capacity(take_amount);
                (next_agent_index..agents.len()).for_each(|i| v.push(agents[i].clone()));
                let new = Rc::new(v);
                if let Some(src) = src {
                    copy.push((src.clone(), new));
                } else {
                    create = Some(new)
                }
                next_src_index += 1;
                next_agent_index = 0;
                remaining -= take_amount;
            } else {
                // We can't take all from the current, because we don't need as many
                let mut v = Vec::with_capacity(remaining);
                let last_agent_index = next_agent_index;
                next_agent_index = next_agent_index + remaining;
                (last_agent_index..next_agent_index).for_each(|i| v.push(agents[i].clone()));
                let new = Rc::new(v);
                if let Some(src) = src {
                    copy.push((src.clone(), new));
                } else {
                    create = Some(new)
                }
                remaining = 0;
                break;
            }
        }

        // Dbg: Verify `agent_number` == `n - remaining` is correct
        debug_assert_eq!(
            copy.iter().fold(0, |acc, next| acc + next.1.len())
                + create.as_ref().map(|a| a.len()).unwrap_or(0),
            n - remaining
        );
        // log::debug!("Got {} agents", n - remaining);
        Ok(InboundAgentSelection {
            copy,
            create,
            next_src_index,
            next_agent_index,
            num_agents: n - remaining,
        })
    }
}

pub struct InboundAgentSelection {
    pub copy: Vec<(BatchIndex, Rc<Vec<AgentIndex>>)>,
    pub create: Option<Rc<Vec<AgentIndex>>>,
    pub next_src_index: usize,
    pub next_agent_index: usize,
    pub num_agents: usize,
}

impl InboundAgentSelection {
    pub fn empty(next_src_index: usize, next_agent_index: usize) -> InboundAgentSelection {
        InboundAgentSelection {
            copy: Vec::new(),
            create: None,
            next_src_index,
            next_agent_index,
            num_agents: 0,
        }
    }
}
