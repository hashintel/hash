use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule, core::option::option},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Entity {
    _dependencies: (
        std_lib::core::uuid::Uuid,
        std_lib::graph::types::principal::actor_group::web::Web,
        std_lib::graph::types::ontology::Ontology,
    ),
}

impl<'heap> StandardLibraryModule<'heap> for Entity {
    type Children = ();

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("entity")
    }

    #[expect(clippy::too_many_lines)]
    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();
        let heap = lib.heap;

        // newtype EntityUuid = Uuid;
        let uuid_ty = lib
            .manifest::<std_lib::core::uuid::Uuid>()
            .expect_newtype(heap.intern_symbol("Uuid"));
        let entity_uuid_ty = lib
            .ty
            .opaque("::graph::types::knowledge::entity::EntityUuid", uuid_ty.id);
        def.push(
            heap.intern_symbol("EntityUuid"),
            ItemDef::newtype(lib.ty.env, entity_uuid_ty, &[]),
        );

        // newtype DraftId = Uuid;
        let draft_id_ty = lib
            .ty
            .opaque("::graph::types::knowledge::entity::DraftId", uuid_ty.id);
        def.push(
            heap.intern_symbol("DraftId"),
            ItemDef::newtype(lib.ty.env, draft_id_ty, &[]),
        );

        // newtype EntityEditionId = Uuid;
        let entity_edition_id_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityEditionId",
            uuid_ty.id,
        );
        def.push(
            heap.intern_symbol("EntityEditionId"),
            ItemDef::newtype(lib.ty.env, entity_edition_id_ty, &[]),
        );

        // newtype EntityId = (web_id: WebId, entity_uuid: EntityUuid, draft_id: Option<DraftId>)
        let web_id = lib
            .manifest::<std_lib::graph::types::principal::actor_group::web::Web>()
            .expect_newtype(heap.intern_symbol("WebId"));
        let entity_id_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityId",
            lib.ty.r#struct([
                ("web_id", web_id.id),
                ("entity_uuid", entity_uuid_ty),
                ("draft_id", option(lib, draft_id_ty)),
            ]),
        );
        def.push(
            heap.intern_symbol("EntityId"),
            ItemDef::newtype(lib.ty.env, entity_id_ty, &[]),
        );

        // newtype EntityRecordId = (entity_id: EntityId, edition_id: EntityEditionId)
        let entity_record_id_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityRecordId",
            lib.ty.r#struct([
                ("entity_id", entity_id_ty),
                ("edition_id", entity_edition_id_ty),
            ]),
        );
        def.push(
            heap.intern_symbol("EntityRecordId"),
            ItemDef::newtype(lib.ty.env, entity_record_id_ty, &[]),
        );

        // newtype TemporalInterval = Unknown
        //
        // Opaque wrapper for `LeftClosedTemporalInterval`. The internal structure (start bound,
        // end bound) is not exposed to the HashQL type system; the placement resolver only needs
        // the field name prefix (`temporal_versioning.decision_time`).
        let temporal_interval_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::TemporalInterval",
            lib.ty.unknown(),
        );
        def.push(
            heap.intern_symbol("TemporalInterval"),
            ItemDef::newtype(lib.ty.env, temporal_interval_ty, &[]),
        );

        // newtype EntityTemporalMetadata = (
        //     decision_time: TemporalInterval,
        //     transaction_time: TemporalInterval,
        // )
        let temporal_metadata_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityTemporalMetadata",
            lib.ty.r#struct([
                ("decision_time", temporal_interval_ty),
                ("transaction_time", temporal_interval_ty),
            ]),
        );
        def.push(
            heap.intern_symbol("EntityTemporalMetadata"),
            ItemDef::newtype(lib.ty.env, temporal_metadata_ty, &[]),
        );

        // newtype Confidence = Number
        let confidence_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::Confidence",
            lib.ty.number(),
        );
        def.push(
            heap.intern_symbol("Confidence"),
            ItemDef::newtype(lib.ty.env, confidence_ty, &[]),
        );

        // newtype InferredEntityProvenance = Unknown
        //
        // JSONB blob in `entity_ids.provenance`. Contains `created_by_id`,
        // `created_at_transaction_time`, `created_at_decision_time`, and optional
        // `first_non_draft_created_at_*` timestamps.
        let inferred_provenance_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::InferredEntityProvenance",
            lib.ty.unknown(),
        );
        def.push(
            heap.intern_symbol("InferredEntityProvenance"),
            ItemDef::newtype(lib.ty.env, inferred_provenance_ty, &[]),
        );

        // newtype EntityEditionProvenance = Unknown
        //
        // JSONB blob in `entity_editions.provenance`. Contains `created_by_id`,
        // optional `archived_by_id`, `actor_type`, `OriginProvenance`, and
        // `Vec<SourceProvenance>`.
        let edition_provenance_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityEditionProvenance",
            lib.ty.unknown(),
        );
        def.push(
            heap.intern_symbol("EntityEditionProvenance"),
            ItemDef::newtype(lib.ty.env, edition_provenance_ty, &[]),
        );

        // newtype EntityProvenance = (
        //     inferred: InferredEntityProvenance,
        //     edition: EntityEditionProvenance,
        // )
        let entity_provenance_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityProvenance",
            lib.ty.r#struct([
                ("inferred", inferred_provenance_ty),
                ("edition", edition_provenance_ty),
            ]),
        );
        def.push(
            heap.intern_symbol("EntityProvenance"),
            ItemDef::newtype(lib.ty.env, entity_provenance_ty, &[]),
        );

        // newtype PropertyProvenance = Unknown
        //
        // JSONB blob on entity edges (`entity_edge.provenance`). Just
        // `Vec<SourceProvenance>`.
        let property_provenance_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::PropertyProvenance",
            lib.ty.unknown(),
        );
        def.push(
            heap.intern_symbol("PropertyProvenance"),
            ItemDef::newtype(lib.ty.env, property_provenance_ty, &[]),
        );

        // newtype PropertyObjectMetadata = Unknown
        //
        // JSONB blob in `entity_editions.property_metadata`. Contains per-property-key
        // metadata (confidence, provenance) rather than property values.
        let property_object_metadata_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::PropertyObjectMetadata",
            lib.ty.unknown(),
        );
        def.push(
            heap.intern_symbol("PropertyObjectMetadata"),
            ItemDef::newtype(lib.ty.env, property_object_metadata_ty, &[]),
        );

        // newtype EntityMetadata = (
        //     record_id: EntityRecordId,
        //     temporal_versioning: EntityTemporalMetadata,
        //     entity_type_ids: List<VersionedUrl>,
        //     archived: Boolean,
        //     provenance: EntityProvenance,
        //     confidence: Option<Confidence>,
        //     properties: PropertyObjectMetadata,
        // )
        let versioned_url = lib
            .manifest::<std_lib::graph::types::ontology::Ontology>()
            .expect_newtype(heap.intern_symbol("VersionedUrl"));
        let entity_metadata_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityMetadata",
            lib.ty.r#struct([
                ("record_id", entity_record_id_ty),
                ("temporal_versioning", temporal_metadata_ty),
                ("entity_type_ids", lib.ty.list(versioned_url.id)),
                ("archived", lib.ty.boolean()),
                ("provenance", entity_provenance_ty),
                ("confidence", option(lib, confidence_ty)),
                ("properties", property_object_metadata_ty),
            ]),
        );
        def.push(
            heap.intern_symbol("EntityMetadata"),
            ItemDef::newtype(lib.ty.env, entity_metadata_ty, &[]),
        );

        // newtype LinkData = (
        //     left_entity_id: EntityId,
        //     right_entity_id: EntityId,
        //     left_entity_confidence: Option<Confidence>,
        //     left_entity_provenance: PropertyProvenance,
        //     right_entity_confidence: Option<Confidence>,
        //     right_entity_provenance: PropertyProvenance,
        // )
        let link_data_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::LinkData",
            lib.ty.r#struct([
                ("left_entity_id", entity_id_ty),
                ("right_entity_id", entity_id_ty),
                ("left_entity_confidence", option(lib, confidence_ty)),
                ("left_entity_provenance", property_provenance_ty),
                ("right_entity_confidence", option(lib, confidence_ty)),
                ("right_entity_provenance", property_provenance_ty),
            ]),
        );
        def.push(
            heap.intern_symbol("LinkData"),
            ItemDef::newtype(lib.ty.env, link_data_ty, &[]),
        );

        // newtype EntityEncodings = (vectors: Unknown)
        //
        // The graph API doesn't expose encodings yet, but the storage layer already has
        // them. The `?` inner type is correct; the encoding format is opaque to the
        // type system.
        let encodings_ty = lib.ty.opaque(
            "::graph::types::knowledge::entity::EntityEncodings",
            lib.ty.r#struct([("vectors", lib.ty.unknown())]),
        );
        def.push(
            heap.intern_symbol("EntityEncodings"),
            ItemDef::newtype(lib.ty.env, encodings_ty, &[]),
        );

        // newtype Entity<T> = (
        //     properties: T,
        //     link_data: Option<LinkData>,
        //     metadata: EntityMetadata,
        //     encodings: EntityEncodings,
        // )
        let t_arg = lib.ty.fresh_argument("T");
        let t_ref = lib.ty.hydrate_argument(t_arg);
        let t_param = lib.ty.param(t_arg);
        let entity_ty = lib.ty.generic(
            [t_arg],
            lib.ty.opaque(
                sym::path::Entity,
                lib.ty.r#struct([
                    ("properties", t_param),
                    ("link_data", option(lib, link_data_ty)),
                    ("metadata", entity_metadata_ty),
                    ("encodings", encodings_ty),
                ]),
            ),
        );
        def.push(
            heap.intern_symbol("Entity"),
            ItemDef::newtype(lib.ty.env, entity_ty, &[t_ref]),
        );

        def
    }
}
