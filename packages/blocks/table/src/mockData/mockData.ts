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
  url: "https://example.org",
  locationId: "place1",
  entityId: "c1",
  type: "Company",
};

const company2: Company = {
  name: "Example Company #2",
  url: "https://example.net",
  locationId: "place2",
  entityId: "c2",
  type: "Company",
};

const people: Person[] = [
  {
    email: "a@example.org",
    employerId: "c1",
    entityId: "1",
    name: "Alice Alison",
    type: "Person",
  },
  {
    email: "b@example.org",
    employerId: "c1",
    entityId: "2",
    name: "Bob Bobson",
    type: "Person",
  },
  {
    email: "c@example.org",
    employerId: "c1",
    entityId: "3",
    name: "Charlie Charlson",
    type: "Person",
  },
  {
    email: "d@example.org",
    employerId: "c1",
    entityId: "4",
    name: "David Davidson",
    type: "Person",
  },
  {
    email: "e@example.org",
    employerId: "c1",
    entityId: "5",
    name: "Eve Everson",
    type: "Person",
  },
  {
    email: "f@example.org",
    employerId: "c1",
    entityId: "6",
    name: "Frances Franceson",
    type: "Person",
  },
  {
    email: "g@example.org",
    employerId: "c1",
    entityId: "7",
    name: "George Georgeson",
    type: "Person",
  },
  {
    email: "h@example.org",
    employerId: "c1",
    entityId: "8",
    name: "Harriet Harrisson",
    type: "Person",
  },
];

export const initialTableData = {
  data: {
    __linkedData: {
      aggregate: {
        itemsPerPage: 5,
        entityTypeId: "d399c523-e152-49ed-81a4-56d9e17196bb",
        pageNumber: 1,
        pageCount: 1,
      },
      entityTypeId: "d399c523-e152-49ed-81a4-56d9e17196bb",
    },
    data: [
      {
        entityId: "1",
        name: "Alice",
        email: "alice@example.com",
        age: 42,
        country: "England",
      },
      {
        entityId: "2",
        name: "Bob",
        email: "bob@example.com",
        age: 34,
        country: "France",
      },
      {
        entityId: "3",
        name: "David",
        email: "david@example.com",
        age: 24,
        country: "Denmark",
      },
      {
        entityId: "4",
        name: "Eric",
        email: "eric@example.com",
        age: 59,
        country: "Iceland",
      },
    ],
  },
  initialState: {
    columns: [
      {
        Header: "entityId",
        accessor: "entityId",
      },
      {
        Header: "email",
        accessor: "email",
      },
      {
        Header: "name",
        accessor: "name",
      },
      {
        Header: "age",
        accessor: "age",
      },
      {
        Header: "country",
        accessor: "country",
      },
    ],
  },
};

export const entities = [...people, company1, company2, london, newYork];
