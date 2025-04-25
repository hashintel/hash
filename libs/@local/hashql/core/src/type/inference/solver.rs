use bitvec::{bitbox, boxed::BitBox};
use ena::unify::{InPlaceUnificationTable, NoError};
use hashbrown::HashMap;

use super::{Constraint, Variable, VariableId};
use crate::r#type::environment::Environment;

pub(crate) struct Unification {
    table: InPlaceUnificationTable<VariableId>,

    variables: Vec<Variable>,
    lookup: HashMap<Variable, VariableId, foldhash::fast::RandomState>,
}

impl Unification {
    pub(crate) fn new() -> Self {
        Self {
            table: InPlaceUnificationTable::new(),
            variables: Vec::new(),
            lookup: HashMap::default(),
        }
    }

    pub(crate) fn upsert_variable(&mut self, variable: Variable) -> VariableId {
        *self.lookup.entry(variable).or_insert_with_key(|&key| {
            let id = self.table.new_key(());
            self.variables.push(key);
            id
        })
    }

    pub(crate) fn unify(&mut self, lhs: Variable, rhs: Variable) {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table
            .unify_var_var(lhs, rhs)
            .unwrap_or_else(|_: NoError| unreachable!());
    }

    pub(crate) fn is_unionied(&mut self, lhs: Variable, rhs: Variable) -> bool {
        let lhs = self.upsert_variable(lhs);
        let rhs = self.upsert_variable(rhs);

        self.table.unioned(lhs, rhs)
    }

    pub(crate) fn root(&mut self, variable: Variable) -> VariableId {
        let id = self.lookup[&variable];

        self.table.find(id)
    }
}

struct InferenceSolver<'env, 'heap> {
    environment: &'env Environment<'heap>,
    constraints: Vec<Constraint>,
    unification: Unification,
}

impl<'env, 'heap> InferenceSolver<'env, 'heap> {
    pub fn solve(mut self) {
        // We first create a graph of all the inference variables, that's then used to see if there
        // are any variables that can be equalized, for example due to the partial order of
        // subtyping, we can suppose that if `A <: B <: A`, that `A == B`.
        let variables = self.unification.variables.len();

        // Our graph is a simple adjacency list, where each slot corresponds to a variable,
        // variables that have been unified simply have no connections.
        let mut list = Vec::with_capacity(variables);
        list.resize(variables, bitbox![0; variables]);

        for &constraint in &self.constraints {
            let Constraint::Ordering { lower, upper } = constraint else {
                continue;
            };

            // We don't really care in which direction we record the constraints (as they're only
            // used to find the connected component) but they should be consistent. In
            // our case, we record the subtype relationship, e.g. `lower is a subtype of upper`,
            // therefore `lower -> upper`.

            // We also need to make sure that we only use the root keys from the variables.
            let lower = self.unification.root(lower);
            let upper = self.unification.root(upper);
            list[lower.0 as usize].set(upper.0 as usize, true);
        }
    }
}

fn kosaraju_dfs(graph: &[BitBox], node: usize, visited: &mut BitBox, stack: &mut Vec<usize>) {
    if visited[node] {
        return;
    }

    visited.set(node, true);
    for neighbor in graph[node].iter_ones() {
        kosaraju_dfs(graph, neighbor, visited, stack);
    }

    stack.push(node);
}

fn kosaraju_assign(
    graph: &[BitBox],
    node: usize,
    root: usize,
    assigned: &mut BitBox,
    results: &mut Vec<BitBox>,
) {
    if assigned[node] {
        return;
    }

    assigned.set(node, true);
    results[root].set(node, true);

    // We only have the **out** nodes, therefore we need to traverse the **in** nodes to find the
    // root.
    for (incoming, _) in graph
        .iter()
        .enumerate()
        .filter(|&(_, outgoing)| outgoing[node])
    {
        kosaraju_assign(graph, incoming, root, assigned, results);
    }
}

fn kosaraju_scc(graph: &[BitBox]) -> Vec<BitBox> {
    // For each vertex of the graph, mark `u` as unvisited, let `L` be empty
    let mut visited = bitbox![0; graph.len()];
    let mut stack = Vec::new();

    // depth-first search from every vertex,
    for node in 0..graph.len() {
        kosaraju_dfs(graph, node, &mut visited, &mut stack);
    }

    // reverse the stack, as we "prepend"
    stack.reverse();

    let mut results = Vec::with_capacity(stack.len());
    results.resize(stack.len(), bitbox![0; graph.len()]);

    // For each element `u` of `L` in order, do `Assign(u, u)` where `Assign(u, root)` is a the
    // recursive subroutine
    visited.fill(false);
    for node in stack {
        kosaraju_assign(graph, node, node, &mut visited, &mut results);
    }

    results
        .into_iter()
        .filter(|result| !result.is_empty())
        .collect()
}
