const {send, SUCCESS, FAILED} = require('./cfn-response');
const {putParameter, deleteParameter} = require('./dynamodb');

exports.handler = (event, context) => {
  handle(event)
    .then(result => {
      const {physicalResourceId, status} = result;
      send(event, context, status, {}, physicalResourceId);
    })
    .catch(err => {
      console.error('error', err);
      send(event, context, FAILED, {});
    });
};

async function handle(event) {
  const {
    TableName: tableName,
    HashKey: hashKey,
    RangeKey: rangeKey,
    Item: item,
  } = event.ResourceProperties || {};
  const physicalResourceId = tableName;
  console.log('ResourceProperties ', event.ResourceProperties);
  if (!tableName || !hashKey || !item) {
    return {
      physicalResourceId,
      status: FAILED,
    };
  }
  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    await putParameter(tableName, item);
  }
  if (event.RequestType === 'Delete') {
    await deleteParameter(tableName, hashKey, rangeKey, item);
  }
  return {
    physicalResourceId,
    status: SUCCESS,
  };
}
