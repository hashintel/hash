#![feature(custom_test_frameworks)]
#![test_runner(criterion::runner)]

mod read_scaling;
mod representative_read;
mod writes;

mod util;
