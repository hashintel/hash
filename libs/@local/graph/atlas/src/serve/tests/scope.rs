//! The scope axis: which surfaces answer, beside which rows they show.

use super::{
    EDGE_SEED, EdgesError, EdgesLimits, EdgesRequest, FULL, ScopeReach, ServeLimits,
    VisibilityProof, edges_request, entity_string_of, full_grid, locate_request, publish,
};
use crate::serve::LocateError;

/// The scope reads which constructor built the proof, never how many rows it admits.
///
/// A bitmap admitting every row of its universe resolves restricted: the authority that supplied
/// a bitmap declared a scope, and collapsing an all-ones bitmap onto the operator scope would
/// serve it the operator surface.
#[test]
fn the_scope_reads_the_proof_constructor_not_its_row_count() {
    let mut every_row = crate::bitset::BitSet::new(8);
    for row in 0..8 {
        every_row.insert(row);
    }

    assert_eq!(
        ScopeReach::from_proof(&VisibilityProof::from_bitmap(every_row)),
        ScopeReach::Restricted,
    );
    assert_eq!(ScopeReach::from_proof(&FULL), ScopeReach::Operator);
}

/// A restricted scope answers a link id exactly as it answers an id of neither domain.
///
/// The node domain answers under both scopes, so the restricted response differs from the
/// operator response in the link domain alone; the ghost-id request is the same call over an id
/// the identity tables never held, and the two restricted responses are equal values.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_restricted_scope_answers_link_ids_like_ids_of_neither_domain() {
    use crate::serve::{TranslateLimits, TranslateRequest};

    let (_generation, atlas) = publish("scope-translate").await;

    let link = entity_string_of(EDGE_SEED);
    let ghost = format!("{}~{}", uuid::Uuid::nil(), uuid::Uuid::nil());
    let node = entity_string_of(0);

    let translate = |ids: Vec<String>, scope| {
        atlas
            .translate(
                TranslateRequest { entity_ids: ids },
                TranslateLimits::default(),
                &FULL,
                scope,
            )
            .expect("the request is under the cap")
    };

    // The control: the link id resolves under the operator scope, so
    // the absences below are the scope's.
    let operator = translate(vec![node.clone(), link.clone()], ScopeReach::Operator);
    assert!(operator.nodes.contains_key(&node));
    assert!(operator.edges.contains_key(&link));

    let restricted = translate(vec![node.clone(), link], ScopeReach::Restricted);
    let ghosted = translate(vec![node.clone(), ghost], ScopeReach::Restricted);

    assert!(restricted.edges.is_empty());
    assert!(restricted.nodes.contains_key(&node));
    assert_eq!(
        restricted, ghosted,
        "a link id and an id of neither domain answer the same response"
    );
}

/// The edges assembly refuses a restricted scope before it reads the request.
///
/// The reach is an argument of the assembly, not a check the transport remembers to run, so the
/// refusal holds for every caller of the serving surface. The refusal precedes the request's own
/// rejections: the same body that answers `Tiles` under the operator scope answers `OutOfScope`
/// under a restricted one, so a refused caller learns nothing about the request it sent.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_edges_assembly_refuses_a_restricted_scope_before_it_reads_the_request() {
    let (_generation, atlas) = publish("scope-edges").await;
    let request = edges_request(full_grid());
    let capped = EdgesLimits {
        tiles: 1,
        ..EdgesLimits::default()
    };

    // The control: the same call under the operator scope assembles a
    // non-empty edge set, so the refusal below is the reach's and not
    // the fixture's.
    let served = atlas
        .assemble_edges(
            &request,
            EdgesLimits::default(),
            &FULL,
            ScopeReach::Operator,
        )
        .expect("the operator scope reaches the edges surface");
    assert_ne!(atlas.delivered_edge_entities(&served).count(), 0);

    assert_eq!(
        atlas
            .assemble_edges(
                &request,
                EdgesLimits::default(),
                &FULL,
                ScopeReach::Restricted,
            )
            .map(|_| ())
            .expect_err("a restricted scope does not reach the edges surface"),
        EdgesError::OutOfScope,
    );

    // The request's own rejection under the operator scope, and the
    // scope's rejection of the identical request.
    assert_eq!(
        atlas
            .assemble_edges(&request, capped, &FULL, ScopeReach::Operator)
            .map(|_| ())
            .expect_err("the tile list exceeds the cap"),
        EdgesError::Tiles {
            count: request.tiles.len(),
            maximum: 1,
        },
    );
    assert_eq!(
        atlas
            .assemble_edges(&request, capped, &FULL, ScopeReach::Restricted)
            .map(|_| ())
            .expect_err("the scope refuses before the cap is read"),
        EdgesError::OutOfScope,
    );
}

/// The public edges path refuses a restricted scope with no bytes.
///
/// [`Atlas::edges`] is the encode-and-return path, so it is the one that could hand back an
/// envelope; it answers the same refusal, and the refusal is a [`Result`] variant rather than an
/// empty response, so no caller holds bytes and a refusal together.
///
/// The path carries a deferral of its own - it does not serve `includeDetailedData` - and the
/// scope answers first: a restricted caller reads the refusal, never which features this build
/// serves.
///
/// [`Atlas::edges`]: crate::serve::Atlas::edges
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_public_edges_path_refuses_a_restricted_scope_with_no_bytes() {
    let (_generation, atlas) = publish("scope-edges-bytes").await;
    let request = edges_request(full_grid());

    let bytes = atlas
        .edges(
            &request,
            EdgesLimits::default(),
            &FULL,
            ScopeReach::Operator,
        )
        .expect("the operator scope reaches the edges surface");
    assert_ne!(bytes.len(), 0);

    assert_eq!(
        atlas
            .edges(
                &request,
                EdgesLimits::default(),
                &FULL,
                ScopeReach::Restricted,
            )
            .expect_err("a restricted scope does not reach the edges surface"),
        EdgesError::OutOfScope,
    );

    // The path's own deferral, and the scope answering ahead of it for
    // the identical request.
    let detailed = EdgesRequest {
        include_detailed_data: true,
        ..edges_request(full_grid())
    };
    assert_eq!(
        atlas
            .edges(
                &detailed,
                EdgesLimits::default(),
                &FULL,
                ScopeReach::Operator,
            )
            .expect_err("this path does not hydrate"),
        EdgesError::Unsupported("includeDetailedData"),
    );
    assert_eq!(
        atlas
            .edges(
                &detailed,
                EdgesLimits::default(),
                &FULL,
                ScopeReach::Restricted,
            )
            .expect_err("the scope refuses before the deferral is read"),
        EdgesError::OutOfScope,
    );
}

/// The locate assembly refuses a restricted scope before it resolves the source.
///
/// The ego graph delivers link rows, so the surface refuses as a whole rather than answering a
/// node-only subgraph. The refusal precedes source resolution: a visible source and an id that
/// names nothing answer the same `OutOfScope`, so the refusal carries no statement about the
/// requested entity.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_locate_assembly_refuses_a_restricted_scope_before_it_resolves_the_source() {
    let (_generation, atlas) = publish("scope-locate").await;
    let limits = ServeLimits::default();
    let visible = locate_request(entity_string_of(0));
    let ghost = locate_request(format!("{}~{}", uuid::Uuid::nil(), uuid::Uuid::nil()));

    // The controls: under the operator scope the two requests answer
    // differently - one a document, one `UnknownEntity` - so the
    // equality below is the scope collapsing them.
    atlas
        .assemble_locate(&visible, limits, &FULL, ScopeReach::Operator)
        .expect("the operator scope reaches the locate surface");
    assert_eq!(
        atlas
            .assemble_locate(&ghost, limits, &FULL, ScopeReach::Operator)
            .map(|_| ())
            .expect_err("the ghost id names no visible node"),
        LocateError::UnknownEntity,
    );

    for request in [&visible, &ghost] {
        assert_eq!(
            atlas
                .assemble_locate(request, limits, &FULL, ScopeReach::Restricted)
                .map(|_| ())
                .expect_err("a restricted scope does not reach the locate surface"),
            LocateError::OutOfScope,
        );
    }
}
