use tsify::Tsify;

// Generates the TypeScript alias: type VersionedUrl = `${BaseUrl}v/${number}`
#[derive(Tsify)]
#[serde(rename = "VersionedUrl")]
pub struct VersionedUrlPatch(#[tsify(type = "`${BaseUrl}v/${number}`")] String);

// #[wasm_bindgen(typescript_custom_section)]
// const VALIDATE_BASE_URL_DEF: &'static str = r#"
// /**
//  * Checks if a given URL string is a valid base URL.
//  *
//  * @param {BaseUrl} url - The URL string.
//  * @returns {(Result.Ok|Result.Err<ParseBaseUrlError>)} - an Ok with an inner of the string as a
//  * BaseUrl if valid, or an Err with an inner ParseBaseUrlError
//  */
// export function validateBaseUrl(url: string): Result<BaseUrl, ParseBaseUrlError>;
// "#;
// #[wasm_bindgen(skip_typescript, js_name = validateBaseUrl)]
// pub fn validate_base_url(url: &str) -> JsValue {
//     #[cfg(debug_assertions)]
//     set_panic_hook();
//
//     let validate_result: Result<_, _> = BaseUrl::validate_str(url).map(|_|
// url.to_owned()).into();
//
//     JsValue::from_serde(&validate_result).expect("failed to serialize result")
// }
//
// #[wasm_bindgen(typescript_custom_section)]
// const VALIDATE_VERSIONED_URL_DEF: &'static str = r#"
// /**
//  * Checks if a given URL string is a Block Protocol compliant Versioned URL.
//  *
//  * @param {string} url - The URL string.
//  * @returns {(Result.Ok|Result.Err<ParseVersionedUrlError>)} - an Ok with an inner of the string
//    as
//  * a VersionedUrl if valid, or an Err with an inner ParseVersionedUrlError
//  */
// export function validateVersionedUrl(url: string): Result<VersionedUrl, ParseVersionedUrlError>;
// "#;
// #[wasm_bindgen(skip_typescript, js_name = validateVersionedUrl)]
// pub fn validate_versioned_url(url: &str) -> JsValue {
//     #[cfg(debug_assertions)]
//     set_panic_hook();
//
//     let validate_result: Result<_, _> = VersionedUrl::from_str(url).into();
//
//     JsValue::from_serde(&validate_result).expect("failed to serialize result")
// }
//
// #[wasm_bindgen(typescript_custom_section)]
// const EXTRACT_BASE_URL_DEF: &'static str = r#"
// /**
//  * Extracts the base URL from a Versioned URL.
//  *
//  * @param {VersionedUrl} url - The versioned URL.
//  * @throws {ParseVersionedUrlError} if the versioned URL is invalid.
//  */
// export function extractBaseUrl(url: VersionedUrl): BaseUrl;
// "#;
// #[wasm_bindgen(skip_typescript, js_name = extractBaseUrl)]
// pub fn extract_base_url(url: &str) -> std::result::Result<String, JsValue> {
//     #[cfg(debug_assertions)]
//     set_panic_hook();
//
//     Ok(VersionedUrl::from_str(url)
//         .map_err(|err| JsValue::from_serde(&err).expect("failed to serialize error"))?
//         .base_url
//         .to_string())
// }
//
// #[wasm_bindgen(typescript_custom_section)]
// const EXTRACT_VERSION_DEF: &'static str = r#"
// /**
//  * Extracts the version from a Versioned URL.
//  *
//  * @param {VersionedUrl} url - The versioned URL.
//  * @throws {ParseVersionedUrlError} if the versioned URL is invalid.
//  */
// export function extractVersion(url: VersionedUrl): number;
// "#;
// #[wasm_bindgen(skip_typescript, js_name = extractVersion)]
// pub fn extract_version(url: &str) -> std::result::Result<u32, JsValue> {
//     #[cfg(debug_assertions)]
//     set_panic_hook();
//
//     Ok(VersionedUrl::from_str(url)
//         .map_err(|err| JsValue::from_serde(&err).expect("failed to serialize error"))?
//         .version)
// }
