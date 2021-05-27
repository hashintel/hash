const { buildSchema } = require('graphql');
const { readFileSync } = require('fs');

module.exports = function(schemaString, config) {
  // Your logic for loading your GraphQLSchema
  console.log({ schemaString, config })
  return buildSchema(readFileSync(schemaString, { encoding: 'utf-8' }));
};