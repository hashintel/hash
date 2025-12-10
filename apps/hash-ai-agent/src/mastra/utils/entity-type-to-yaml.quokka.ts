/* eslint-disable @typescript-eslint/ban-ts-comment */
import { dereferencedOrganizationType } from "../fixtures/entity-types/organization.js";
import { dereferencedPersonType } from "../fixtures/entity-types/person.js";
import { entityTypesToYaml } from "./entity-type-to-yaml.js";

// @ts-expect-error Test code
entityTypesToYaml([dereferencedPersonType, dereferencedOrganizationType]); // ?
