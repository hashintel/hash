#![cfg_attr(doc, doc = include_str!("../README.md"))]

extern crate alloc;

use alloc::borrow::Cow;
use std::path::PathBuf;
#[cfg(not(feature = "static"))]
use std::{env, path::Path};

use error_stack::{Report, ResultExt as _};
use image::DynamicImage;
use pdf_segmentation::ExtractedTable;
use pdfium_render::prelude::Pdfium;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ChonkyError {
    #[error("parsing error in pdf")]
    ReadPdf,
    #[error("pdfium error")]
    Pdfium,
    #[error("write error to system")]
    ImageError,
    #[error("Issues with CLI input")]
    Arguments,
    #[error("Issues with Google's Vertex API call")]
    VertexAPI,
    #[error("Issues with HuggingFace Inference Serverless API")]
    HuggingFaceAPI,
    #[error("Problem Storing Embedding Information")]
    Embedding,
}

mod embedding;

pub use embedding::{hugging_face_api, multi_modal_embedding};

/// Attempts to link to the `PDFium` library.
///
/// ## Loading strategy
///
/// - if the `static` feature is enabled, it will attempt to statically link to the `PDFium`
///   library.
/// - Otherwise, it will use the `PDFIUM_DYNAMIC_LIB_PATH` environment variable to load the dynamic
///   library from the specific path. If the environment variable is not set, it will attempt to
///   load the dynamic library from the default path `./libs/`.
///
/// # Errors
///
/// Will return a [`ChonkyError::Pdfium`] if the `PDFium` library could not be loaded.
pub fn link_pdfium() -> Result<Pdfium, Report<ChonkyError>> {
    #[cfg(feature = "static")]
    return Ok(Pdfium::new(
        Pdfium::bind_to_statically_linked_library().change_context(ChonkyError::Pdfium)?,
    ));

    #[cfg(not(feature = "static"))]
    {
        let lib_path = env::var("PDFIUM_DYNAMIC_LIB_PATH")
            .map_or_else(|_| Cow::Borrowed("./libs/"), Cow::Owned);

        let lib_path = Path::new(lib_path.as_ref())
            .canonicalize()
            .change_context(ChonkyError::Pdfium)
            .attach_printable_lazy(|| format!("could not canonicalize path `{lib_path}`"))?;
        Ok(Pdfium::new(
            Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&lib_path))
                .change_context(ChonkyError::Pdfium)?,
        ))
    }
}

#[derive(Debug, Clone)]
pub struct DocumentEmbeddings {
    // Embeddings for structural chunks (page screenshots)
    pub structural_embeddings: Vec<StructuralEmbedding>,
    pub content_embeddings: Vec<PageContentEmbedding>,
}

#[derive(Debug, Clone)]
pub struct PageContentEmbedding {
    _image: PageImageObjectsEmbeddings,
    _table: PageTableObjectsEmbeddings,
    _text: TextEmbedding,
}

#[derive(Debug, Clone)]
pub struct ImageEmbedding {
    pub embedding: Embedding,
    _image: DynamicImage,
}

#[derive(Debug, Clone)]
pub struct TableEmbedding {
    pub embedding: Embedding,
    _table: ExtractedTable,
}
#[derive(Debug, Clone)]
pub struct TextEmbedding {
    _embedding: Embedding,
    _text: String,
}

#[derive(Debug, Clone)]
pub struct Embedding {
    _model_used: Cow<'static, str>, //model name reveals image or text embedding model
    pub embedding_vector: Vec<f64>, //the actual embedding vector
}

#[derive(Debug, Clone)]
pub struct StructuralMetadata {
    _page_number: usize,  //discuss additional metadata useful here
    _image_path: PathBuf, //location of pdf image for embedding
}

#[derive(Debug, Clone)]
pub struct StructuralEmbedding {
    _metadata: StructuralMetadata,
    _embedding: Embedding,
}

#[derive(Debug, Clone)]
pub struct PageImageObjects {
    pub page_image_objects: Vec<DynamicImage>,
}

impl PageImageObjects {
    pub fn iter(self) -> impl Iterator<Item = DynamicImage> + Send {
        self.page_image_objects.into_iter()
    }
}

#[derive(Debug, Clone)]
pub struct PageImageObjectsEmbeddings {
    _embeddings: Box<[ImageEmbedding]>,
}

#[derive(Debug, Clone)]
pub struct PageTableObjects {
    pub page_table_objects: Vec<ExtractedTable>,
}

#[derive(Debug, Clone)]
pub struct PageTableObjectsEmbeddings {
    _embeddings: Vec<TableEmbedding>,
}

#[derive(Debug, Clone)]
pub struct PageScreenshot {
    _page_image_objects: Vec<DynamicImage>,
}

#[must_use]
pub const fn create_document_embedding() -> DocumentEmbeddings {
    DocumentEmbeddings {
        structural_embeddings: Vec::new(),
        content_embeddings: Vec::new(),
    }
}

pub mod pdf_segmentation {

    use std::path::PathBuf;

    use error_stack::{Report, ResultExt as _};
    use futures::future::try_join_all;
    use image::{DynamicImage, GrayImage, RgbaImage};
    use pdfium_render::prelude::{
        PdfBitmap, PdfBitmapFormat, PdfDocument, PdfPageObjectCommon as _,
        PdfPageObjectsCommon as _, PdfPoints, PdfRect, PdfRenderConfig, Pdfium,
    };

    use crate::{
        ChonkyError, DocumentEmbeddings, PageContentEmbedding, PageImageObjects, PageTableObjects,
        embedding::{
            hugging_face_api::make_table_recognition_request,
            multi_modal_embedding::{embed_pdf_object_images, embed_tables, embed_text},
        },
    };

    #[derive(Debug, Clone)]
    pub struct ExtractedTable {
        bounding_box: PdfRect,   //model name reveals image or text embedding model
        pub image: DynamicImage, //the actual embedding vector
    }

    /// Function to read the pdf
    ///
    /// # Errors
    ///
    /// Will return [`ChonkyError::Pdfium`] if `filename` does not exist or the user does not have
    /// permission to read it.
    pub fn load_pdf<'a>(
        pdfium: &'a Pdfium,
        file_path: &PathBuf,
    ) -> Result<PdfDocument<'a>, Report<ChonkyError>> {
        pdfium
            .load_pdf_from_file(&file_path, None)
            .map_err(|err| Report::new(err).change_context(ChonkyError::Pdfium))
    }

    #[expect(
        clippy::future_not_send,
        reason = "Will Implement Safe Data Sending of Pdfium Documents in future"
    )]
    async fn extract_tables(
        pdf: &PdfDocument<'_>,
        images: &[PathBuf],
        config: &PdfRenderConfig,
    ) -> Result<Vec<PageTableObjects>, Report<ChonkyError>> {
        let table_predictions_list = try_join_all(
            images
                .iter()
                .map(|image_path| make_table_recognition_request(image_path, false)),
        )
        .await?;

        let mut pdf_table_bounds = Vec::new();

        //task::spawn_blocking(move || {
        for (index, page) in pdf.pages().iter().enumerate() {
            let table_predictions = &table_predictions_list[index];

            let mut page_table_bounds: Vec<ExtractedTable> = Vec::new();
            //convert the pixels back to pdf points
            for table in table_predictions {
                if table.score < 0.95 {
                    continue;
                }
                let bbox = &table.bounding_box;

                // Convert to i32 safely discarding decimals and rounding down
                // normally bbox should already be an integer that needs to be casted
                let xmin: i32 = num_traits::cast(bbox.xmin).ok_or(ChonkyError::Pdfium)?;
                let ymin: i32 = num_traits::cast(bbox.ymin).ok_or(ChonkyError::Pdfium)?;
                let xmax: i32 = num_traits::cast(bbox.xmax).ok_or(ChonkyError::Pdfium)?;
                let ymax: i32 = num_traits::cast(bbox.ymax).ok_or(ChonkyError::Pdfium)?;

                // Calculate bottom-left and top-right
                let bottom_left = page
                    .pixels_to_points(xmin, ymax, config)
                    .change_context(ChonkyError::Pdfium)?;
                let top_right = page
                    .pixels_to_points(xmax, ymin, config)
                    .change_context(ChonkyError::Pdfium)?;

                // Render PDF with cropped info and save as Dynamic Image
                let image_bitmap = page
                    .render_with_config(&create_config().clip(xmin, ymin, xmax, ymax))
                    .change_context(ChonkyError::Pdfium)?;

                let width = u32::try_from(xmax - xmin).change_context(ChonkyError::Pdfium)?;
                let height = u32::try_from(ymax - ymin).change_context(ChonkyError::Pdfium)?;
                let xmin = u32::try_from(xmin).change_context(ChonkyError::Pdfium)?;
                let ymin = u32::try_from(ymin).change_context(ChonkyError::Pdfium)?;

                // Crop image using safe dimensions
                let image = image_bitmap.as_image().crop(xmin, ymin, width, height);

                //add the proper table bound for checking extracted text
                let extracted_table = ExtractedTable {
                    bounding_box: PdfRect::new(
                        bottom_left.1,
                        bottom_left.0,
                        top_right.1,
                        top_right.0,
                    ),
                    image,
                };
                page_table_bounds.push(extracted_table);
                //later step to extract table textual information
            }
            pdf_table_bounds.push(PageTableObjects {
                page_table_objects: page_table_bounds,
            });
        }
        Ok(pdf_table_bounds)
    }

    // TODO: This function will returns the extracted text that is segmented in proper reading order
    // and grouped by boundaries such as newline spacing and other layout information,
    // segments can contain texts with different formatting (such as a sentence with a
    // **bold** inside)
    ///
    /// For now, this function just solely extracts all text that is in a singular page for
    /// extraction
    ///
    /// # Errors
    ///
    /// [`ChonkyError::Pdfium`] if conversion from pixels to pdf points fails
    #[must_use]
    pub fn extract_text(
        pdf: &PdfDocument,
        pdf_table_bounds: &[PageTableObjects],
    ) -> Vec<Vec<String>> {
        let mut pages_text_extract: Vec<Vec<String>> = Vec::new();
        //process page by page
        for (index, page) in pdf.pages().iter().enumerate() {
            //we know index of images and pdf must be the same

            //check if text bounding boxes overlap with the pdf table bounds
            let page_table_bounds = &pdf_table_bounds[index].page_table_objects;

            let page_text: Vec<String> = page
                .objects()
                .iter()
                .filter_map(|object| {
                    object.as_text_object().and_then(|text_object| {
                        page_table_bounds
                            .iter()
                            .all(|table_box| {
                                //silently ignore errors if not overlapping
                                !table_box
                                    .bounding_box
                                    .does_overlap(&text_object.bounds().unwrap_or(PdfRect::zero()))
                            })
                            .then(|| text_object.text())
                    })
                })
                .collect::<Vec<_>>();

            //let mut page_text_object = Vec::new();

            // // Explicitly iterate over pdf_objects without using an iterator chain
            // for object in page.objects().iter() {
            //     if let Some(text_object) = object.as_text_object() {
            //         if pdf_table_bounds.iter().all(|table_box| {
            //             !table_box.does_overlap(&text_object.bounds().unwrap_or(PdfRect::zero()))
            //         }) {
            //             // Move the text_object directly into the vector
            //             page_text_object.push(text_object);
            //         }
            //     }
            // }

            //let page_text = group_similar_segments(page_text_object)?;

            pages_text_extract.push(page_text);
        }
        pages_text_extract
    }

    fn extract_images(pdf: &PdfDocument) -> Vec<PageImageObjects> {
        let mut pdf_image_extract = Vec::new();

        for page in pdf.pages().iter() {
            let mut page_image_extract = Vec::new();

            page.objects().iter().for_each(|object| {
                if let Some(image) = object.as_image_object() {
                    if let Ok(image) = image.get_raw_image() {
                        page_image_extract.push(image);
                    }
                }
            });
            // println!(
            //     "There are {} images on page {}",
            //     page_image_extract.len(),
            //     _index
            // );
            pdf_image_extract.push(PageImageObjects {
                page_image_objects: page_image_extract,
            });
        }
        pdf_image_extract
    }

    /// This function takes in the pdf and the paths of the pdf pages as images and modfies the
    /// document embeddings to include the embeddings of tables, images, and text inside the pdf
    ///
    /// # Errors
    ///
    /// [`ChonkyError::Pdfium`] if pdf rendering of tables fails
    /// [`ChonkyError::VertexAPI`] if the Multimodal Embedding Model fails
    /// [`ChonkyError::HuggingFaceAPI`] if there are issues parsing the table
    #[expect(
        clippy::future_not_send,
        reason = "Will Implement Safe Data Sending of Pdfium Documents in future"
    )]
    pub async fn embed_pdf<'a>(
        pdf: &PdfDocument<'_>,
        images: &[PathBuf],
        document_embeddings: &'a mut DocumentEmbeddings,
    ) -> Result<&'a mut DocumentEmbeddings, Report<ChonkyError>> {
        let project_id =
            std::env::var("GOOGLE_PROJECT_ID").change_context(ChonkyError::VertexAPI)?;

        let pdf_table_bounds = extract_tables(pdf, images, &create_config()).await?;

        let pdf_text_extract = extract_text(pdf, &pdf_table_bounds);

        let pdf_image_extract = extract_images(pdf);

        let image_embeddings =
            embed_pdf_object_images(pdf_image_extract.clone(), &project_id).await?;

        let table_embeddings = embed_tables(pdf_table_bounds.clone(), &project_id).await?;

        let pdf_text_embeddings = embed_text(
            &pdf_text_extract
                .iter()
                .map(|text| &**text)
                .collect::<Vec<_>>(),
            &project_id,
        )
        .await?;

        //TODO: implement in a way to prevent so much unnecessary cloning

        //turn image embedding vector into iterator
        let mut image_embeddings = image_embeddings.into_iter();

        let mut table_embeddings = table_embeddings.into_iter();

        let mut text_embeddings = pdf_text_embeddings.into_iter();

        for _ in 0..pdf.pages().len() {
            //create Page content embedding now
            let page_content_embedding = PageContentEmbedding {
                _image: image_embeddings
                    .next()
                    .ok_or(ChonkyError::VertexAPI)
                    .attach_printable("Missing Page Image Object Embeddings")?,
                _table: table_embeddings
                    .next()
                    .ok_or(ChonkyError::VertexAPI)
                    .attach_printable("Missing Page Table Object Embeddings")?,
                _text: text_embeddings
                    .next()
                    .ok_or(ChonkyError::VertexAPI)
                    .attach_printable("Missing Text Embeddings")?,
            };

            document_embeddings
                .content_embeddings
                .push(page_content_embedding);
        }

        Ok(document_embeddings)
    }

    // /// TODO: Given a list of segments of a PDF this function reads the segments via the bounding
    // /// box order, with the naive approach of top→bottom (and if same top then left→right) and
    // /// returns a sorted vector of reading order of segments
    // ///
    // /// #Errors
    // ///
    // /// TBD
    //fn obtain_reading_order(segments: Vec<segment>) -> () {}

    // /// TODO: Function returns a smaller segment vector by grouping segments in similar chunks,
    // but /// have different style formatting The new vector stores this information seperately
    // ///
    // /// #Errors
    // ///
    // /// TBD
    //fn group_similar_segments() -> () {}

    /// Takes in a pdf document and returns a vector list where each page
    /// is processed into a raw image that can be later converted to any image format
    ///
    /// # Errors
    ///
    /// Return an [`ChonkyError::Pdfium`]  if there was a
    /// problem with the image processing operation, occurs when image cannot be encoded into
    /// specific image format
    pub fn pdf_to_images(pdf: &PdfDocument) -> Result<Vec<DynamicImage>, Report<ChonkyError>> {
        let mut images: Vec<DynamicImage> = Vec::new();

        //may adjust resolution depending on need
        let resolution_width = 1000;

        // information about how to store image, like pixed resolution and aspect ratio
        let config = PdfRenderConfig::new().set_target_width(resolution_width);

        let mut bitmap = create_empty_bitmap(pdf, &config)?;

        for page in pdf.pages().iter() {
            // Render the entire page to a bitmap
            page.render_into_bitmap_with_config(&mut bitmap, &config)
                .change_context(ChonkyError::Pdfium)?;

            // Convert PdfBitmap to DynamicImage
            let dynamic_image = as_image(&bitmap)?;
            images.push(dynamic_image);
        }

        Ok(images)
    }

    /// Takes in a config with desired resolution of image and a pdf and creates
    /// an empty bitmap that can be used by the entire pdf
    ///
    /// # Errors
    ///
    /// Return an [`ChonkyError::Pdfium`] if there was a problem
    /// with converting the pdfs dimensions to pixels
    fn create_empty_bitmap<'a>(
        pdf: &'a PdfDocument,
        config: &'a PdfRenderConfig,
    ) -> Result<PdfBitmap<'a>, Report<ChonkyError>> {
        // read the first page to get page dimesnions
        let page_dimensions = pdf
            .pages()
            .page_sizes()
            .change_context(ChonkyError::Pdfium)?[0];

        let page = pdf.pages().get(0).change_context(ChonkyError::Pdfium)?;

        //converts the boundings boxes to pixels that can be used for creating bitmap with proper
        // for correct bitmap dimensions, height point must be set to 0 to get max pixel height
        let page_dimensions = pdf
            .pages()
            .get(0)
            .change_context(ChonkyError::Pdfium)?
            .points_to_pixels(page_dimensions.width(), PdfPoints::new(0.0), config)
            .change_context(ChonkyError::Pdfium)?;

        // some pdfs have dimensions that are larger than the actual "content" resulting in negative
        // dimensions we aim to get the "net" dimensions by subtracting the 0.0 point pixel
        // conversion from the height and width
        let base_page_dimensions = page
            .points_to_pixels(PdfPoints::new(0.0), page.height(), config)
            .change_context(ChonkyError::Pdfium)?;

        let page_dimensions = (
            page_dimensions.0 - base_page_dimensions.0,
            page_dimensions.1 - base_page_dimensions.1,
        );

        //create an empty bitmap that follows dimensions of pdf
        // to prevent repeated memory allocations (we assume all pdfs are same dimension)
        let bitmap = PdfBitmap::empty(
            page_dimensions.0,
            page_dimensions.1,
            PdfBitmapFormat::BGRA,
            pdf.bindings(),
        )
        .change_context(ChonkyError::Pdfium)?;

        Ok(bitmap)
    }

    ///A vendored function from pdfium-render's `as_image` function that returns a result instead
    /// of panicking
    ///
    /// Errors#
    ///
    /// [`ChonkyError::Pdfium`] when the image had an error being processed
    fn as_image(bitmap: &PdfBitmap) -> Result<DynamicImage, Report<ChonkyError>> {
        let bytes = bitmap.as_rgba_bytes();

        // clippy complains if we directly cast into u32 from i32 because of sign loss
        // since we assume dimensions must be positive this is not as issue
        let width = u32::try_from(bitmap.width()).change_context(ChonkyError::Pdfium)?;

        let height = u32::try_from(bitmap.height()).change_context(ChonkyError::Pdfium)?;

        Ok(match bitmap.format().map_err(|_foo| ChonkyError::Pdfium)? {
            PdfBitmapFormat::BGRA | PdfBitmapFormat::BGRx | PdfBitmapFormat::BGR => {
                RgbaImage::from_raw(width, height, bytes)
                    .map(DynamicImage::ImageRgba8)
                    .ok_or(ChonkyError::Pdfium)?
            }
            PdfBitmapFormat::Gray => GrayImage::from_raw(width, height, bytes)
                .map(DynamicImage::ImageLuma8)
                .ok_or(ChonkyError::Pdfium)?,
            _ => return Err(Report::new(ChonkyError::Pdfium)),
        })
    }

    fn create_config() -> PdfRenderConfig {
        //may adjust resolution depending on need
        let resolution_width = 1000;

        PdfRenderConfig::new().set_target_width(resolution_width)
    }

    #[cfg(test)]
    mod tests {

        use insta::{assert_binary_snapshot, assert_snapshot};

        use super::*;
        use crate::{create_document_embedding, link_pdfium};

        #[tokio::test]
        async fn pdf_table_extraction() -> Result<(), Report<ChonkyError>> {
            let pdfium = link_pdfium()?;
            let file_path = PathBuf::from("./tests/docs/table-testing.pdf");

            let pdf = load_pdf(&pdfium, &file_path).change_context(ChonkyError::Pdfium)?;

            let images = vec![PathBuf::from("./tests/docs/table-testing.png")];

            let table_info = extract_tables(&pdf, &images, &create_config()).await?;
            //just take first vector

            let table = table_info[0].page_table_objects[0].clone();

            assert_snapshot!("extracted_table.txt", format!("{:#?}", table.bounding_box));

            let mut buffer = Vec::new();
            let encoder = image::codecs::bmp::BmpEncoder::new(&mut buffer);

            table
                .image
                .write_with_encoder(encoder)
                .expect("image should be able to be encoded into a bitmap");
            assert_binary_snapshot!("extracted_table.bmp", buffer);

            Ok(())
        }

        #[tokio::test]
        async fn pdf_text_extraction() -> Result<(), Report<ChonkyError>> {
            let pdfium = link_pdfium()?;
            let file_path = PathBuf::from("./tests/docs/table-testing.pdf");

            let pdf = load_pdf(&pdfium, &file_path).change_context(ChonkyError::Pdfium)?;

            let images = vec![PathBuf::from("./tests/docs/table-testing.png")];

            let table_info = extract_tables(&pdf, &images, &create_config()).await?;
            //just take first vector

            let text_info = extract_text(&pdf, &table_info);
            //just take first vector

            let text = text_info[0].join("");

            assert_snapshot!("extracted_text.txt", text);

            Ok(())
        }

        #[test]
        fn pdf_image_extract() -> Result<(), Report<ChonkyError>> {
            let pdfium = link_pdfium()?;

            let file_path = PathBuf::from("./tests/docs/test-doc.pdf");

            let pdf = load_pdf(&pdfium, &file_path).change_context(ChonkyError::Pdfium)?;

            let images = extract_images(&pdf);

            let mut buffer = Vec::new();
            let encoder = image::codecs::bmp::BmpEncoder::new(&mut buffer);

            //the third page has an image to verify
            images[2].page_image_objects[0]
                .write_with_encoder(encoder)
                .expect("image should be able to be encoded into a bitmap");
            assert_binary_snapshot!("extracted_image.bmp", buffer);

            Ok(())
        }

        #[tokio::test]
        async fn content_embeddings() -> Result<(), Report<ChonkyError>> {
            let pdfium = link_pdfium()?;

            let file_path = PathBuf::from("./tests/docs/table-testing.pdf");

            let pdf = load_pdf(&pdfium, &file_path).change_context(ChonkyError::Pdfium)?;

            let images = vec![PathBuf::from("./tests/docs/table-testing.png")];

            let mut document_embeddings = create_document_embedding();
            let document_embeddings = embed_pdf(&pdf, &images, &mut document_embeddings).await?;

            //cannot use binary snapshot since embeddings vary
            //check vector length since we individually check embeddings in other tests

            if document_embeddings.content_embeddings.len() != 1 {
                return Err(Report::new(ChonkyError::Pdfium).attach_printable(format!(
                    "Expected there to be {} pages of content embeddings but found {}",
                    1,
                    document_embeddings.content_embeddings.len()
                )));
            }

            // if !document_embeddings.content_embeddings[0]._image.is_empty() {
            //     return Err(Report::new(ChonkyError::Pdfium).attach_printable(format!(
            //         "Expected there to be {} images but found {}",
            //         0,
            //         document_embeddings.content_embeddings.len()
            //     )));
            // }

            // if document_embeddings.content_embeddings[0]._table.len() != 1 {
            //     return Err(Report::new(ChonkyError::Pdfium).attach_printable(format!(
            //         "Expected there to be {} tables but found {}",
            //         1,
            //         document_embeddings.content_embeddings.len()
            //     )));
            // }

            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use error_stack::{Report, ResultExt as _};
    use insta::assert_binary_snapshot;

    use super::*;

    #[test]
    fn pdf_load_success() -> Result<(), Report<ChonkyError>> {
        let pdfium = link_pdfium()?;

        let test_pdf_string = PathBuf::from("tests/docs/test-doc.pdf");

        let _pdf = pdf_segmentation::load_pdf(&pdfium, &test_pdf_string)
            .change_context(ChonkyError::Pdfium)?;

        Ok(())
    }

    #[test]
    fn pdf_load_failure() -> Result<(), Report<ChonkyError>> {
        let pdfium = link_pdfium()?;

        let test_pdf_string = PathBuf::from("tests/docs/invalid.pdf");

        // Should return an error when loading an invalid PDF
        let result = pdf_segmentation::load_pdf(&pdfium, &test_pdf_string)
            .change_context(ChonkyError::Pdfium);

        if result.is_err() {
            // Expected failure, return Ok
            Ok(())
        } else {
            // Unexpected success, return an error
            Err(Report::new(ChonkyError::Pdfium).attach_printable("Expected load_pdf to fail"))
        }
    }

    #[test]
    fn pdf_image_conversion() -> Result<(), Report<ChonkyError>> {
        let pdfium = link_pdfium()?;

        let test_pdf_string = PathBuf::from("tests/docs/test-doc.pdf");

        let pdf = pdf_segmentation::load_pdf(&pdfium, &test_pdf_string)
            .change_context(ChonkyError::Pdfium)?;

        //number of pages of pdf
        let num_pages: usize = pdf.pages().len().into();

        let preprocessed_pdf =
            pdf_segmentation::pdf_to_images(&pdf).change_context(ChonkyError::Pdfium)?;

        //start by checking if proper amount of images are converted

        if preprocessed_pdf.len() != num_pages {
            return Err(Report::new(ChonkyError::Pdfium)
                .attach_printable("The length of vector should be number of pages"));
        }

        // now check if the image contents are the same using insta snapshots
        // start by converting images to binary
        // let preprocessed_pdf: Vec<Vec<u8>> = preprocessed_pdf
        //     .into_iter()
        //     .map(image::DynamicImage::into_bytes)
        //     .collect();

        // we only really need to check the first three pages
        for (index, page) in preprocessed_pdf.into_iter().enumerate().take(3) {
            let mut buffer = Vec::new();
            let encoder = image::codecs::bmp::BmpEncoder::new(&mut buffer);

            page.write_with_encoder(encoder)
                .expect("image should be able to be encoded into a bitmap");
            assert_binary_snapshot!(format!("page_{}.bmp", index + 1).as_str(), buffer);
        }

        Ok(())
    }
}
