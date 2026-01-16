pub(crate) mod range;
mod r#static;
pub(crate) mod unit;

use core::{
    fmt::{self, Debug, Display},
    ops::{Bound, ControlFlow},
};

use hashql_core::r#type::{
    TypeId,
    environment::Environment,
    kind::{OpaqueType, StructType, TypeKind},
    visit::filter,
};
use hashql_hir::node::data::StructField;

use self::unit::InformationUnit;
use crate::{body::Body, context::MirContext, pass::AnalysisPass};

struct Size {}

struct SizeEstimationPass;

impl<'env, 'heap> AnalysisPass<'env, 'heap> for SizeEstimationPass {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &Body<'heap>) {
        todo!()
    }
}
