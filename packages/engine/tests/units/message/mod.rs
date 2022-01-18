use crate::run_test;

run_test!(helper);
run_test!(no_recipient);
run_test!(one_recipient);
run_test!(multiple_recipients);

run_test!(all_types);

run_test!(create_agent);
run_test!(remove_agent);

// TODO: Fix `DataStore` error when removing last agent
//   see https://app.asana.com/0/1201481007343159/1201681219656029/f
run_test!(remove_self, #[ignore]);
