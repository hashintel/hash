import { TableOptions } from "react-table";

export interface Person {
  email: string;
  id: string;
  type: "Person";
  employerId: string;
  employer?: Company;
}

export interface Location {
  id: string;
  country: string;
  name: string;
  type: "Location";
}

export interface Company {
  id: string;
  name: string;
  url: string;
  locationId: string;
  location?: Location;
  type: "Company";
}

const london: Location = {
  id: "place1",
  country: "UK",
  name: "London",
  type: "Location",
};

const HASH: Company = {
  name: "HASH",
  url: "https://hash.ai",
  locationId: "place1",
  id: "c1",
  type: "Company",
};

const people: Person[] = [
  {
    email: "aj@hash.ai",
    employerId: "c1",
    id: "1",
    type: "Person",
  },
  {
    email: "c@hash.ai",
    employerId: "c1",
    id: "2",
    type: "Person",
  },
  {
    email: "d@hash.ai",
    employerId: "c1",
    id: "3",
    type: "Person",
  },
  {
    email: "ef@hash.ai",
    employerId: "c1",
    id: "4",
    type: "Person",
  },
  {
    email: "nh@hash.ai",
    employerId: "c1",
    id: "5",
    type: "Person",
  },
];

export const initialState: TableOptions<{}>["initialState"] = {
  hiddenColumns: [
    "id",
    "employerId",
    "employer.locationId",
    "employer.id",
    "employer.location.id",
  ],
};

export const entities = [...people, HASH, london];
