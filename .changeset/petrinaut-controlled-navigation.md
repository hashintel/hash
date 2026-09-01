---
"@hashintel/petrinaut": patch
---

Add a `navigation` prop to `Petrinaut`: a router-neutral controller through
which the host can read and drive the app location (mode, Simulate section and
resource, scenario, subnet, selection, and creation drawers), making them real
browser history destinations. A creation drawer now layers over the record
already open instead of closing it, and the hamburger menu hides **Layout** on
a read-only net.
