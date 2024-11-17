pub mod multi_modal_embedding {

    use std::fs;

    use base64::{Engine as _, engine::general_purpose};
    use curl::easy::{Easy, List};
    use error_stack::{Report, ResultExt as _};
    use serde_json::{Value, json};

    use crate::{
        ChonkyError, DocumentEmbeddings, Embedding, StructuralEmbedding, StructuralMetadata,
    };

    fn get_vertex_access_token() -> Result<String, Report<ChonkyError>> {
        Ok(String::from_utf8(
            std::process::Command::new("gcloud")
                .args(["auth", "print-access-token"])
                .output()
                .change_context(ChonkyError::VertexAPI)?
                .stdout,
        )
        .change_context(ChonkyError::VertexAPI)?
        .trim()
        .to_owned())
    }

    fn base64_json(file_path: &str) -> Result<String, Report<ChonkyError>> {
        let image_data: Vec<u8> = fs::read(file_path).change_context(ChonkyError::ImageError)?;
        let base64_encoded_img = general_purpose::STANDARD.encode(image_data);
        Ok(json!({
            "instances": [
                {
                    "image": {
                        "bytesBase64Encoded": base64_encoded_img
                    }
                }
            ]
        })
        .to_string())
    }

    /// A function that performs authentication with Google Vertex API and performs
    /// a curl request to obtain multimodal embeddings
    ///
    /// # Errors
    ///
    /// [`ChonkyError::VertexAPI`] when there are HTTP request errors
    /// [`ChonkyError::ImageError`] when there are errors converting to base64 encoding
    pub fn make_multimodal_api_request(
        project_id: &str,
        image_path: &str,
    ) -> Result<Vec<f64>, Report<ChonkyError>> {
        // project_id is name of Vertex API project
        let url = format!(
            "https://us-central1-aiplatform.googleapis.com/v1/projects/{project_id}/locations/us-central1/publishers/google/models/multimodalembedding@001:predict"
        );

        let access_token = get_vertex_access_token()?;
        let payload = base64_json(image_path)?;

        let mut easy = Easy::new();
        easy.url(&url).change_context(ChonkyError::VertexAPI)?;
        easy.post(true).change_context(ChonkyError::VertexAPI)?;

        let mut headers = List::new();
        headers
            .append(&format!("Authorization: Bearer {access_token}"))
            .change_context(ChonkyError::VertexAPI)?;
        headers
            .append("Content-Type: application/json; charset=utf-8")
            .change_context(ChonkyError::VertexAPI)?;
        easy.http_headers(headers)
            .change_context(ChonkyError::VertexAPI)?;

        easy.post_fields_copy(payload.as_bytes())
            .change_context(ChonkyError::VertexAPI)?;

        let mut response = Vec::new();
        {
            let mut transfer = easy.transfer();
            transfer
                .write_function(|data| {
                    response.extend_from_slice(data);
                    Ok(data.len())
                })
                .change_context(ChonkyError::VertexAPI)?;
            transfer.perform().change_context(ChonkyError::VertexAPI)?;
        }

        extract_embedding(&String::from_utf8(response).change_context(ChonkyError::VertexAPI)?)
    }

    // Parses the response to extract the image embedding vector
    fn extract_embedding(response_text: &str) -> Result<Vec<f64>, Report<ChonkyError>> {
        let parsed: Value =
            serde_json::from_str(response_text).change_context(ChonkyError::VertexAPI)?;
        let image_embedding = parsed["predictions"][0]["imageEmbedding"]
            .as_array()
            .ok_or(ChonkyError::VertexAPI)?
            .iter()
            .map(|x| x.as_f64().ok_or(ChonkyError::VertexAPI))
            .collect::<Result<Vec<f64>, _>>()?;
        Ok(image_embedding)
    }

    pub fn add_structural_embedding(
        document_embeddings: &mut DocumentEmbeddings,
        page_number: usize,
        file_path: String,
        embedding_vector: Vec<f64>,
    ) {
        let structural_metadata = StructuralMetadata {
            _page_number: page_number,
            _image_path: file_path,
        };

        let embedding = Embedding {
            _model_used: "VertexAPIMultiModalEmbeddings".to_owned(),
            _embedding_vector: embedding_vector,
        };

        let structural_embedding = StructuralEmbedding {
            _metadata: structural_metadata,
            _embedding: embedding,
        };

        document_embeddings
            .structural_embeddings
            .push(structural_embedding);
    }
    #[cfg(test)]
    mod tests {
        use insta::{assert_binary_snapshot, assert_snapshot};

        use super::*;
        use crate::create_document_embedding;

        #[test]
        fn base64_conversion() -> Result<(), Report<ChonkyError>> {
            // source of truth found by decoding base64 encoding to get same image
            assert_binary_snapshot!(
                "page_1.json",
                base64_json("./tests/docs/page_1.png")?.into()
            );
            Ok(())
        }

        #[test]
        fn image_embedding() -> Result<(), Report<ChonkyError>> {
            //since embeddings are nondeterminatic they vary slightly
            //thus a good way to test is to check if cosine similarity close to 1

            let test_image_path = "./tests/docs/page_1.png";

            let test_json_path = "./src/snapshots/google_test_embedding_page_1.json";

            let source_embedding: Vec<f64> = extract_embedding(
                &fs::read_to_string(test_json_path).change_context(ChonkyError::VertexAPI)?,
            )?;

            let test_embedding: Vec<f64> =
                make_multimodal_api_request("hash-embed", test_image_path)?;

            //find cosine similarity of vectors

            let mut dot_prod: f64 = 0.0;
            let mut source_mag: f64 = 0.0;
            let mut test_mag: f64 = 0.0;

            for index in 0..test_embedding.len() {
                dot_prod += source_embedding[index] * test_embedding[index];
                source_mag += source_embedding[index] * source_embedding[index];
                test_mag += test_embedding[index] * test_embedding[index];
            }

            let similarity = dot_prod / (test_mag.sqrt() * source_mag.sqrt());

            let expected_similarity_threshold = 0.999;

            if similarity >= expected_similarity_threshold {
                Ok(())
            } else {
                Err(Report::new(ChonkyError::Pdfium).attach_printable(format!(
                    "Cosine similarity is lower than expected: got {similarity}, expected at \
                     least {expected_similarity_threshold}"
                )))
            }
        }

        #[test]
        fn create_embedding_data() {
            let mut document_embeddings = create_document_embedding();

            add_structural_embedding(&mut document_embeddings, 1, "test/path".to_owned(), vec![
                0.1, 0.2, 0.3,
            ]);
            assert_snapshot!(format!("{:?}", document_embeddings));
        }
    }
}
