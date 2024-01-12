use std::collections::{HashMap, HashSet};

use bytes::Bytes;
use specta::{DataTypeReference, NamedDataType, SpectaID, TypeMap};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum EdgeKind {
    Direct,
    Suspended,
}

struct Edge {
    kind: EdgeKind,
    to: StatementId,
}

pub(crate) struct DependencyGraph {
    edges: HashMap<StatementId, Vec<Edge>>,
}

impl DependencyGraph {
    pub(crate) fn new() -> Self {
        Self {
            edges: HashMap::new(),
        }
    }

    fn has_cycle_visit(
        &self,
        statement: StatementId,
        discovered: &mut HashSet<StatementId>,
        finished: &mut HashSet<StatementId>,
    ) -> bool {
        discovered.insert(statement);

        if let Some(edges) = self.edges.get(&statement) {
            for edge in edges {
                if edge.kind == EdgeKind::Suspended {
                    continue;
                }

                if discovered.contains(&edge.to) {
                    return true;
                }

                if !finished.contains(&edge.to)
                    && self.has_cycle_visit(edge.to, discovered, finished)
                {
                    return true;
                }
            }
        }

        discovered.remove(&statement);
        finished.insert(statement);

        false
    }

    // Implementation of DFS for cycle detection based on https://stackoverflow.com/a/53995651/9077988
    fn has_cycle(&self) -> bool {
        let mut discovered = HashSet::new();
        let mut finished = HashSet::new();

        for &statement in self.edges.keys() {
            if discovered.contains(&statement) || finished.contains(&statement) {
                continue;
            }

            if self.has_cycle_visit(statement, &mut discovered, &mut finished) {
                return true;
            }
        }

        false
    }

    fn add(&mut self, statement: StatementId, depends_on: StatementId) -> EdgeKind {
        // ensure that the statement exists
        self.edges.entry(depends_on).or_default();

        let vec = self.edges.entry(statement).or_default();

        // does the edge already exist?
        if let Some(edge) = vec.iter().find(|edge| edge.to == depends_on) {
            return edge.kind;
        }

        // would adding the edge create a cycle?
        vec.push(Edge {
            kind: EdgeKind::Direct,
            to: depends_on,
        });

        if !self.has_cycle() {
            return EdgeKind::Direct;
        }

        // cycle detected, add a suspended edge instead
        let vec = self.edges.entry(statement).or_default();
        vec.pop();
        vec.push(Edge {
            kind: EdgeKind::Suspended,
            to: depends_on,
        });
        assert!(!self.has_cycle());

        EdgeKind::Suspended
    }

    fn visit(
        &self,
        statement: &StatementId,
        sorted: &mut Vec<StatementId>,
        visited: &mut HashMap<StatementId, bool>,
    ) {
        if let Some(&visited_statement) = visited.get(statement) {
            if visited_statement {
                return;
            }

            panic!("cyclic dependency");
        }

        visited.insert(*statement, false);

        if let Some(edges) = self.edges.get(statement) {
            for edge in edges {
                if edge.kind == EdgeKind::Suspended {
                    continue;
                }

                self.visit(&edge.to, sorted, visited);
            }
        }

        visited.insert(*statement, true);
        sorted.push(*statement);
    }

    pub(crate) fn topo_sort(&self) -> Vec<StatementId> {
        let mut sorted = vec![];
        let mut visited = HashMap::new();

        for statement in self.edges.keys() {
            self.visit(statement, &mut sorted, &mut visited);
        }

        sorted
    }

    pub(crate) fn rebuild(&mut self, queue: impl Iterator<Item = StatementId>) {
        for statement in queue {
            self.edges.entry(statement).or_default();
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct StatementId(Option<SpectaID>);

impl StatementId {
    pub(crate) const fn local(id: SpectaID) -> Self {
        Self(Some(id))
    }

    pub(crate) const fn global() -> Self {
        Self(None)
    }

    pub(crate) const fn is_global(&self) -> bool {
        self.0.is_none()
    }

    pub(crate) const fn specta_id(&self) -> Option<SpectaID> {
        self.0
    }
}

pub(crate) struct GlobalContext {
    pub(crate) graph: DependencyGraph,
    pub(crate) queue: Vec<NamedDataType>,
    pub(crate) statements: HashMap<StatementId, Bytes>,
    pub(crate) types: TypeMap,
}

impl GlobalContext {
    pub(crate) fn new(types: TypeMap) -> Self {
        let mut this = Self {
            graph: DependencyGraph::new(),
            queue: vec![],
            statements: HashMap::new(),
            types,
        };

        this.rebuild();

        this
    }

    pub(crate) fn rebuild(&mut self) {
        self.queue.clear();
        self.queue
            .extend(self.types.iter().map(|(_, ast)| ast.clone()));

        self.graph.rebuild(
            self.types
                .iter()
                .map(|(key, _)| key)
                .map(StatementId::local),
        );
    }

    pub(crate) fn scoped(&mut self, id: StatementId) -> ScopedContext {
        ScopedContext {
            parents: vec![],
            current: id,

            global: self,
        }
    }
}

pub(crate) struct ScopedContext<'a> {
    pub(crate) parents: Vec<StatementId>,
    pub(crate) current: StatementId,

    pub(crate) global: &'a mut GlobalContext,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum HoistAction {
    Hoisted,
    DirectRecursion,
    ParentRecursion,
    Suspend,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) enum ReferenceAction {
    Suspend,
    Direct,
}

impl ScopedContext<'_> {
    pub(crate) fn references(&mut self, reference: &DataTypeReference) -> ReferenceAction {
        let sid = reference.sid();
        let id = StatementId::local(sid);

        if self.global.graph.add(self.current, id) == EdgeKind::Suspended {
            return ReferenceAction::Suspend;
        }

        if self.parents.contains(&id) || self.current == id {
            return ReferenceAction::Suspend;
        }

        ReferenceAction::Direct
    }

    pub(crate) fn hoist(&mut self, id: StatementId, ast: NamedDataType) -> HoistAction {
        if id == self.current {
            return HoistAction::DirectRecursion;
        }

        if self.parents.contains(&id) {
            return HoistAction::ParentRecursion;
        }

        if self.global.graph.add(self.current, id) == EdgeKind::Suspended {
            return HoistAction::Suspend;
        }

        if !self.global.queue.contains(&ast) || !self.global.statements.contains_key(&id) {
            self.global.queue.push(ast);
        }

        HoistAction::Hoisted
    }
}
