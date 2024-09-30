use std::{fs, io};

use error_stack::{Report, ResultExt as _};
use graph_api::rest::OpenApiDocumentation;

fn main() -> Result<(), Report<io::Error>> {
    let openapi_path = std::path::Path::new("openapi");
    let openapi_models_path = openapi_path.join("models");
    let openapi_json_path = openapi_path.join("openapi.json");
    for path in [openapi_models_path, openapi_json_path] {
        if !path.exists() {
            continue;
        }
        if path.is_file() {
            fs::remove_file(&path)
                .attach_printable("could not remove old OpenAPI file")
                .attach_printable_lazy(|| path.display().to_string())?;
        } else {
            fs::remove_dir_all(&path)
                .attach_printable("could not remove old OpenAPI file")
                .attach_printable_lazy(|| path.display().to_string())?;
        }
    }
    OpenApiDocumentation::write_openapi(openapi_path)
        .attach_printable("could not write OpenAPI spec")?;

    Ok(())
}
