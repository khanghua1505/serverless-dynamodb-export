import {
  DescribeTableCommand,
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import {marshall} from '@aws-sdk/util-dynamodb';

import {useAWSClient} from './credentials';
import {VisibleError} from './errors';

interface TableProperties {
  readonly tableName: string;
  readonly keySchema: {
    readonly hashKey: string;
    readonly rangeKey?: string;
  };
}

async function describeTable(table: string): Promise<TableProperties> {
  const client = useAWSClient(DynamoDBClient);
  const input = new DescribeTableCommand({
    TableName: table,
  });
  const response = await client.send(input);
  if (!response.Table) {
    throw new VisibleError(`${table} resource not found`);
  }
  let hashKey = '';
  let rangeKey: string | undefined;
  for (const key of response.Table.KeySchema || []) {
    if (key.KeyType === 'HASH') {
      hashKey = key.AttributeName!;
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
      throw new VisibleError('hash key and range key must be a string');
    }
  }
  return {
    tableName: table,
    keySchema: {
      hashKey,
      rangeKey,
    },
  };
}

export async function putParameter(
  tableName: string,
  name: string,
  val: string
) {
  const client = useAWSClient(DynamoDBClient);
  const tb = await describeTable(tableName);
  const {hashKey, rangeKey} = tb.keySchema;

  const input = new PutItemCommand({
    TableName: name,
    Item: marshall({
      [hashKey]: name,
      ...(rangeKey ? {[rangeKey]: name} : {}),
      value: val,
    }),
  });
  await client.send(input);
}
