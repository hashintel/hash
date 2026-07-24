//! The masked delivery chain.
//!
//! The cascade guarantees every occupied cell of a cut's grid a representative at or above the
//! cut, so an unmasked delivery is never empty for an occupied extent. A mask breaks that
//! guarantee for the scheduled points alone; the fill restores it from below: each level delivers
//! what the proof admits of its schedule, then pulls visible, undelivered points up from deeper
//! buckets until the schedule's own count is met - a masked view's tile is as full as the visible
//! world can make it, and its density mirrors the schedule's.
//!
//! Delivery is deterministic per `(generation, proof)` and never repeats a point down the zoom
//! ladder: [`Chain`] re-derives every ancestor's delivery first, so a level's fill starts where
//! the chain left off.

use super::{super::grid, DeliveredPoints, Walk};
use crate::{
    bitset::BitSet,
    file::quad::Node,
    morton::Depth,
    salt::wire::{Mode, tile::TileCoordinate},
};

/// A masked delivery with the chain state the response's other derivations read.
#[derive(Debug)]
pub(in crate::serve) struct MaskedDelivery {
    /// The gathered positions, natural runs first, the fill tail after.
    pub delivered: DeliveredPoints,
    /// The first bucket the runs describe.
    pub first_bucket: u8,
    /// Per-bucket natural counts.
    pub runs: Vec<u32>,
    /// The tail's length.
    pub backfilled: u32,
    /// Every position any chain level delivered.
    pub taken: BitSet,
    /// An ancestor's fill spent the subtree: nothing below this tile is left to deliver.
    pub dry: bool,
}

/// One masked level's delivery outcome.
#[derive(Debug, Copy, Clone)]
struct LevelDelivery {
    /// Points the fill pulled up from deeper buckets.
    backfilled: u32,
    /// The fill ended short of budget: the extent's deeper visible pool is spent.
    exhausted: bool,
}

/// The delivery chain's state: the taken set and the current level's output.
///
/// [`Chain::deliver`] replaces the output buffers per level while the taken set accumulates, so
/// re-deriving a tile's ancestors costs no allocation per level and the final level's output is
/// exactly the tile's delta.
#[derive(Debug)]
struct Chain<'walk, 'atlas> {
    walk: &'walk Walk<'atlas>,
    /// Every position any delivered level took, across the whole chain.
    taken: BitSet,
    /// The current level's delivered positions, ascending.
    out: Vec<u32>,
    /// The current level's per-bucket natural counts.
    runs: Vec<u32>,
}

impl<'walk, 'atlas> Chain<'walk, 'atlas> {
    /// Starts a chain over the walk's universe.
    fn new(walk: &'walk Walk<'atlas>) -> Self {
        let universe = usize::try_from(walk.morton.count()).expect("base positions fit usize");

        Self {
            walk,
            taken: BitSet::new(universe),
            out: Vec::new(),
            runs: Vec::new(),
        }
    }

    /// Delivers one level's delta under the mask, filling to the schedule's budget.
    ///
    /// The level's schedule is bucket `z + span` within its cell - buckets `0..=span` whole for
    /// the root - and its budget is the scheduled count before masking. Scheduled points the
    /// proof admits and no earlier level took deliver first, recounted into the level's runs per
    /// bucket; the fill then walks deeper buckets in order, morton order within a bucket, pulling
    /// visible, untaken points until the budget is met or the subtree is exhausted. Every
    /// delivered position lands in the taken set.
    fn deliver(&mut self, coordinate: TileCoordinate) -> LevelDelivery {
        self.out.clear();
        self.runs.clear();

        let cell =
            grid::cell_of(coordinate).expect("ancestors of a validated coordinate stay on grid");
        let cut = self.walk.grid.cut(coordinate.z).get();

        let mut budget = 0_usize;
        let mut delivered = 0_usize;
        for depth in self.walk.grid.level_buckets(coordinate.z) {
            let run = self.walk.run(depth, cell);
            budget += run.len();
            let before = self.out.len();
            for position in run {
                if self.walk.admits(position) && !self.taken.contains(position as usize) {
                    self.taken.insert(position as usize);
                    self.out.push(position);
                }
            }
            let count = u32::try_from(self.out.len() - before)
                .expect("run deltas lie within the u32 universe");
            self.runs.push(count);
            delivered += self.out.len() - before;
        }

        let mut backfilled = 0_u32;
        if delivered < budget {
            let deepest = u8::try_from(self.walk.deepest_occupied()).expect("buckets fit u8");
            'fill: for bucket in (cut + 1)..=deepest {
                let depth =
                    Depth::new(bucket).expect("the deepest occupied bucket wraps by contract");
                for position in self.walk.run(depth, cell) {
                    if self.walk.admits(position) && !self.taken.contains(position as usize) {
                        self.taken.insert(position as usize);
                        self.out.push(position);
                        backfilled += 1;
                        if delivered + backfilled as usize == budget {
                            break 'fill;
                        }
                    }
                }
            }
        }

        // A shortfall after the fill means the extent's deeper visible pool is spent.
        LevelDelivery {
            backfilled,
            exhausted: delivered + (backfilled as usize) < budget,
        }
    }
}

impl Walk<'_> {
    /// Gathers a masked delivery: the scheduled survivors plus the pull-up fill.
    ///
    /// A delta response carries this level's additions alone; a total response carries the whole
    /// chain's deliveries within the extent - the natural runs first, the fill tail after,
    /// `backfilled` counting the tail.
    pub(in crate::serve) fn gather_masked(
        &self,
        coordinate: TileCoordinate,
        mode: Mode,
    ) -> MaskedDelivery {
        let mut chain = Chain::new(self);

        let mut dry = false;
        for level in 0..coordinate.z {
            let shift = coordinate.z - level;
            let ancestor = TileCoordinate {
                z: level,
                x: coordinate.x >> shift,
                y: coordinate.y >> shift,
            };
            if chain.deliver(ancestor).exhausted {
                // Every descendant extent is a subset of this level's, whose deeper visible
                // pool the fill spent: the rest of the chain and this tile deliver nothing new.
                dry = true;
                break;
            }
        }

        match mode {
            Mode::Delta => {
                let backfilled = if dry {
                    // The one delta run keeps its positional slot, empty.
                    chain.out.clear();
                    chain.runs.clear();
                    chain.runs.push(0);
                    0
                } else {
                    chain.deliver(coordinate).backfilled
                };

                let first_bucket = if coordinate.z == 0 {
                    0
                } else {
                    self.grid.cut(coordinate.z).get()
                };
                let Chain {
                    taken, out, runs, ..
                } = chain;
                MaskedDelivery {
                    delivered: DeliveredPoints::Positions(out),
                    first_bucket,
                    runs,
                    backfilled,
                    taken,
                    dry,
                }
            }
            Mode::Total => {
                // The chain through this level settles which deeper points were pulled up; a
                // dry chain already settled them all.
                if !dry {
                    chain.deliver(coordinate);
                }

                let cell = grid::cell_of(coordinate).expect("assembly validated the coordinate");
                let cut = self.grid.cut(coordinate.z).get();

                // Every visible scheduled point is delivered by its own level of the chain, so
                // the cumulative natural segment is the schedule's visible survivors verbatim.
                let mut cumulative = Vec::new();
                let mut cumulative_runs = Vec::with_capacity(usize::from(cut) + 1);
                for depth in self.grid.cut_buckets(coordinate.z) {
                    let before = cumulative.len();
                    for position in self.run(depth, cell) {
                        if self.admits(position) {
                            cumulative.push(position);
                        }
                    }
                    let count = u32::try_from(cumulative.len() - before)
                        .expect("run deltas lie within the u32 universe");
                    cumulative_runs.push(count);
                }

                // The tail: deeper extent points some level of the chain pulled up. Taken
                // positions are visible by construction.
                let deepest = u8::try_from(self.deepest_occupied()).expect("buckets fit u8");
                let mut backfilled = 0_u32;
                for bucket in (cut + 1)..=deepest {
                    let depth =
                        Depth::new(bucket).expect("the deepest occupied bucket wraps by contract");
                    for position in self.run(depth, cell) {
                        if chain.taken.contains(position as usize) {
                            cumulative.push(position);
                            backfilled += 1;
                        }
                    }
                }

                MaskedDelivery {
                    delivered: DeliveredPoints::Positions(cumulative),
                    first_bucket: 0,
                    runs: cumulative_runs,
                    backfilled,
                    taken: chain.taken,
                    dry,
                }
            }
        }
    }

    /// Reads the occupied-child bitmask over the masked view.
    ///
    /// Bit `i` set when Morton child `i` holds a visible point below this zoom's cut that no
    /// level of the delivery chain already pulled up.
    ///
    /// The walk descends each child's quad subtree and scans every node's own-bucket run until an
    /// undelivered visible row surfaces, so a child whose subtree the mask empties - or whose
    /// visible points this response's fill already delivered - reads unoccupied: the client never
    /// fetches a tile that has nothing left to say, and the bitmask carries no evidence that
    /// hidden points exist.
    pub(in crate::serve) fn visible_children(&self, node: &Node, taken: &BitSet) -> u8 {
        let mut bits = 0_u8;

        for (index, quadrant) in node.children().iter().enumerate() {
            let &Some(child) = quadrant else { continue };
            let occupied = self.subtree_has_visible(child, taken);

            bits |= u8::from(occupied) << index;
        }

        bits
    }

    /// Returns whether any node in the quad subtree rooted at `index` delivers a visible,
    /// untaken row.
    fn subtree_has_visible(&self, index: u32, taken: &BitSet) -> bool {
        let nodes = self.quad.nodes();

        let mut stack = vec![index];
        while let Some(index) = stack.pop() {
            let node = &nodes[index as usize];
            for position in super::narrow_run(node.run()) {
                if self.admits(position) && !taken.contains(position as usize) {
                    return true;
                }
            }

            for quadrant in 0..4 {
                if let Some(child) = node.child(quadrant) {
                    stack.push(child);
                }
            }
        }

        false
    }
}
