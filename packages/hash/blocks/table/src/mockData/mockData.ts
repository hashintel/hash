import { TableOptions } from "react-table";
import { BlockProtocolLinkedDataDefinition } from "@hashintel/block-protocol";

export interface Person {
  email: string;
  entityId: string;
  type: "Person";
  name: string;
  employerId: string;
  employer?: Company;
}

export interface Location {
  entityId: string;
  country: string;
  name: string;
  type: "Location";
}

export interface Company {
  entityId: string;
  name: string;
  url: string;
  locationId: string;
  location?: Location;
  type: "Company";
}

const london: Location = {
  entityId: "place1",
  country: "UK",
  name: "London",
  type: "Location",
};

const HASH: Company = {
  name: "HASH",
  url: "https://hash.ai",
  locationId: "place1",
  entityId: "c1",
  type: "Company",
};

const people: Person[] = [
  {
    email: "aj@hash.ai",
    employerId: "c1",
    entityId: "1",
    name: "Akash Joshi",
    type: "Person",
  },
  {
    email: "c@hash.ai",
    employerId: "c1",
    entityId: "2",
    name: "Ciaran Morinan",
    type: "Person",
  },
  {
    email: "d@hash.ai",
    employerId: "c1",
    entityId: "3",
    name: "David Wilkinson",
    type: "Person",
  },
  {
    email: "ef@hash.ai",
    employerId: "c1",
    entityId: "4",
    name: "Eaden Fahey",
    type: "Person",
  },
  {
    email: "nh@hash.ai",
    employerId: "c1",
    entityId: "5",
    name: "Nate Higgins",
    type: "Person",
  },
  {
    email: "vu@hash.ai",
    employerId: "c1",
    entityId: "6",
    name: "Valentino Ugbala",
    type: "Person",
  },
  {
    email: "bw@hash.ai",
    employerId: "c1",
    entityId: "7",
    name: "Ben Werner",
    type: "Person",
  },
  {
    email: "al@hash.ai",
    employerId: "c1",
    entityId: "8",
    name: "Andre Litvin",
    type: "Person",
  },
];

export const initialTableData = {
  initialState: {
    hiddenColumns: [
      "entityId",
      "employerId",
      "employer.locationId",
      "employer.entityId",
      "employer.location.entityId",
    ],
  } as TableOptions<{}>["initialState"],
  data: {
    __linkedData: {
      entityTypeId: "Person",
      aggregate: {
        itemsPerPage: 3,
        sort: {
          field: "name",
        },
      },
    } as BlockProtocolLinkedDataDefinition,
    data: [] as Person[],
  },
  entityId: "table1",
};

export const entities = [...people, HASH, london];
