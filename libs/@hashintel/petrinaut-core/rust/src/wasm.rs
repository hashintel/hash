use serde_json::json;
use wasm_bindgen::prelude::{JsError, wasm_bindgen};

use crate::{Command, CommitNodePositions, Extensions, PetrinautInstance};

#[wasm_bindgen]
pub struct RustDocument {
    instance: PetrinautInstance,
}

fn js_error(error: impl core::fmt::Display) -> JsError {
    JsError::new(&error.to_string())
}

#[wasm_bindgen]
impl RustDocument {
    #[wasm_bindgen(constructor)]
    pub fn new(
        document: &str,
        history_limit: u32,
        timestamp: String,
        readonly: bool,
        extensions: &str,
    ) -> Result<Self, JsError> {
        let document = serde_json::from_str(document).map_err(js_error)?;
        let extensions: Extensions = serde_json::from_str(extensions).map_err(js_error)?;
        Ok(Self {
            instance: PetrinautInstance::new_with_extensions(
                document,
                history_limit as usize,
                timestamp,
                readonly,
                extensions,
            )
            .map_err(js_error)?,
        })
    }

    pub fn snapshot(&self) -> String {
        self.instance.document().to_string()
    }

    pub fn history(&self) -> String {
        json!({ "currentIndex": self.instance.current_index(), "entries": self.instance.timestamps().iter().map(|timestamp| json!({"timestamp": timestamp})).collect::<Vec<_>>() }).to_string()
    }

    pub fn commit(&mut self, document: &str, timestamp: String) -> Result<String, JsError> {
        let document = serde_json::from_str(document).map_err(js_error)?;
        serde_json::to_string(
            &self
                .instance
                .replace_document(document, timestamp)
                .map_err(js_error)?,
        )
        .map_err(js_error)
    }

    pub fn execute(&mut self, command: &str, timestamp: String) -> Result<String, JsError> {
        let command: Command = serde_json::from_str(command).map_err(js_error)?;
        serde_json::to_string(
            &self
                .instance
                .execute(&command, timestamp)
                .map_err(js_error)?,
        )
        .map_err(js_error)
    }

    #[wasm_bindgen(js_name = commitNodePositions)]
    pub fn commit_node_positions(
        &mut self,
        input: &str,
        timestamp: String,
    ) -> Result<String, JsError> {
        let input: CommitNodePositions = serde_json::from_str(input).map_err(js_error)?;
        serde_json::to_string(
            &self
                .instance
                .commit_node_positions(&input, timestamp)
                .map_err(js_error)?,
        )
        .map_err(js_error)
    }

    #[wasm_bindgen(js_name = goToIndex)]
    pub fn go_to_index(&mut self, index: u32) -> Result<String, JsError> {
        serde_json::to_string(
            &self
                .instance
                .go_to_index(index as usize)
                .map_err(js_error)?,
        )
        .map_err(js_error)
    }

    #[wasm_bindgen(js_name = clearHistory)]
    pub fn clear_history(&mut self, timestamp: String) {
        self.instance.clear_history(timestamp);
    }
}
