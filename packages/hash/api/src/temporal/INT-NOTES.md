http://localhost:5001/graphql

```gql
# Write your query or mutation here
{
  me {
    memberOf {
      properties {
        responsibility
      }
      org {
        entityId
        integrations {
          integrationId
          integrationName
          enabled
          fields {
            fieldKey
            label
            required
            secret
            currentValue
            lastUpdatedAt
          }
        }
      }
    }
  }
}
```

```gql
mutation Create {
  createOrgIntegration(
    input: {
      organizationEntityId: "2ad2a937-43f4-4c38-ad54-4e34f0af2fc3"
      integrationName: "asana"
    }
  ) {
    integrationId
    integrationName
    enabled
    fields {
      fieldKey
      label
      required
      secret
      currentValue
      lastUpdatedAt
    }
  }
}
```
