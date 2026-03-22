use core::alloc::Allocator;

use super::{ApproxCost, StatementCostVec, TerminatorCostVec};
use crate::{
    body::basic_block::{BasicBlock, BasicBlockId, BasicBlockSlice, BasicBlockVec},
    pass::{
        analysis::size_estimation::{InformationRange, range::SaturatingMul as _},
        execution::{
            TargetId, VertexType,
            target::{TargetArray, TargetBitSet},
            traversal::{
                TransferCostConfig, TraversalAnalysisVisitor, TraversalPathBitSet, TraversalResult,
            },
        },
    },
    visit::Visitor as _,
};

/// Cost of running a single basic block on one target.
///
/// Separates the statement cost sum (`base`) from the path transfer premium (`load`) so that
/// callers can inspect or log each component independently, even though the solver only sees
/// the combined [`total`](Self::total).
#[derive(Debug, Copy, Clone)]
struct BasicBlockTargetCost {
    /// Sum of per-statement costs for this target (from [`StatementCostVec::sum_approx`]).
    base: ApproxCost,
    /// Transfer premium for vertex paths accessed in this block whose origin is a different
    /// backend. Zero when the target is the natural origin for every accessed path.
    load: ApproxCost,
}

impl BasicBlockTargetCost {
    const ZERO: Self = Self {
        base: ApproxCost::ZERO,
        load: ApproxCost::ZERO,
    };

    fn total(self) -> ApproxCost {
        self.base + self.load
    }
}

/// Precomputed cost for one basic block across all candidate targets.
#[derive(Debug, Copy, Clone)]
struct BasicBlockCost {
    /// Which targets can execute this block (copied from the domain after AC-3).
    targets: TargetBitSet,
    /// Per-target cost (only entries where `targets` is set are meaningful).
    costs: TargetArray<BasicBlockTargetCost>,
}

/// Per-block cost map for the entire body.
///
/// Indexed by [`BasicBlockId`]. Each entry stores the set of candidate targets and the
/// combined (statement + path transfer) cost for each candidate.
///
/// Produced by [`BasicBlockCostAnalysis::analyze_in`] and consumed by the placement solver.
#[derive(Debug)]
pub(crate) struct BasicBlockCostVec<A: Allocator> {
    inner: BasicBlockVec<BasicBlockCost, A>,
}

impl<A: Allocator> BasicBlockCostVec<A> {
    /// Returns the set of candidate targets for `block`.
    pub(crate) fn assignments(&self, block: BasicBlockId) -> TargetBitSet {
        self.inner[block].targets
    }

    /// Returns the total cost (statement base + path transfer load) of placing `block` on
    /// `target`.
    ///
    /// # Panics
    ///
    /// Debug-asserts that `target` is in the block's candidate domain.
    pub(crate) fn cost(&self, block: BasicBlockId, target: TargetId) -> ApproxCost {
        let entry = &self.inner[block];

        debug_assert!(
            entry.targets.contains(target),
            "target {target:?} is not in the domain of block {block:?}"
        );

        entry.costs[target].total()
    }
}

/// Computes per-block costs by combining statement costs with path transfer premiums.
///
/// For each block, walks the MIR statements to discover which vertex paths are accessed,
/// then charges a transfer premium on every target that is not the natural origin for those
/// paths. The premium is the estimated transfer size multiplied by the target's cost
/// multiplier.
///
/// Path premiums are charged once per block (intra-block dedup), not once per statement.
/// Composite paths are kept as-is rather than expanded to leaves, under the assumption that
/// a composite fetch is cheaper than fetching each leaf independently.
pub(crate) struct BasicBlockCostAnalysis<'ctx, A: Allocator> {
    pub vertex: VertexType,
    pub assignments: &'ctx BasicBlockSlice<TargetBitSet>,
    pub statement_costs: &'ctx TargetArray<StatementCostVec<A>>,
    pub terminator_costs: &'ctx TargetArray<TerminatorCostVec<A>>,
}

impl<A: Allocator> BasicBlockCostAnalysis<'_, A> {
    fn analyze_basic_block_target(
        &self,
        config: &TransferCostConfig,
        id: BasicBlockId,
        target: TargetId,
        traversals: TraversalPathBitSet,
    ) -> BasicBlockTargetCost {
        let mut base = self.statement_costs[target].sum_approx(id);
        base += self.terminator_costs[target].approx(id);

        let mut range = InformationRange::zero();

        // For *any* target that is *not* able to be assigned in this block, add the cost to the
        // total range.
        for path in &traversals {
            if !path.origin().contains(target) {
                range += path.estimate_size(config);
            }
        }

        let load = range
            .saturating_mul(config.target_multiplier[target].get())
            .midpoint()
            .map_or(ApproxCost::INF, From::from);

        BasicBlockTargetCost { base, load }
    }

    fn analyze_basic_block(
        &self,
        config: &TransferCostConfig,
        id: BasicBlockId,
        block: &BasicBlock<'_>,
    ) -> BasicBlockCost {
        let targets = self.assignments[id];
        let mut costs = TargetArray::from_raw([BasicBlockTargetCost::ZERO; _]);

        // We do not expand to the leaf nodes on purpose, we work under the assumption that any
        // composite path that is given is more efficient than its individual components and will
        // always be fetched together, therefore the cost of the parent must be used to accurately
        // describe the cost. If a node can be used in multiple places at the same time, then fetch
        // from the composite will always be preferred.
        let mut traversals = TraversalPathBitSet::empty(self.vertex);
        let mut visitor = TraversalAnalysisVisitor::new(self.vertex, |_, result| match result {
            TraversalResult::Path(path) => traversals.insert(path),
            TraversalResult::Complete => traversals.insert_all(),
        });
        Ok(()) = visitor.visit_basic_block(id, block);

        for target in &targets {
            costs[target] = self.analyze_basic_block_target(config, id, target, traversals);
        }

        BasicBlockCost { targets, costs }
    }

    /// Computes per-block costs for every block in `blocks`.
    pub(crate) fn analyze_in(
        &self,
        config: &TransferCostConfig,
        blocks: &BasicBlockSlice<BasicBlock<'_>>,
        alloc: A,
    ) -> BasicBlockCostVec<A> {
        let inner = BasicBlockVec::from_domain_derive_in(
            |id, block| self.analyze_basic_block(config, id, block),
            blocks,
            alloc,
        );

        BasicBlockCostVec { inner }
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars)]
    use alloc::alloc::Global;

    use hashql_core::{heap::Heap, symbol::sym, r#type::environment::Environment};

    use super::*;
    use crate::{
        body::basic_block::BasicBlockId,
        builder::body,
        intern::Interner,
        pass::{
            analysis::size_estimation::{InformationRange, InformationUnit},
            execution::traversal::TransferCostConfig,
        },
    };

    fn all_targets() -> TargetBitSet {
        let mut set = TargetBitSet::new_empty(TargetId::VARIANT_COUNT_U32);
        for target in TargetId::all() {
            set.insert(target);
        }
        set
    }

    fn default_config() -> TransferCostConfig {
        TransferCostConfig::new(InformationRange::full())
    }

    fn make_targets(body: &crate::body::Body<'_>, domain: TargetBitSet) -> Vec<TargetBitSet> {
        body.basic_blocks.iter().map(|_| domain).collect()
    }

    /// A block with no vertex accesses has zero load cost on every target.
    #[test]
    fn no_vertex_access_zero_load() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);
        let env = Environment::new(&heap);

        let body = body!(interner, env; [graph::read::filter]@0/2 -> Int {
            decl env: (Int), vertex: [Opaque sym::path::Entity; ?], val: Int;
            @proj env_0 = env.0: Int;

            bb0() {
                val = load env_0;
                return val;
            }
        });

        let targets = make_targets(&body, all_targets());
        let targets = BasicBlockSlice::from_raw(&targets);

        let costs: TargetArray<StatementCostVec<Global>> =
            TargetArray::from_fn(|_| StatementCostVec::from_iter([1].into_iter(), Global));

        let analysis = BasicBlockCostAnalysis {
            vertex: VertexType::Entity,
            assignments: targets,
            statement_costs: &costs,
        };

        let result = analysis.analyze_in(&default_config(), &body.basic_blocks, Global);
        let bb0 = BasicBlockId::new(0);

        for target in TargetId::all() {
            let total = result.cost(bb0, target);
            let base = costs[target].sum_approx(bb0);
            assert_eq!(total, base, "target {target:?} should have zero load cost");
        }
    }

    /// Accessing Vectors (Embedding-origin) charges load on Interpreter and Postgres
    /// but not on Embedding.
    #[test]
    fn vectors_path_charges_non_origin_targets() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);
        let env = Environment::new(&heap);

        let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
            decl env: (), vertex: [Opaque sym::path::Entity; ?], val: ?;
            @proj encodings = vertex.encodings: ?,
                  vectors = encodings.vectors: ?;

            bb0() {
                val = load vectors;
                return val;
            }
        });

        let targets = make_targets(&body, all_targets());
        let targets = BasicBlockSlice::from_raw(&targets);

        let costs: TargetArray<StatementCostVec<Global>> =
            TargetArray::from_fn(|_| StatementCostVec::from_iter([1].into_iter(), Global));

        let analysis = BasicBlockCostAnalysis {
            vertex: VertexType::Entity,
            assignments: targets,
            statement_costs: &costs,
        };

        let config = default_config();
        let result = analysis.analyze_in(&config, &body.basic_blocks, Global);
        let bb0 = BasicBlockId::new(0);

        let embedding_cost = result.cost(bb0, TargetId::Embedding);
        let embedding_base = costs[TargetId::Embedding].sum_approx(bb0);
        assert_eq!(
            embedding_cost, embedding_base,
            "Embedding is origin for Vectors; no load premium"
        );

        let interpreter_cost = result.cost(bb0, TargetId::Interpreter);
        let interpreter_base = costs[TargetId::Interpreter].sum_approx(bb0);
        assert!(
            interpreter_cost > interpreter_base,
            "Interpreter should pay load premium for Vectors"
        );

        let postgres_cost = result.cost(bb0, TargetId::Postgres);
        let postgres_base = costs[TargetId::Postgres].sum_approx(bb0);
        assert!(
            postgres_cost > postgres_base,
            "Postgres should pay load premium for Vectors"
        );
    }

    /// Accessing Archived (Postgres-origin) charges load on non-Postgres targets.
    #[test]
    fn postgres_path_charges_non_postgres_targets() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);
        let env = Environment::new(&heap);

        let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
            decl env: (), vertex: [Opaque sym::path::Entity; ?], val: Bool;
            @proj metadata = vertex.metadata: ?, archived = metadata.archived: Bool;

            bb0() {
                val = load archived;
                return val;
            }
        });

        let targets = make_targets(&body, all_targets());
        let targets = BasicBlockSlice::from_raw(&targets);

        let costs: TargetArray<StatementCostVec<Global>> =
            TargetArray::from_fn(|_| StatementCostVec::from_iter([1].into_iter(), Global));

        let analysis = BasicBlockCostAnalysis {
            vertex: VertexType::Entity,
            assignments: targets,
            statement_costs: &costs,
        };

        let result = analysis.analyze_in(&default_config(), &body.basic_blocks, Global);
        let bb0 = BasicBlockId::new(0);

        let postgres_cost = result.cost(bb0, TargetId::Postgres);
        let postgres_base = costs[TargetId::Postgres].sum_approx(bb0);
        assert_eq!(
            postgres_cost, postgres_base,
            "Postgres is origin for Archived; no load premium"
        );

        let interpreter_cost = result.cost(bb0, TargetId::Interpreter);
        let interpreter_base = costs[TargetId::Interpreter].sum_approx(bb0);
        assert!(
            interpreter_cost > interpreter_base,
            "Interpreter should pay load premium for Archived"
        );

        let embedding_cost = result.cost(bb0, TargetId::Embedding);
        let embedding_base = costs[TargetId::Embedding].sum_approx(bb0);
        assert!(
            embedding_cost > embedding_base,
            "Embedding should pay load premium for Archived"
        );
    }

    /// Properties (Postgres) + Vectors (Embedding) in one block: Interpreter pays both
    /// premiums, Postgres pays only Vectors, Embedding pays only Properties.
    #[test]
    fn multiple_paths_accumulate_load() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);
        let env = Environment::new(&heap);

        let body = body!(interner, env; [graph::read::filter]@0/2 -> (?, ?) {
            decl env: (), vertex: [Opaque sym::path::Entity; ?], result: (?, ?);
            @proj properties = vertex.properties: ?,
                  encodings = vertex.encodings: ?,
                  vectors = encodings.vectors: ?;

            bb0() {
                result = tuple properties, vectors;
                return result;
            }
        });

        let targets = make_targets(&body, all_targets());
        let targets = BasicBlockSlice::from_raw(&targets);

        let costs: TargetArray<StatementCostVec<Global>> =
            TargetArray::from_fn(|_| StatementCostVec::from_iter([1].into_iter(), Global));

        let analysis = BasicBlockCostAnalysis {
            vertex: VertexType::Entity,
            assignments: targets,
            statement_costs: &costs,
        };

        // Use a bounded properties size so both premiums are finite and comparable.
        let config = TransferCostConfig::new(InformationRange::value(InformationUnit::new(100)));
        let result = analysis.analyze_in(&config, &body.basic_blocks, Global);
        let bb0 = BasicBlockId::new(0);

        let interpreter_cost = result.cost(bb0, TargetId::Interpreter);
        let postgres_cost = result.cost(bb0, TargetId::Postgres);
        let embedding_cost = result.cost(bb0, TargetId::Embedding);

        // Interpreter pays both premiums, so it's the most expensive
        assert!(
            interpreter_cost > postgres_cost,
            "Interpreter pays both premiums, Postgres only Vectors"
        );
        assert!(
            interpreter_cost > embedding_cost,
            "Interpreter pays both premiums, Embedding only Properties"
        );

        // Both Postgres and Embedding pay above their base
        let postgres_base = costs[TargetId::Postgres].sum_approx(bb0);
        let embedding_base = costs[TargetId::Embedding].sum_approx(bb0);
        assert!(postgres_cost > postgres_base);
        assert!(embedding_cost > embedding_base);
    }

    /// `RecordId` (composite) expands to leaf descendants. All leaves are Postgres-origin,
    /// so Postgres pays no premium and Interpreter does.
    #[test]
    fn composite_path_expands_to_leaves() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);
        let env = Environment::new(&heap);

        let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
            decl env: (), vertex: [Opaque sym::path::Entity; ?], val: ?;
            @proj metadata = vertex.metadata: ?,
                  record_id = metadata.record_id: ?;

            bb0() {
                val = load record_id;
                return val;
            }
        });

        let targets = make_targets(&body, all_targets());
        let targets = BasicBlockSlice::from_raw(&targets);

        let costs: TargetArray<StatementCostVec<Global>> =
            TargetArray::from_fn(|_| StatementCostVec::from_iter([1].into_iter(), Global));

        // Use zero properties size so Properties path doesn't contribute noise
        let config = TransferCostConfig::new(InformationRange::zero());
        let analysis = BasicBlockCostAnalysis {
            vertex: VertexType::Entity,
            assignments: targets,
            statement_costs: &costs,
        };

        let result = analysis.analyze_in(&config, &body.basic_blocks, Global);
        let bb0 = BasicBlockId::new(0);

        let postgres_cost = result.cost(bb0, TargetId::Postgres);
        let postgres_base = costs[TargetId::Postgres].sum_approx(bb0);
        assert_eq!(
            postgres_cost, postgres_base,
            "Postgres is origin for all RecordId leaves"
        );

        let interpreter_cost = result.cost(bb0, TargetId::Interpreter);
        let interpreter_base = costs[TargetId::Interpreter].sum_approx(bb0);
        assert!(
            interpreter_cost > interpreter_base,
            "Interpreter should pay load premium for RecordId leaves"
        );
    }

    /// With a restricted target domain, only available targets are analyzed.
    #[test]
    fn restricted_target_domain() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);
        let env = Environment::new(&heap);

        let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
            decl env: (), vertex: [Opaque sym::path::Entity; ?], val: Bool;
            @proj metadata = vertex.metadata: ?, archived = metadata.archived: Bool;

            bb0() {
                val = load archived;
                return val;
            }
        });

        let mut restricted = TargetBitSet::new_empty(TargetId::VARIANT_COUNT_U32);
        restricted.insert(TargetId::Postgres);
        restricted.insert(TargetId::Interpreter);
        let targets = make_targets(&body, restricted);
        let targets = BasicBlockSlice::from_raw(&targets);

        let costs: TargetArray<StatementCostVec<Global>> =
            TargetArray::from_fn(|_| StatementCostVec::from_iter([1].into_iter(), Global));

        let analysis = BasicBlockCostAnalysis {
            vertex: VertexType::Entity,
            assignments: targets,
            statement_costs: &costs,
        };

        let result = analysis.analyze_in(&default_config(), &body.basic_blocks, Global);
        let bb0 = BasicBlockId::new(0);

        let postgres_cost = result.cost(bb0, TargetId::Postgres);
        let postgres_base = costs[TargetId::Postgres].sum_approx(bb0);
        assert_eq!(postgres_cost, postgres_base);

        let interpreter_cost = result.cost(bb0, TargetId::Interpreter);
        let interpreter_base = costs[TargetId::Interpreter].sum_approx(bb0);
        assert!(interpreter_cost > interpreter_base);
    }

    /// Paths across multiple blocks are analyzed independently per block.
    #[test]
    fn paths_across_blocks_independent() {
        let heap = Heap::new();
        let interner = Interner::new(&heap);
        let env = Environment::new(&heap);

        let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
            decl env: (), vertex: [Opaque sym::path::Entity; ?],
                 props: ?, val: Bool, cond: Bool;
            @proj properties = vertex.properties: ?,
                  encodings = vertex.encodings: ?,
                  vectors = encodings.vectors: ?;

            bb0() {
                props = load properties;
                cond = load true;
                if cond then bb1() else bb2();
            },
            bb1() {
                val = load vectors;
                return val;
            },
            bb2() {
                return cond;
            }
        });

        let targets = make_targets(&body, all_targets());
        let targets = BasicBlockSlice::from_raw(&targets);

        let costs: TargetArray<StatementCostVec<Global>> =
            TargetArray::from_fn(|_| StatementCostVec::from_iter([2, 1, 0].into_iter(), Global));

        let config = default_config();
        let analysis = BasicBlockCostAnalysis {
            vertex: VertexType::Entity,
            assignments: targets,
            statement_costs: &costs,
        };

        let result = analysis.analyze_in(&config, &body.basic_blocks, Global);

        let bb0 = BasicBlockId::new(0);
        let bb1 = BasicBlockId::new(1);
        let bb2 = BasicBlockId::new(2);

        // bb0 accesses Properties (Postgres-origin): Postgres no premium, others pay
        let bb0_postgres = result.cost(bb0, TargetId::Postgres);
        let bb0_postgres_base = costs[TargetId::Postgres].sum_approx(bb0);
        assert_eq!(bb0_postgres, bb0_postgres_base);

        let bb0_interpreter = result.cost(bb0, TargetId::Interpreter);
        let bb0_interpreter_base = costs[TargetId::Interpreter].sum_approx(bb0);
        assert!(bb0_interpreter > bb0_interpreter_base);

        // bb1 accesses Vectors (Embedding-origin): Embedding no premium, others pay
        let bb1_embedding = result.cost(bb1, TargetId::Embedding);
        let bb1_embedding_base = costs[TargetId::Embedding].sum_approx(bb1);
        assert_eq!(bb1_embedding, bb1_embedding_base);

        let bb1_postgres = result.cost(bb1, TargetId::Postgres);
        let bb1_postgres_base = costs[TargetId::Postgres].sum_approx(bb1);
        assert!(bb1_postgres > bb1_postgres_base);

        // bb2 has no vertex accesses: all targets equal base
        for target in TargetId::all() {
            let cost = result.cost(bb2, target);
            let base = costs[target].sum_approx(bb2);
            assert_eq!(cost, base, "bb2 target {target:?} should have zero load");
        }
    }
}
