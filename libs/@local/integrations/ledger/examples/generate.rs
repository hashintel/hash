//! Writes the Parquet files a SQL file describes.
//!
//! Runs the statements of the file with DuckDB in the file's folder, so that each
//! `COPY (…) TO 'name.parquet'` writes its file next to the SQL file:
//!
//! ```sh
//! cargo run --package hash-integrations-ledger --example generate -- <file.sql>
//! ```

use std::{env, fs, path::PathBuf};

fn main() {
    let file = PathBuf::from(
        env::args()
            .nth(1)
            .expect("the SQL file should be given as the first argument"),
    );
    let sql = fs::read_to_string(&file).expect("the SQL file should be readable");
    if let Some(folder) = file
        .parent()
        .filter(|folder| !folder.as_os_str().is_empty())
    {
        env::set_current_dir(folder).expect("the folder of the SQL file should exist");
    }
    duckdb::Connection::open_in_memory()
        .expect("DuckDB should open")
        .execute_batch(&sql)
        .expect("the statements should run");
}
