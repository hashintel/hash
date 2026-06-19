use core::alloc::Allocator;

use crate::{
    module::std_lib::{
        self, ItemDef, ModuleCache, ModuleDef, StandardLibraryContext, StandardLibraryModule,
    },
    symbol::{Symbol, sym},
};

pub(in crate::module::std_lib) mod entity_type;

pub mod types {
    use crate::{
        module::std_lib,
        symbol::sym,
        r#type::{TypeBuilder, TypeId},
    };

    #[must_use]
    pub fn ontology_type_version(ty: &TypeBuilder<'_, '_>) -> TypeId {
        ty.opaque(sym::path::OntologyTypeVersion, ty.string())
    }

    pub struct BaseUrlDependencies {
        pub url: TypeId,
    }

    #[must_use]
    pub fn base_url(ty: &TypeBuilder<'_, '_>, deps: Option<BaseUrlDependencies>) -> TypeId {
        let BaseUrlDependencies { url } = deps.unwrap_or_else(|| BaseUrlDependencies {
            url: std_lib::core::url::types::url(ty),
        });

        ty.opaque(sym::path::BaseUrl, url)
    }

    pub struct VersionedUrlDependencies {
        pub base_url: TypeId,
        pub ontology_type_version: TypeId,
    }

    #[must_use]
    pub fn versioned_url(
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

pub(in crate::module::std_lib) struct Ontology {
    _dependencies: (std_lib::core::url::Url,),
}

impl<'heap> StandardLibraryModule<'heap> for Ontology {
    type Children = (self::entity_type::EntityType,);

    fn name() -> Symbol<'heap> {
        sym::ontology
    }

    fn define<S: Allocator + Clone>(
        context: &mut StandardLibraryContext<'_, 'heap, S>,
        cache: &mut ModuleCache<'heap, S>,
    ) -> ModuleDef<'heap, S> {
        let mut def = ModuleDef::new_in(context.alloc.clone());

        // newtype OntologyTypeVersion = String;
        let ontology_type_version_ty = types::ontology_type_version(&context.ty);
        def.push(
            sym::OntologyTypeVersion,
            ItemDef::newtype(context.ty.env, ontology_type_version_ty, &[]),
        );

        let url_ty = cache
            .request::<std_lib::core::url::Url>(context)
            .expect_newtype(sym::Url)
            .id;

        // TODO: consider making this constructor private via intrinsic (requires VM)
        // newtype BaseUrl = Url;
        let base_url_ty = types::base_url(
            &context.ty,
            Some(types::BaseUrlDependencies { url: url_ty }),
        );
        def.push(
            sym::BaseUrl,
            ItemDef::newtype(context.ty.env, base_url_ty, &[]),
        );

        // newtype VersionedUrl = (base_url: BaseUrl, version: OntologyTypeVersion);
        let versioned_url_ty = types::versioned_url(
            &context.ty,
            Some(types::VersionedUrlDependencies {
                base_url: base_url_ty,
                ontology_type_version: ontology_type_version_ty,
            }),
        );
        def.push(
            sym::VersionedUrl,
            ItemDef::newtype(context.ty.env, versioned_url_ty, &[]),
        );

        def
    }
}
