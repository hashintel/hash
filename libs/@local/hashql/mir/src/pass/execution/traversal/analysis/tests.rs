#![expect(clippy::min_ident_chars)]
use hashql_core::{heap::Heap, id::Id as _, symbol::sym, r#type::environment::Environment};
use hashql_diagnostics::DiagnosticIssues;

use crate::{
    body::{Body, basic_block::BasicBlockId, location::Location},
    builder::body,
    context::MirContext,
    intern::Interner,
    pass::execution::traversal::{
        EntityPath,
        analysis::{TraversalAnalysis, Traversals},
    },
};

fn analyze<'heap>(context: &MirContext<'_, 'heap>, body: &Body<'heap>) -> Traversals<&'heap Heap> {
    TraversalAnalysis::traversal_analysis_in(context, body, context.heap)
}

fn location(block: usize, statement_index: usize) -> Location {
    Location {
        block: BasicBlockId::from_usize(block),
        statement_index,
    }
}

/// Accessing `_1.properties` records `{Properties}` at the statement.
#[test]
fn single_leaf_path() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], props: ?;
        @proj properties = vertex.properties: ?;

        bb0() {
            props = load properties;
            return props;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    // statement 0: props = load _1.properties
    let stmt = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(stmt.contains(EntityPath::Properties));
    assert_eq!(stmt.len(), 1);

    // terminator: return props (not a vertex access)
    let term = traversals[location(0, 2)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(term.is_empty());
}

/// Chained projections `_1.metadata.archived` resolve to `{Archived}`.
#[test]
fn multi_segment_path() {
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

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    let stmt = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(stmt.contains(EntityPath::Archived));
    assert_eq!(stmt.len(), 1);
}

/// Bare vertex access (`load _1`) sets all bits via `insert_all`.
#[test]
fn bare_vertex_sets_all_bits() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], val: ?;

        bb0() {
            val = load vertex;
            return val;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    let stmt = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    // Composites present, their children subsumed
    assert!(stmt.contains(EntityPath::Properties));
    assert!(stmt.contains(EntityPath::Vectors));
    assert!(stmt.contains(EntityPath::RecordId));
    assert!(stmt.contains(EntityPath::TemporalVersioning));
    assert!(!stmt.contains(EntityPath::EntityId));
    assert!(!stmt.contains(EntityPath::WebId));
    assert!(!stmt.contains(EntityPath::DecisionTime));
    // 24 total variants - 6 children = 18 top-level paths
    assert_eq!(stmt.len(), 18);
}

/// A tuple referencing two vertex projections records both paths at one location.
#[test]
fn multiple_paths_same_statement() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> (?, Bool) {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], result: (?, Bool);
        @proj properties = vertex.properties: ?,
              metadata = vertex.metadata: ?,
              archived = metadata.archived: Bool;

        bb0() {
            result = tuple properties, archived;
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    let stmt = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(stmt.contains(EntityPath::Properties));
    assert!(stmt.contains(EntityPath::Archived));
    assert_eq!(stmt.len(), 2);
}

/// Returning a vertex projection place records the path at the terminator position.
#[test]
fn terminator_vertex_access() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> Bool {
        decl env: (), vertex: [Opaque sym::path::Entity; ?];
        @proj metadata = vertex.metadata: ?, archived = metadata.archived: Bool;

        bb0() {
            return archived;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    // 0 statements, terminator at index 1
    let term = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(term.contains(EntityPath::Archived));
    assert_eq!(term.len(), 1);
}

/// Accessing env fields (non-vertex local) produces no traversal entries.
#[test]
fn non_vertex_access_ignored() {
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

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    let stmt = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(stmt.is_empty());

    let term = traversals[location(0, 2)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(term.is_empty());
}

/// Composite path `_1.metadata.record_id` records `{RecordId}`, not individual children.
#[test]
fn composite_path_recorded() {
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

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    let stmt = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(stmt.contains(EntityPath::RecordId));
    assert_eq!(stmt.len(), 1);
}

/// Embedding path `_1.encodings.vectors` records `{Vectors}`.
#[test]
fn embedding_path_recorded() {
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

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    let stmt = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(stmt.contains(EntityPath::Vectors));
    assert_eq!(stmt.len(), 1);
}

/// Vertex accesses in different blocks are recorded at the correct locations.
#[test]
fn paths_across_blocks() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             props: ?, val: Bool, cond: Bool;
        @proj properties = vertex.properties: ?,
              metadata = vertex.metadata: ?,
              archived = metadata.archived: Bool;

        bb0() {
            props = load properties;
            cond = load true;
            if cond then bb1() else bb2();
        },
        bb1() {
            val = load archived;
            return val;
        },
        bb2() {
            return cond;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    // bb0[0]: props = load _1.properties
    let bb0_s0 = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(bb0_s0.contains(EntityPath::Properties));
    assert_eq!(bb0_s0.len(), 1);

    // bb0[1]: cond = load true (no vertex access)
    let bb0_s1 = traversals[location(0, 2)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(bb0_s1.is_empty());

    // bb1[0]: val = load _1.metadata.archived
    let bb1_s0 = traversals[location(1, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(bb1_s0.contains(EntityPath::Archived));
    assert_eq!(bb1_s0.len(), 1);

    // bb2 terminator: return cond (no vertex access)
    let bb2_term = traversals[location(2, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(bb2_term.is_empty());
}

/// Composite swallowing works end-to-end through the analysis pass.
///
/// A statement loading `_1.metadata.record_id` followed by one loading
/// `_1.metadata.record_id.entity_id.web_id`: the first records `{RecordId}`,
/// the second records `{WebId}`. No cross-statement interaction.
#[test]
fn swallowing_across_statements() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> ? {
        decl env: (), vertex: [Opaque sym::path::Entity; ?],
             rid: ?, wid: ?;
        @proj metadata = vertex.metadata: ?,
              record_id = metadata.record_id: ?,
              entity_id = record_id.entity_id: ?,
              web_id = entity_id.web_id: ?;

        bb0() {
            rid = load record_id;
            wid = load web_id;
            return rid;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    // Each statement records independently
    let stmt0 = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(stmt0.contains(EntityPath::RecordId));
    assert_eq!(stmt0.len(), 1);

    let stmt1 = traversals[location(0, 2)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(stmt1.contains(EntityPath::WebId));
    assert_eq!(stmt1.len(), 1);
}

/// Within a single statement, inserting a composite after its child swallows the child.
#[test]
fn swallowing_within_statement() {
    let heap = Heap::new();
    let interner = Interner::new(&heap);
    let env = Environment::new(&heap);

    let body = body!(interner, env; [graph::read::filter]@0/2 -> (?, ?) {
        decl env: (), vertex: [Opaque sym::path::Entity; ?], result: (?, ?);
        @proj metadata = vertex.metadata: ?,
              record_id = metadata.record_id: ?,
              entity_id = record_id.entity_id: ?,
              web_id = entity_id.web_id: ?;

        bb0() {
            result = tuple web_id, record_id;
            return result;
        }
    });

    let context = MirContext {
        heap: &heap,
        env: &env,
        interner: &interner,
        diagnostics: DiagnosticIssues::new(),
    };

    let traversals = analyze(&context, &body);

    // Both operands reference _1. WebId is inserted first, then RecordId swallows it.
    let stmt = traversals[location(0, 1)]
        .as_entity()
        .expect("should be an entity path bitset");
    assert!(stmt.contains(EntityPath::RecordId));
    assert!(!stmt.contains(EntityPath::WebId));
    assert_eq!(stmt.len(), 1);
}
