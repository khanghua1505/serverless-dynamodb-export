const {
  DescribeTableCommand,
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
} = require('@aws-sdk/client-dynamodb');
const {marshall} = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient();

async function describeTable(tableName) {
  const input = new DescribeTableCommand({
    TableName: tableName,
  });
  const response = await client.send(input);
  if (!response.Table) {
    throw new Error(`${tableName} resource not found`);
  }
  let hashKey;
  let rangeKey;
  for (const key of response.Table.KeySchema || []) {
    if (key.KeyType === 'HASH') {
      hashKey = key.AttributeName;
    }
    if (key.KeyType === 'RANGE') {
      rangeKey = key.AttributeName;
    }
  }
  for (const attr of response.Table.AttributeDefinitions || []) {
    if (
      (attr.AttributeName === hashKey || attr.AttributeName === rangeKey) &&
      attr.AttributeType !== 'S'
    ) {
      throw new Error('hash key and range key must be a string');
    }
  }
  return {
    tableName: tableName,
    keySchema: {
      hashKey,
      rangeKey,
    },
  };
}

async function putParameter(tableName, name, val) {
  const tb = await describeTable(tableName);
  const {hashKey, rangeKey} = tb.keySchema;
  const input = new PutItemCommand({
    TableName: tableName,
    Item: marshall({
      [hashKey]: name,
      value: val,
      ...(rangeKey ? {[rangeKey]: name} : {}),
    }),
  });
  await client.send(input);
}

async function deleteParameter(tableName, name) {
  const tb = await describeTable(tableName);
  const {hashKey, rangeKey} = tb.keySchema;
  const input = new DeleteItemCommand({
    TableName: tableName,
    Key: marshall({
      [hashKey]: name,
      ...(rangeKey ? {[rangeKey]: name} : {}),
    }),
  });
  await client.send(input);
}

module.exports = {
  putParameter,
  deleteParameter,
};
