pub(in crate::module::std_lib) mod entity_type;

pub(crate) mod types {
    use crate::{
        module::std_lib,
        symbol::sym,
        r#type::{TypeBuilder, TypeId},
    };

    pub(crate) fn ontology_type_version(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::OntologyTypeVersion, ty.string())
    }

    pub(crate) struct BaseUrlDependencies {
        pub url: TypeId,
    }

    pub(crate) fn base_url(ty: &TypeBuilder<'_, '_>, deps: Option<BaseUrlDependencies>) -> TypeId {
        let BaseUrlDependencies { url } = deps.unwrap_or_else(|| BaseUrlDependencies {
            url: std_lib::core::url::types::url(ty),
        });

        ty.opaque(sym::path::BaseUrl, url)
    }

    pub(crate) struct VersionedUrlDependencies {
        pub base_url: TypeId,
        pub ontology_type_version: TypeId,
    }

    pub(crate) fn versioned_url(
        ty: &TypeBuilder<'_, '_>,
        deps: Option<VersionedUrlDependencies>,
    ) -> TypeId {
        let VersionedUrlDependencies {
            base_url: base_url_ty,
            ontology_type_version: version_ty,
        } = deps.unwrap_or_else(|| VersionedUrlDependencies {
            base_url: self::base_url(ty, None),
            ontology_type_version: self::ontology_type_version(ty),
        });

        ty.opaque(
            sym::path::VersionedUrl,
            ty.r#struct([(sym::base_url, base_url_ty), (sym::version, version_ty)]),
        )
    }
}

use crate::{
    heap::Heap,
    module::{
        StandardLibrary,
        std_lib::{self, ItemDef, ModuleDef, StandardLibraryModule},
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) struct Ontology {
    _dependencies: (std_lib::core::url::Url,),
}

impl<'heap> StandardLibraryModule<'heap> for Ontology {
    type Children = (self::entity_type::EntityType,);

    fn name(heap: &'heap Heap) -> Symbol<'heap> {
        heap.intern_symbol("ontology")
    }

    fn define(lib: &mut StandardLibrary<'_, 'heap>) -> ModuleDef<'heap> {
        let mut def = ModuleDef::new();

        // newtype OntologyTypeVersion = String;
        let ontology_type_version_ty = types::ontology_type_version(&lib.ty);
        def.push(
            sym::OntologyTypeVersion,
            ItemDef::newtype(lib.ty.env, ontology_type_version_ty, &[]),
        );

        let url_ty = lib
            .manifest::<std_lib::core::url::Url>()
            .expect_newtype(sym::Url)
            .id;

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype BaseUrl = Url;
        let base_url_ty =
            types::base_url(&lib.ty, Some(types::BaseUrlDependencies { url: url_ty }));
        def.push(sym::BaseUrl, ItemDef::newtype(lib.ty.env, base_url_ty, &[]));

        // newtype VersionedUrl = (base_url: BaseUrl, version: OntologyTypeVersion);
        let versioned_url_ty = types::versioned_url(
            &lib.ty,
            Some(types::VersionedUrlDependencies {
                base_url: base_url_ty,
                ontology_type_version: ontology_type_version_ty,
            }),
        );
        def.push(
            sym::VersionedUrl,
            ItemDef::newtype(lib.ty.env, versioned_url_ty, &[]),
        );

        def
    }
}
