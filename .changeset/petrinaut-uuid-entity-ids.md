---
"@hashintel/petrinaut-core": patch
---

Every entity id is a UUID: places, transitions, types, parameters, equations, scenarios, metrics and component instances with other ids get stable UUIDs when they load, and inputs that use the old ids still resolve.
