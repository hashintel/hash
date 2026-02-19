//! Unit metadata and formatting for counter values.

use darwin_kperf::event::Event;

/// Unit strings for formatting counter values at different SI scales.
#[derive(Debug, Clone, Copy)]
pub(crate) struct Unit {
    raw: &'static str,
    kilo: &'static str,
    mega: &'static str,
    giga: &'static str,
    machine: &'static str,
    per_element: &'static str,
    per_byte: &'static str,
}

impl Unit {
    /// Picks the appropriate SI-scaled unit string for a typical value.
    const fn scaled(&self, typical: f64) -> (f64, &'static str) {
        if typical < 1_000.0 {
            (1.0, self.raw)
        } else if typical < 1_000_000.0 {
            (1e-3, self.kilo)
        } else if typical < 1_000_000_000.0 {
            (1e-6, self.mega)
        } else {
            (1e-9, self.giga)
        }
    }
}

const INSTRUCTIONS: Unit = Unit {
    raw: "instr",
    kilo: "Kinstr",
    mega: "Minstr",
    giga: "Ginstr",
    machine: "instructions",
    per_element: "instr/elem",
    per_byte: "instr/B",
};

const CYCLES: Unit = Unit {
    raw: "cycles",
    kilo: "Kcycles",
    mega: "Mcycles",
    giga: "Gcycles",
    machine: "cycles",
    per_element: "cycles/elem",
    per_byte: "cycles/B",
};

const BRANCH_MISSES: Unit = Unit {
    raw: "misses",
    kilo: "Kmisses",
    mega: "Mmisses",
    giga: "Gmisses",
    machine: "branch-misses",
    per_element: "misses/elem",
    per_byte: "misses/B",
};

const CACHE_MISSES: Unit = Unit {
    raw: "misses",
    kilo: "Kmisses",
    mega: "Mmisses",
    giga: "Gmisses",
    machine: "l1d-misses",
    per_element: "misses/elem",
    per_byte: "misses/B",
};

const COUNTS: Unit = Unit {
    raw: "counts",
    kilo: "Kcounts",
    mega: "Mcounts",
    giga: "Gcounts",
    machine: "counts",
    per_element: "counts/elem",
    per_byte: "counts/B",
};

pub(crate) const fn unit_for_event(event: Event) -> Unit {
    #[expect(clippy::wildcard_enum_match_arm, reason = "100s of events")]
    match event {
        Event::FixedInstructions => INSTRUCTIONS,
        Event::FixedCycles => CYCLES,
        Event::BranchMispredNonspec => BRANCH_MISSES,
        Event::L1DCacheMissLdNonspec => CACHE_MISSES,
        _ => COUNTS,
    }
}

pub(crate) struct CounterFormatter {
    unit: Unit,
}

impl CounterFormatter {
    pub(crate) const fn new(unit: Unit) -> Self {
        Self { unit }
    }

    #[expect(clippy::float_arithmetic)]
    fn scale_values_inner(&self, typical: f64, values: &mut [f64]) -> &'static str {
        let (factor, label) = self.unit.scaled(typical);

        for value in values {
            *value *= factor;
        }

        label
    }

    #[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
    fn scale_throughputs_bytes(&self, bytes: u64, values: &mut [f64]) -> &'static str {
        for value in values {
            *value /= bytes as f64;
        }

        self.unit.per_byte
    }

    #[expect(clippy::float_arithmetic, clippy::cast_precision_loss)]
    fn scale_throughputs_elements(&self, elements: u64, values: &mut [f64]) -> &'static str {
        for value in values {
            *value /= elements as f64;
        }

        self.unit.per_element
    }
}

// Implement ValueFormatter for the real criterion crate.
impl criterion::measurement::ValueFormatter for CounterFormatter {
    fn scale_values(&self, typical_value: f64, values: &mut [f64]) -> &'static str {
        self.scale_values_inner(typical_value, values)
    }

    #[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
    fn scale_throughputs(
        &self,
        _typical: f64,
        throughput: &criterion::Throughput,
        values: &mut [f64],
    ) -> &'static str {
        match *throughput {
            criterion::Throughput::Bytes(bytes) | criterion::Throughput::BytesDecimal(bytes) => {
                self.scale_throughputs_bytes(bytes, values)
            }
            criterion::Throughput::Elements(elements)
            | criterion::Throughput::ElementsAndBytes { elements, .. } => {
                self.scale_throughputs_elements(elements, values)
            }
            criterion::Throughput::Bits(bits) => self.scale_throughputs_bytes(bits / 8, values),
        }
    }

    fn scale_for_machines(&self, _values: &mut [f64]) -> &'static str {
        self.unit.machine
    }
}

// Implement ValueFormatter for the codspeed-criterion-compat crate.
#[cfg(feature = "codspeed")]
impl codspeed_criterion_compat_walltime::measurement::ValueFormatter for CounterFormatter {
    fn scale_values(&self, typical_value: f64, values: &mut [f64]) -> &'static str {
        self.scale_values_inner(typical_value, values)
    }

    fn scale_throughputs(
        &self,
        _typical: f64,
        throughput: &codspeed_criterion_compat_walltime::Throughput,
        values: &mut [f64],
    ) -> &'static str {
        match *throughput {
            codspeed_criterion_compat_walltime::Throughput::Bytes(bytes)
            | codspeed_criterion_compat_walltime::Throughput::BytesDecimal(bytes) => {
                self.scale_throughputs_bytes(bytes, values)
            }
            codspeed_criterion_compat_walltime::Throughput::Elements(elements) => {
                self.scale_throughputs_elements(elements, values)
            }
        }
    }

    fn scale_for_machines(&self, _values: &mut [f64]) -> &'static str {
        self.unit.machine
    }
}
