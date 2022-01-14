import { TableOptions } from "react-table";
import { BlockProtocolLinkedDataDefinition } from "blockprotocol";

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

const newYork: Location = {
  entityId: "place2",
  country: "US",
  name: "New York",
  type: "Location",
};

const company1: Company = {
  name: "Example Company",
  url: "https://example.com",
  locationId: "place1",
  entityId: "c1",
  type: "Company",
};

const company2: Company = {
  name: "Example Company #2",
  url: "https://another.example.com",
  locationId: "place2",
  entityId: "c2",
  type: "Company",
};

const people: Person[] = [
  {
    email: "alice@example.com",
    employerId: "c1",
    entityId: "1",
    name: "Alice Alison",
    type: "Person",
  },
  {
    email: "bob@example.com",
    employerId: "c1",
    entityId: "2",
    name: "Bob Bobson",
    type: "Person",
  },
  {
    email: "charlie@example.com",
    employerId: "c1",
    entityId: "3",
    name: "Charlie Charlson",
    type: "Person",
  },
  {
    email: "david@example.com",
    employerId: "c1",
    entityId: "4",
    name: "David Davidson",
    type: "Person",
  },
  {
    email: "eve@example.com",
    employerId: "c1",
    entityId: "5",
    name: "Eve Everson",
    type: "Person",
  },
  {
    email: "frances@example.com",
    employerId: "c1",
    entityId: "6",
    name: "Frances Franceson",
    type: "Person",
  },
  {
    email: "george@example.com",
    employerId: "c1",
    entityId: "7",
    name: "George Georgeson",
    type: "Person",
  },
  {
    email: "harriet@example.com",
    employerId: "c1",
    entityId: "8",
    name: "Harriet Harrisson",
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
      "employer.type",
      "employer.location.entityId",
      "employer.location.type",
    ],
  } as TableOptions<{}>["initialState"] & {
    columns?: { Header: string; accessor: string }[];
  },
  data: {
    __linkedData: {
      entityTypeId: "Person",
      aggregate: {
        itemsPerPage: 3,
        multiSort: [
          {
            field: "name",
          },
        ],
      },
    } as BlockProtocolLinkedDataDefinition,
    data: [] as Person[],
  },
  entityId: "table1",
};

export const entities = [...people, company1, company2, london, newYork];
