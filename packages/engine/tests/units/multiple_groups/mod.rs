use crate::experiment::run_test_suite;

#[tokio::test]
async fn sugarscape() {
    let project_path = dbg!(
        std::path::Path::new(file!())
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("experiments/sugarscape")
    )
    .canonicalize()
    .unwrap();

    run_test_suite(
        project_path,
        "experiments::sugarscape",
        None,
        None,
        Some(500),
    )
    .await
}
