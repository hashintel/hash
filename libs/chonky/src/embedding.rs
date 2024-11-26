pub mod multi_modal_embedding {

    use base64::{Engine as _, engine::general_purpose};
    use curl::easy::{Easy, List};
    use error_stack::{Report, ResultExt as _};
    use image::DynamicImage;
    use serde_json::{Value, json};

    use crate::{
        ChonkyError, DocumentEmbeddings, Embedding, StructuralEmbedding, StructuralMetadata,
        pdf_segmentation::ExtractedTable,
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

    fn base64_json(image_data: Vec<u8>) -> Result<String, Report<ChonkyError>> {
        let base64_encoded_img = general_purpose::STANDARD.encode(image_data);
        let formatted_json = serde_json::to_string_pretty(&json!({
            "instances": [
                {
                    "image": {
                        "bytesBase64Encoded": base64_encoded_img
                    }
                }
            ]
        }))
        .change_context(ChonkyError::VertexAPI)?;

        // add newline that is appended by yarn in the snapshot
        Ok(format!("{formatted_json}\n"))
    }

    fn text_json(text: &[String]) -> Result<String, Report<ChonkyError>> {
        //merge all text into one without seperator for now
        let mut text = text.join("");
        text.truncate(1000);
        let formatted_json = serde_json::to_string_pretty(&json!({
            "instances": [
                {
                    "text": text
                }
            ]
        }))
        .change_context(ChonkyError::VertexAPI)?;

        // add newline that is appended by yarn in the snapshot
        Ok(format!("{formatted_json}\n"))
    }

    /// Given the extracted images from the pdf, embeds them
    ///
    /// # Errors
    ///
    /// [`ChonkyError::VertexAPI`] when there are HTTP request errors
    pub fn embed_pdf_object_images(
        pdf_image_extract: Vec<Vec<DynamicImage>>,
        project_id: &str,
    ) -> Result<Vec<Vec<Vec<f64>>>, Report<ChonkyError>> {
        let mut embeddings = Vec::new();
        for page_images in pdf_image_extract {
            embeddings.push(embed_screenshots(page_images, project_id)?);
        }
        Ok(embeddings)
    }

    /// Given the screenshot of each page in pdf return its embeddings
    ///
    /// # Errors
    ///
    /// [`ChonkyError::VertexAPI`] when there are HTTP request errors
    pub fn embed_screenshots(
        pdf_image_extract: Vec<DynamicImage>,
        project_id: &str,
    ) -> Result<Vec<Vec<f64>>, Report<ChonkyError>> {
        let mut embeddings = Vec::new();
        for image in pdf_image_extract {
            let mut buffer = Vec::new();
            let encoder = image::codecs::png::PngEncoder::new(&mut buffer);

            image
                .write_with_encoder(encoder)
                .change_context(ChonkyError::ImageError)?;

            embeddings.push(make_multimodal_api_request(
                project_id,
                Some(image.into_bytes()),
                None,
            )?);
        }
        Ok(embeddings)
    }

    /// Given the tables on each page of the pdf, embeds each pages tables seperately into a vector
    /// for each page
    ///
    /// # Errors
    ///
    /// [`ChonkyError::VertexAPI`] when there are HTTP request errors
    pub fn embed_tables(
        pdf_table_bounds: Vec<Vec<ExtractedTable>>,
        project_id: &str,
    ) -> Result<Vec<Vec<Vec<f64>>>, Report<ChonkyError>> {
        let mut embeddings = Vec::new();
        for page_tables in pdf_table_bounds {
            let mut page_embeddings: Vec<Vec<f64>> = Vec::new();
            for table in page_tables {
                let mut buffer = Vec::new();
                let encoder = image::codecs::png::PngEncoder::new(&mut buffer);

                table
                    .image
                    .write_with_encoder(encoder)
                    .change_context(ChonkyError::ImageError)?;

                page_embeddings.push(make_multimodal_api_request(project_id, Some(buffer), None)?);
            }
            embeddings.push(page_embeddings);
        }
        Ok(embeddings)
    }

    /// Given the text on each page of the pdf, embeds each pages text seperately into a vector
    ///
    /// # Errors
    ///
    /// [`ChonkyError::VertexAPI`] when there are HTTP request errors
    pub fn embed_text(
        pdf_text_extract: Vec<Vec<String>>,
        project_id: &str,
    ) -> Result<Vec<Vec<f64>>, Report<ChonkyError>> {
        let mut embeddings = Vec::new();
        for page_text in pdf_text_extract {
            embeddings.push(make_multimodal_api_request(
                project_id,
                None,
                Some(page_text),
            )?);
        }
        Ok(embeddings)
    }

    /// A function that performs authentication with Google Vertex API and performs
    /// a curl request to obtain multimodal embeddings given an image path
    ///
    /// # Errors
    ///
    /// [`ChonkyError::VertexAPI`] when there are HTTP request errors
    /// [`ChonkyError::ImageError`] when there are errors converting to base64 encoding
    pub fn make_multimodal_api_request(
        project_id: &str,
        image_data: Option<Vec<u8>>,
        text_data: Option<Vec<String>>,
    ) -> Result<Vec<f64>, Report<ChonkyError>> {
        // project_id is name of Vertex API project
        let url = format!(
            "https://us-central1-aiplatform.googleapis.com/v1/projects/{project_id}/locations/us-central1/publishers/google/models/multimodalembedding@001:predict"
        );

        let access_token = get_vertex_access_token()?;

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

        if let Some(payload) = image_data {
            let payload = base64_json(payload)?;
            easy.post_fields_copy(payload.as_bytes())
                .change_context(ChonkyError::VertexAPI)?;
        }

        if let Some(payload) = text_data {
            let payload = text_json(&payload)?;
            easy.post_fields_copy(payload.as_bytes())
                .change_context(ChonkyError::VertexAPI)?;
        }

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
            .map(|arr| {
                arr.iter()
                    .map(|x| x.as_f64().ok_or(ChonkyError::VertexAPI))
                    .collect::<Result<Vec<f64>, _>>()
            });

        let text_embedding = parsed["predictions"][0]["textEmbedding"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|x| x.as_f64().ok_or(ChonkyError::VertexAPI))
                    .collect::<Result<Vec<f64>, _>>()
            });

        // Ensure only one of the embeddings exists
        match (image_embedding, text_embedding) {
            (Some(Ok(image_embed)), None) => Ok(image_embed),
            (None, Some(Ok(text_embed))) => Ok(text_embed),
            _ => Err(ChonkyError::VertexAPI).change_context(ChonkyError::VertexAPI),
        }
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
        use std::fs;

        use insta::{assert_binary_snapshot, assert_snapshot};

        use super::*;
        use crate::create_document_embedding;

        #[test]
        fn base64_conversion() -> Result<(), Report<ChonkyError>> {
            let test_path = "./tests/docs/page_1.png";
            let image_data: Vec<u8> =
                fs::read(test_path).change_context(ChonkyError::ImageError)?;
            // source of truth found by decoding base64 encoding to get same image
            assert_binary_snapshot!("page_1.json", base64_json(image_data)?.into());
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

            let image_data: Vec<u8> =
                fs::read(test_image_path).change_context(ChonkyError::ImageError)?;

            let test_embedding: Vec<f64> =
                make_multimodal_api_request("hash-embed", Some(image_data), None)?;

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

pub mod hugging_face_api {
    use std::fs;

    use curl::easy::{Easy, List};
    use error_stack::{Report, ResultExt as _};
    use serde::Deserialize;

    use crate::ChonkyError;

    #[derive(Deserialize, Debug)]
    pub struct BoundingBox {
        pub xmin: f32,
        pub ymin: f32,
        pub xmax: f32,
        pub ymax: f32,
    }

    #[derive(Deserialize, Debug)]
    pub struct TablePrediction {
        pub score: f32,
        #[serde(rename = "box")]
        pub bounding_box: BoundingBox,
    }

    //for now just have it as environment variable
    fn get_hugging_face_token() -> Result<String, Report<ChonkyError>> {
        std::env::var("HUGGING_FACE_TOKEN").change_context(ChonkyError::HuggingFaceAPI)
    }

    fn get_binary_image_data(image_path: String) -> Result<Vec<u8>, Report<ChonkyError>> {
        fs::read(image_path).change_context(ChonkyError::ImageError)
    }

    fn extract_bounding_boxes(
        json_payload: &str,
    ) -> Result<Vec<TablePrediction>, Report<ChonkyError>> {
        serde_json::from_str(json_payload).change_context(ChonkyError::HuggingFaceAPI)
    }

    /// A function that calls `HuggingFace` Serverless Inference API to perform
    /// table recognition on a given image and returns the vectors of bounding boxes of these tables
    ///
    /// # Errors
    ///
    /// [`ChonkyError::HuggingFaceAPI`] when there are HTTP request errors
    pub fn make_table_recognition_request(
        image_path: String,
        retry: bool,
    ) -> Result<Vec<TablePrediction>, Report<ChonkyError>> {
        // this is where we would wish to provide add the retry mechanism

        // error code when model is warm is a 503 error, we can then add x-wait-for-model:true for
        // it to work
        let url =
            "https://api-inference.huggingface.co/models/microsoft/table-transformer-detection";

        let access_token = get_hugging_face_token()?;
        let payload = get_binary_image_data(image_path)?;

        let mut easy = Easy::new();
        easy.url(url).change_context(ChonkyError::HuggingFaceAPI)?;
        easy.post(true)
            .change_context(ChonkyError::HuggingFaceAPI)?;

        let mut headers = List::new();
        headers
            .append(&format!("Authorization: Bearer {access_token}"))
            .change_context(ChonkyError::HuggingFaceAPI)?;

        // we add wait for model to be true if receiving api error prev
        headers
            .append(&format!("x-wait-for-model:{retry}"))
            .change_context(ChonkyError::HuggingFaceAPI)?;

        easy.http_headers(headers)
            .change_context(ChonkyError::HuggingFaceAPI)?;

        easy.post_fields_copy(&payload)
            .change_context(ChonkyError::HuggingFaceAPI)?;

        let mut response = Vec::new();
        {
            let mut transfer = easy.transfer();
            transfer
                .write_function(|data| {
                    response.extend_from_slice(data);
                    Ok(data.len())
                })
                .change_context(ChonkyError::HuggingFaceAPI)?;
            transfer
                .perform()
                .change_context(ChonkyError::HuggingFaceAPI)?;
        }

        extract_bounding_boxes(
            &String::from_utf8(response).change_context(ChonkyError::HuggingFaceAPI)?,
        )
    }

    #[cfg(test)]
    mod tests {
        use insta::assert_snapshot;

        use super::*;

        #[test]
        fn table_recognition() -> Result<(), Report<ChonkyError>> {
            let file_path = "tests/docs/table-testing.png";

            let table_predictions = make_table_recognition_request(file_path.to_owned(), true)?;

            assert_snapshot!(
                "table_bounding_boxes.txt",
                format!("{:?}", table_predictions)
            );
            Ok(())
        }
    }
}
