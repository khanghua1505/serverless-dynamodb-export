const {send, SUCCESS, FAILED} = require('./cfn-response');
const {putParameter, deleteParameter} = require('./dynamodb');

exports.handler = (event, context) => {
  const {
    TableName: tableName,
    Name: name,
    Value: value,
  } = event.ResourceProperties || {};
  console.log('ResourceProperties ', event.ResourceProperties);
  if (!tableName || !name || !value) {
    send(event, context, FAILED);
    return;
  }

  if (event.RequestType === 'Create' || event.RequestType === 'Update') {
    const physicalResourceId = `${tableName}:${name}`;
    putParameter(tableName, name, value)
      .then(() => send(event, context, SUCCESS, {}, physicalResourceId))
      .catch(err => {
        console.error('error', err);
        send(event, context, FAILED, {}, physicalResourceId);
      });
  }
  if (event.RequestType === 'Delete') {
    const physicalResourceId = `${tableName}:${name}`;
    deleteParameter(tableName, name, value)
      .then(() => send(event, context, SUCCESS, {}, physicalResourceId))
      .catch(err => {
        console.error('error', err);
        send(event, context, FAILED, {}, physicalResourceId);
      });
  }
};
