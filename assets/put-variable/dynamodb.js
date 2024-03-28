const {
  DeleteItemCommand,
  DynamoDBClient,
  PutItemCommand,
} = require('@aws-sdk/client-dynamodb');
const {marshall} = require('@aws-sdk/util-dynamodb');

const client = new DynamoDBClient();

async function putParameter(tableName, item) {
  const input = new PutItemCommand({
    TableName: tableName,
    Item: marshall(item),
  });
  await client.send(input);
}

async function deleteParameter(tableName, hashKey, rangeKey, item) {
  const input = new DeleteItemCommand({
    TableName: tableName,
    Key: marshall({
      [hashKey]: item[hashKey],
      ...(rangeKey ? {[rangeKey]: item[rangeKey]} : {}),
    }),
  });
  await client.send(input);
}

module.exports = {
  putParameter,
  deleteParameter,
};
