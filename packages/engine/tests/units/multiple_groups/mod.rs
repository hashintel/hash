use crate::experiment::run_test_suite;

// TODO: We should expand this test suite with more simulations, and ideally not need to duplicate
//  the experiment projects such as Sugarscape
#[tokio::test]
#[ignore]
async fn sugarscape() {
    let project_path = std::path::Path::new(file!())
        .parent()
        .unwrap()
        .join("sugarscape")
        .canonicalize()
        .unwrap();

    run_test_suite(project_path, module_path!(), None, None, Some(500)).await
}
