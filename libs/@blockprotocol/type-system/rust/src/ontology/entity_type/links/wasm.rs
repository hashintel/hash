use tsify::Tsify;

// TODO: Can we manually impl Tsify on the struct to avoid the patch?

// Generates the TypeScript alias:
//   type MaybeOneOfEntityTypeReference = `OneOf<EntityTypeReference> | {}`
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename = "MaybeOneOfEntityTypeReference")]
pub struct MaybeOneOfEntityTypeReferencePatch(
    #[tsify(type = "OneOf<EntityTypeReference> | Record<string, never>")] String,
);
