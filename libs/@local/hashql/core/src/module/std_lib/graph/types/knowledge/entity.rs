use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
};

pub(crate) mod types {
    use crate::{
        module::std_lib::{self, core::option::option},
        symbol::sym,
        r#type::{TypeBuilder, TypeId},
    };

    // newtype EntityUuid = Uuid;
    pub(crate) struct EntityUuidDependencies {
        pub uuid: TypeId,
    }

    pub(crate) fn entity_uuid(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<EntityUuidDependencies>,
    ) -> TypeId {
        let EntityUuidDependencies { uuid } = deps.unwrap_or_else(|| EntityUuidDependencies {
            uuid: std_lib::core::uuid::types::uuid(ty),
        });

        ty.opaque(sym::path::EntityUuid, uuid)
    }

    // newtype DraftId = Uuid;
    pub(crate) struct DraftIdDependencies {
        pub uuid: TypeId,
    }

    pub(crate) fn draft_id(ty: &TypeBuilder<'_, '_>, deps: Option<DraftIdDependencies>) -> TypeId {
        let DraftIdDependencies { uuid } = deps.unwrap_or_else(|| DraftIdDependencies {
            uuid: std_lib::core::uuid::types::uuid(ty),
        });

        ty.opaque(sym::path::DraftId, uuid)
    }

    // newtype EntityEditionId = Uuid;
    pub(crate) struct EntityEditionIdDependencies {
        pub uuid: TypeId,
    }

    pub(crate) fn entity_edition_id(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<EntityEditionIdDependencies>,
    ) -> TypeId {
        let EntityEditionIdDependencies { uuid } =
            deps.unwrap_or_else(|| EntityEditionIdDependencies {
                uuid: std_lib::core::uuid::types::uuid(ty),
            });

        ty.opaque(sym::path::EntityEditionId, uuid)
    }

    // newtype EntityId = (web_id: WebId, entity_uuid: EntityUuid, draft_id: Option<DraftId>)
    pub(crate) struct EntityIdDependencies {
        pub web_id: TypeId,
        pub entity_uuid: TypeId,
        pub draft_id: TypeId,
    }

    pub(crate) fn entity_id(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<EntityIdDependencies>,
    ) -> TypeId {
        let EntityIdDependencies {
            web_id,
            entity_uuid,
            draft_id,
        } = deps.unwrap_or_else(|| EntityIdDependencies {
            web_id: std_lib::graph::types::principal::actor_group::web::types::web_id(ty, None),
            entity_uuid: self::entity_uuid(ty, None),
            draft_id: self::draft_id(ty, None),
        });

        ty.opaque(
            sym::path::EntityId,
            ty.r#struct([
                (sym::web_id, web_id),
                (sym::entity_uuid, entity_uuid),
                (sym::draft_id, option(ty, draft_id)),
            ]),
        )
    }

    // newtype EntityRecordId = (entity_id: EntityId, edition_id: EntityEditionId)
    pub(crate) struct EntityRecordIdDependencies {
        pub entity_id: TypeId,
        pub edition_id: TypeId,
    }

    pub(crate) fn entity_record_id(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<EntityRecordIdDependencies>,
    ) -> TypeId {
        let EntityRecordIdDependencies {
            entity_id,
            edition_id,
        } = deps.unwrap_or_else(|| EntityRecordIdDependencies {
            entity_id: self::entity_id(ty, None),
            edition_id: self::entity_edition_id(ty, None),
        });

        ty.opaque(
            sym::path::EntityRecordId,
            ty.r#struct([(sym::entity_id, entity_id), (sym::edition_id, edition_id)]),
        )
    }

    pub(crate) fn temporal_interval(ty: &TypeBuilder<'_, '_>) -> TypeId {
        std_lib::graph::temporal::types::interval(ty, None)
    }

    // newtype EntityTemporalMetadata = (
    //     decision_time: DecisionTime<Interval>,
    //     transaction_time: TransactionTime<Interval>,
    // )
    pub(crate) struct EntityTemporalMetadataDependencies {
        pub interval: TypeId,
    }

    pub(crate) fn entity_temporal_metadata(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<EntityTemporalMetadataDependencies>,
    ) -> TypeId {
        let EntityTemporalMetadataDependencies { interval } =
            deps.unwrap_or_else(|| EntityTemporalMetadataDependencies {
                interval: self::temporal_interval(ty),
            });

        ty.opaque(
            sym::path::EntityTemporalMetadata,
            ty.r#struct([
                (
                    sym::decision_time,
                    std_lib::graph::temporal::types::decision_time(ty, interval),
                ),
                (
                    sym::transaction_time,
                    std_lib::graph::temporal::types::transaction_time(ty, interval),
                ),
            ]),
        )
    }

    // newtype Confidence = Number
    pub(crate) fn confidence(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::Confidence, ty.number())
    }

    // newtype InferredEntityProvenance = Unknown
    //
    // JSONB blob in `entity_ids.provenance`. Contains `created_by_id`,
    // `created_at_transaction_time`, `created_at_decision_time`, and optional
    // `first_non_draft_created_at_*` timestamps.
    pub(crate) fn inferred_entity_provenance(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::InferredEntityProvenance, ty.unknown())
    }

    // newtype EntityEditionProvenance = Unknown
    //
    // JSONB blob in `entity_editions.provenance`. Contains `created_by_id`,
    // optional `archived_by_id`, `actor_type`, `OriginProvenance`, and
    // `Vec<SourceProvenance>`.
    pub(crate) fn entity_edition_provenance(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::EntityEditionProvenance, ty.unknown())
    }

    // newtype EntityProvenance = (
    //     inferred: InferredEntityProvenance,
    //     edition: EntityEditionProvenance,
    // )
    pub(crate) struct EntityProvenanceDependencies {
        pub inferred: TypeId,
        pub edition: TypeId,
    }

    pub(crate) fn entity_provenance(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<EntityProvenanceDependencies>,
    ) -> TypeId {
        let EntityProvenanceDependencies { inferred, edition } =
            deps.unwrap_or_else(|| EntityProvenanceDependencies {
                inferred: self::inferred_entity_provenance(ty),
                edition: self::entity_edition_provenance(ty),
            });

        ty.opaque(
            sym::path::EntityProvenance,
            ty.r#struct([(sym::inferred, inferred), (sym::edition, edition)]),
        )
    }

    // newtype PropertyProvenance = Unknown
    //
    // JSONB blob on entity edges (`entity_edge.provenance`). Just
    // `Vec<SourceProvenance>`.
    pub(crate) fn property_provenance(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::PropertyProvenance, ty.unknown())
    }

    // newtype PropertyObjectMetadata = Unknown
    //
    // JSONB blob in `entity_editions.property_metadata`. Contains per-property-key
    // metadata (confidence, provenance) rather than property values.
    pub(crate) fn property_object_metadata(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::PropertyObjectMetadata, ty.unknown())
    }

    // newtype EntityMetadata = (
    //     record_id: EntityRecordId,
    //     temporal_versioning: EntityTemporalMetadata,
    //     entity_type_ids: List<VersionedUrl>,
    //     archived: Boolean,
    //     provenance: EntityProvenance,
    //     confidence: Option<Confidence>,
    //     properties: PropertyObjectMetadata,
    // )
    pub(crate) struct EntityMetadataDependencies {
        pub record_id: TypeId,
        pub temporal_versioning: TypeId,
        pub entity_type_ids: TypeId,
        pub provenance: TypeId,
        pub confidence: TypeId,
        pub properties: TypeId,
    }

    pub(crate) fn entity_metadata(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<EntityMetadataDependencies>,
    ) -> TypeId {
        let EntityMetadataDependencies {
            record_id,
            temporal_versioning,
            entity_type_ids,
            provenance,
            confidence,
            properties,
        } = deps.unwrap_or_else(|| EntityMetadataDependencies {
            record_id: self::entity_record_id(ty, None),
            temporal_versioning: self::entity_temporal_metadata(ty, None),
            entity_type_ids: ty.list(std_lib::graph::types::ontology::types::versioned_url(
                ty, None,
            )),
            provenance: self::entity_provenance(ty, None),
            confidence: self::confidence(ty),
            properties: self::property_object_metadata(ty),
        });

        ty.opaque(
            sym::path::EntityMetadata,
            ty.r#struct([
                (sym::record_id, record_id),
                (sym::temporal_versioning, temporal_versioning),
                (sym::entity_type_ids, entity_type_ids),
                (sym::archived, ty.boolean()),
                (sym::provenance, provenance),
                (sym::confidence, option(ty, confidence)),
                (sym::properties, properties),
            ]),
        )
    }

    // newtype LinkData = (
    //     left_entity_id: EntityId,
    //     right_entity_id: EntityId,
    //     left_entity_confidence: Option<Confidence>,
    //     left_entity_provenance: PropertyProvenance,
    //     right_entity_confidence: Option<Confidence>,
    //     right_entity_provenance: PropertyProvenance,
    // )
    pub(crate) struct LinkDataDependencies {
        pub entity_id: TypeId,
        pub confidence: TypeId,
        pub property_provenance: TypeId,
    }

    pub(crate) fn link_data(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<LinkDataDependencies>,
    ) -> TypeId {
        let LinkDataDependencies {
            entity_id,
            confidence,
            property_provenance,
        } = deps.unwrap_or_else(|| LinkDataDependencies {
            entity_id: self::entity_id(ty, None),
            confidence: self::confidence(ty),
            property_provenance: self::property_provenance(ty),
        });

        ty.opaque(
            sym::path::LinkData,
            ty.r#struct([
                (sym::left_entity_id, entity_id),
                (sym::right_entity_id, entity_id),
                (sym::left_entity_confidence, option(ty, confidence)),
                (sym::left_entity_provenance, property_provenance),
                (sym::right_entity_confidence, option(ty, confidence)),
                (sym::right_entity_provenance, property_provenance),
            ]),
        )
    }

    // newtype EntityEncodings = (vectors: Unknown)
    //
    // The graph API doesn't expose encodings yet, but the storage layer already has
    // them. The `?` inner type is correct; the encoding format is opaque to the
    // type system.
    pub(crate) fn entity_encodings(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(
            sym::path::EntityEncodings,
            ty.r#struct([(sym::vectors, ty.unknown())]),
        )
    }

    // newtype Entity<T> = (
    //     properties: T,
    //     link_data: Option<LinkData>,
    //     metadata: EntityMetadata,
    //     encodings: EntityEncodings,
    // )
    pub(crate) struct EntityDependencies {
        pub link_data: TypeId,
        pub metadata: TypeId,
        pub encodings: TypeId,
    }

    pub(crate) fn entity(
        ty: &TypeBuilder<'_, '_>,
        properties: TypeId,
        deps: Option<EntityDependencies>,
    ) -> TypeId {
        let EntityDependencies {
            link_data,
            metadata,
            encodings,
        } = deps.unwrap_or_else(|| EntityDependencies {
            link_data: self::link_data(ty, None),
            metadata: self::entity_metadata(ty, None),
            encodings: self::entity_encodings(ty),
        });

        ty.opaque(
            sym::path::Entity,
            ty.r#struct([
                (sym::properties, properties),
                (sym::link_data, option(ty, link_data)),
                (sym::metadata, metadata),
                (sym::encodings, encodings),
            ]),
        )
    }
}

pub(in crate::module::std_lib) struct Entity {
    _dependencies: (
        std_lib::core::uuid::Uuid,
        std_lib::graph::types::principal::actor_group::web::Web,
        std_lib::graph::types::ontology::Ontology,
        std_lib::graph::temporal::Temporal,
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

        let uuid_ty = lib
            .manifest::<std_lib::core::uuid::Uuid>()
            .expect_newtype(sym::Uuid)
            .id;
        let web_id_ty = lib
            .manifest::<std_lib::graph::types::principal::actor_group::web::Web>()
            .expect_newtype(sym::WebId)
            .id;
        let versioned_url_ty = lib
            .manifest::<std_lib::graph::types::ontology::Ontology>()
            .expect_newtype(sym::VersionedUrl)
            .id;
        let interval_ty = lib
            .manifest::<std_lib::graph::temporal::Temporal>()
            .expect_newtype(sym::Interval)
            .id;

        let ty = &lib.ty;

        let entity_uuid_ty =
            types::entity_uuid(ty, Some(types::EntityUuidDependencies { uuid: uuid_ty }));
        def.push(
            sym::EntityUuid,
            ItemDef::newtype(ty.env, entity_uuid_ty, &[]),
        );

        let draft_id_ty = types::draft_id(ty, Some(types::DraftIdDependencies { uuid: uuid_ty }));
        def.push(sym::DraftId, ItemDef::newtype(ty.env, draft_id_ty, &[]));

        let entity_edition_id_ty = types::entity_edition_id(
            ty,
            Some(types::EntityEditionIdDependencies { uuid: uuid_ty }),
        );
        def.push(
            sym::EntityEditionId,
            ItemDef::newtype(ty.env, entity_edition_id_ty, &[]),
        );

        let entity_id_ty = types::entity_id(
            ty,
            Some(types::EntityIdDependencies {
                web_id: web_id_ty,
                entity_uuid: entity_uuid_ty,
                draft_id: draft_id_ty,
            }),
        );
        def.push(sym::EntityId, ItemDef::newtype(ty.env, entity_id_ty, &[]));

        let entity_record_id_ty = types::entity_record_id(
            ty,
            Some(types::EntityRecordIdDependencies {
                entity_id: entity_id_ty,
                edition_id: entity_edition_id_ty,
            }),
        );
        def.push(
            sym::EntityRecordId,
            ItemDef::newtype(ty.env, entity_record_id_ty, &[]),
        );

        let temporal_metadata_ty = types::entity_temporal_metadata(
            ty,
            Some(types::EntityTemporalMetadataDependencies {
                interval: interval_ty,
            }),
        );
        def.push(
            sym::EntityTemporalMetadata,
            ItemDef::newtype(ty.env, temporal_metadata_ty, &[]),
        );

        let confidence_ty = types::confidence(ty);
        def.push(
            sym::Confidence,
            ItemDef::newtype(ty.env, confidence_ty, &[]),
        );

        let inferred_provenance_ty = types::inferred_entity_provenance(ty);
        def.push(
            sym::InferredEntityProvenance,
            ItemDef::newtype(ty.env, inferred_provenance_ty, &[]),
        );

        let edition_provenance_ty = types::entity_edition_provenance(ty);
        def.push(
            sym::EntityEditionProvenance,
            ItemDef::newtype(ty.env, edition_provenance_ty, &[]),
        );

        let entity_provenance_ty = types::entity_provenance(
            ty,
            Some(types::EntityProvenanceDependencies {
                inferred: inferred_provenance_ty,
                edition: edition_provenance_ty,
            }),
        );
        def.push(
            sym::EntityProvenance,
            ItemDef::newtype(ty.env, entity_provenance_ty, &[]),
        );

        let property_provenance_ty = types::property_provenance(ty);
        def.push(
            sym::PropertyProvenance,
            ItemDef::newtype(ty.env, property_provenance_ty, &[]),
        );

        let property_object_metadata_ty = types::property_object_metadata(ty);
        def.push(
            sym::PropertyObjectMetadata,
            ItemDef::newtype(ty.env, property_object_metadata_ty, &[]),
        );

        let entity_metadata_ty = types::entity_metadata(
            ty,
            Some(types::EntityMetadataDependencies {
                record_id: entity_record_id_ty,
                temporal_versioning: temporal_metadata_ty,
                entity_type_ids: ty.list(versioned_url_ty),
                provenance: entity_provenance_ty,
                confidence: confidence_ty,
                properties: property_object_metadata_ty,
            }),
        );
        def.push(
            sym::EntityMetadata,
            ItemDef::newtype(ty.env, entity_metadata_ty, &[]),
        );

        let link_data_ty = types::link_data(
            ty,
            Some(types::LinkDataDependencies {
                entity_id: entity_id_ty,
                confidence: confidence_ty,
                property_provenance: property_provenance_ty,
            }),
        );
        def.push(sym::LinkData, ItemDef::newtype(ty.env, link_data_ty, &[]));

        let encodings_ty = types::entity_encodings(ty);
        def.push(
            sym::EntityEncodings,
            ItemDef::newtype(ty.env, encodings_ty, &[]),
        );

        // Entity<T>
        let t_arg = lib.ty.fresh_argument(sym::T);
        let t_ref = lib.ty.hydrate_argument(t_arg);
        let t_param = lib.ty.param(t_arg);
        let entity_ty = lib.ty.generic(
            [t_arg],
            types::entity(
                &lib.ty,
                t_param,
                Some(types::EntityDependencies {
                    link_data: link_data_ty,
                    metadata: entity_metadata_ty,
                    encodings: encodings_ty,
                }),
            ),
        );
        def.push(
            sym::Entity,
            ItemDef::newtype(lib.ty.env, entity_ty, &[t_ref]),
        );

        def
    }
}
