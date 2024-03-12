use tsify::Tsify;

// TODO: Can we manually impl Tsify on the struct to avoid the patch?

// Generates the TypeScript alias:
//   type MaybeOneOfEntityTypeReference = `OneOf<EntityTypeReference> | {}`
// TODO: Figure out what to do about the oneOf type
//   see https://linear.app/hash/issue/BP-89
#[cfg_attr(target_arch = "wasm32", derive(Tsify))]
#[serde(rename = "MaybeOneOfEntityTypeReference")]
#[expect(dead_code, reason = "Used in the generated TypeScript types")]
pub struct MaybeOneOfEntityTypeReferencePatch(
    #[tsify(type = "OneOf<EntityTypeReference> | {}")] String,
);
