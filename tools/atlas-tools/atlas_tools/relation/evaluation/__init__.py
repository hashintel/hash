"""Run relation evaluations through explicit, independently testable boundaries.

The package is organized around a pure domain core. Modes construct logical
vote plans, execution consumes them, transport owns provider I/O, and storage
owns durable state. Application code is the only place that assembles those
parts into a command.
"""
