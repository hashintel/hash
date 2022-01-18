use crate::run_test;

run_test!(global);
// TODO: Change default distance function to "euclidean"
//   see https://app.asana.com/0/1201481007343159/1201674703280810
run_test!(local, #[ignore]);
