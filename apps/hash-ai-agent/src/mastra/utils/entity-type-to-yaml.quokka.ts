/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable import/first */

/* eslint-disable @typescript-eslint/ban-ts-comment */
import { dereferencedOrganizationType } from '../fixtures/entity-types/organization.js';
import { dereferencedPersonType } from '../fixtures/entity-types/person.js';
import { entityTypesToYaml } from './entity-type-to-yaml.js';

// @ts-expect-error Test code
entityTypesToYaml([dereferencedPersonType, dereferencedOrganizationType]);

import organizationJson from '../fixtures/entity-types/raw/organization.json';
import personJson from '../fixtures/entity-types/raw/person.json';

// console.log("Fetched person type JSON:", personJson);
// console.log("Fetched organization type JSON:", organizationJson);

// fetch("https://hash.ai/@h/types/entity-type/organization/v/3")
//   .then((res) => res.json())
//   .then((data) => console.log(data));

function dereferenceEntity(entity: Entity) {
  /*
    this function should resolve everywhere a SchemaUrl is referenced, and replace it with the actual fetched definition


  */
}

const organization: Entity = organizationJson;
const person: Entity = personJson;

type SchemaUrl = string;

type Ref = {
  $ref: string;
};

type Refs =
  | Ref
  | {
      oneOf: Ref[];
    }
  | {
      allOf: Ref[];
    }
  | {
      anyOf: Ref[];
    };

type RefItems = {
  items: Refs;
  type: string;
  maxItems?: number;
  minItems?: number;
};

interface Entity {
  $id: SchemaUrl;
  $schema: SchemaUrl;
  labelProperty?: SchemaUrl;
  required?: SchemaUrl[];
  properties: {
    [U in SchemaUrl]: Ref | RefItems;
  };
  links?: {
    [U in SchemaUrl]: RefItems | Ref;
  };
  allOf?: Ref[];
  // descriptive
  icon: string;
  title: string;
  description: string;
  type: string;
  kind: string;
}

const imageFile: Entity = {
  $id: 'https://hash.ai/@h/types/entity-type/image-file/v/2',
  $schema: 'https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type',
  allOf: [
    {
      $ref: 'https://hash.ai/@h/types/entity-type/file/v/2',
    },
  ],
  description: 'An image file hosted at a URL',
  icon: '/icons/types/file-image.svg',
  kind: 'entityType',
  properties: {},
  title: 'Image File',
  type: 'object',
};

const profileBio: Entity = {
  $id: 'https://hash.ai/@h/types/entity-type/profile-bio/v/1',
  $schema: 'https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type',
  allOf: [
    {
      $ref: 'https://hash.ai/@h/types/entity-type/block-collection/v/1',
    },
  ],
  description: "A biography for display on someone or something's profile.",
  icon: '/icons/types/memo-circle-info.svg',
  kind: 'entityType',
  links: {
    'https://hash.ai/@h/types/entity-type/has-indexed-content/v/1': {
      items: {
        oneOf: [
          {
            $ref: 'https://hash.ai/@h/types/entity-type/block/v/1',
          },
        ],
      },
      minItems: 1,
      type: 'array',
    },
  },
  properties: {},
  title: 'Profile Bio',
  type: 'object',
};

const file: Entity = {
  $id: 'https://hash.ai/@h/types/entity-type/file/v/1',
  $schema: 'https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type',
  description: 'A file hosted at a URL',
  icon: '/icons/types/file.svg',
  kind: 'entityType',
  labelProperty: 'https://blockprotocol.org/@blockprotocol/types/property-type/display-name/',
  properties: {
    'https://blockprotocol.org/@blockprotocol/types/property-type/description/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/description/v/1',
    },
    'https://blockprotocol.org/@blockprotocol/types/property-type/display-name/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1',
    },
    'https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/v/1',
    },
    'https://blockprotocol.org/@blockprotocol/types/property-type/file-name/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/file-name/v/1',
    },
    'https://blockprotocol.org/@blockprotocol/types/property-type/file-size/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/file-size/v/1',
    },
    'https://blockprotocol.org/@blockprotocol/types/property-type/file-url/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/file-url/v/1',
    },
    'https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/v/1',
    },
    'https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/v/1',
    },
    'https://blockprotocol.org/@blockprotocol/types/property-type/original-source/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/original-source/v/1',
    },
    'https://blockprotocol.org/@blockprotocol/types/property-type/original-url/': {
      $ref: 'https://blockprotocol.org/@blockprotocol/types/property-type/original-url/v/1',
    },
    'https://hash.ai/@h/types/property-type/file-storage-bucket/': {
      $ref: 'https://hash.ai/@h/types/property-type/file-storage-bucket/v/1',
    },
    'https://hash.ai/@h/types/property-type/file-storage-endpoint/': {
      $ref: 'https://hash.ai/@h/types/property-type/file-storage-endpoint/v/1',
    },
    'https://hash.ai/@h/types/property-type/file-storage-force-path-style/': {
      $ref: 'https://hash.ai/@h/types/property-type/file-storage-force-path-style/v/1',
    },
    'https://hash.ai/@h/types/property-type/file-storage-key/': {
      $ref: 'https://hash.ai/@h/types/property-type/file-storage-key/v/1',
    },
    'https://hash.ai/@h/types/property-type/file-storage-provider/': {
      $ref: 'https://hash.ai/@h/types/property-type/file-storage-provider/v/1',
    },
    'https://hash.ai/@h/types/property-type/file-storage-region/': {
      $ref: 'https://hash.ai/@h/types/property-type/file-storage-region/v/1',
    },
  },
  required: ['https://blockprotocol.org/@blockprotocol/types/property-type/file-url/'],
  title: 'File',
  type: 'object',
};
