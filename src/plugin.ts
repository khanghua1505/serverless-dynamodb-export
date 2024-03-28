import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import Serverless from 'serverless';
import Plugin from 'serverless/classes/Plugin';

import {describeTable} from './dynamodb';
import {setServerless} from './serverless';
import {logicalName} from './utils';

interface DynamodbExport {
  readonly tableName: string;
  readonly params: {
    [key: string]: string;
  };
}

class ServerlessDynamoDbOutputs implements Plugin {
  private readonly serverless: Serverless;
  private readonly log: Plugin.Logging['log'];

  hooks = {
    'package:initialize': this.beforePackage.bind(this),
  };

  constructor(serverless: Serverless, _options: any, {log}: Plugin.Logging) {
    this.serverless = serverless;
    this.log = log;
    setServerless(serverless);

    this.serverless.configSchemaHandler.defineCustomProperties({
      type: 'object',
      properties: {
        dynamodbExport: {
          type: 'object',
          properties: {
            tableName: {type: 'string'},
            params: {
              anyOf: [
                {
                  type: 'object',
                  additionalProperties: {
                    type: 'string',
                  },
                },
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      hashKey: {type: 'string'},
                      rangeKey: {type: 'string'},
                      value: {type: 'string'},
                    },
                    required: ['hashKey', 'value'],
                  },
                },
              ],
            },
          },
          required: ['tableName'],
        },
      },
    });
  }

  async beforePackage() {
    const exports = this.serverless.service.custom
      ?.dynamodbExport as DynamodbExport;
    if (!exports) {
      this.log.debug('no exports');
      return;
    }
    const {tableName, params} = exports;
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate;

    const {
      functionLogicalID: customResourceLogicalId,
      resources: customResources,
    } = this.createPutVariableLambdaFunctionResource();
    template.Resources = {
      ...template.Resources,
      ...customResources,
    };

    const table = await describeTable(tableName);
    if (Array.isArray(params)) {
      for (const param of params) {
        if (!param.hashKey || !param.value) {
          this.log.error(`invalid schema ${JSON.stringify(param)}`);
          continue;
        }
        if (table.keySchema.rangeKey && !param.rangeKey) {
          throw new Error(
            `Invalid table key schema. The range key "${table.keySchema.rangeKey}" doesn't provided in serverless config"`
          );
        }
        const logicalId =
          'DynamoDbOutputVariable' +
          logicalName(param.hashKey) +
          (param?.rangeKey ? logicalName(param.rangeKey) : '');
        template.Resources[logicalId] = {
          Type: 'Custom::DynamoDbOutputVariable',
          DependsOn: customResourceLogicalId,
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [customResourceLogicalId, 'Arn'],
            },
            TableName: tableName,
            HashKey: table.keySchema.hashKey,
            RangeKey: table.keySchema.rangeKey,
            Item: {
              [table.keySchema.hashKey]: param.hashKey,
              ...(table.keySchema.rangeKey
                ? {
                    [table.keySchema.rangeKey]: param.rangeKey,
                  }
                : {}),
              value: param.value,
            },
          },
        };
      }
      return;
    }
    if (typeof params === 'object') {
      for (const [name, value] of Object.entries(params)) {
        const logicalId = 'DynamoDbOutputVariable' + logicalName(name);
        template.Resources[logicalId] = {
          Type: 'Custom::DynamoDbOutputVariable',
          DependsOn: customResourceLogicalId,
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [customResourceLogicalId, 'Arn'],
            },
            TableName: tableName,
            HashKey: table.keySchema.hashKey,
            RangeKey: table.keySchema.rangeKey,
            Item: {
              [table.keySchema.hashKey]: name,
              ...(table.keySchema.rangeKey
                ? {
                    [table.keySchema.rangeKey]: name,
                  }
                : {}),
              value,
            },
          },
        };
      }
    }
  }

  private createPutVariableLambdaFunctionResource() {
    const entryPoint = '../assets/put-variable';
    const distFile = path.join(
      __dirname,
      `${this.serverless.utils.generateShortId(10)}.js`
    );
    esbuild.buildSync({
      entryPoints: [entryPoint],
      bundle: true,
      packages: 'external',
      platform: 'node',
      outfile: distFile,
    });
    const code = fs.readFileSync(distFile, {encoding: 'utf-8'});
    fs.rmSync(distFile);

    const functionLogicalID = 'CustomResourcePutVariableLambdaFunction';
    const result = {
      functionLogicalID,
      resources: {
        CustomResourcePutVariableLambdaRole: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: {
                    Service: 'lambda.amazonaws.com',
                  },
                  Action: 'sts:AssumeRole',
                },
              ],
            },
            Policies: [
              {
                PolicyName: 'default',
                PolicyDocument: {
                  Version: '2012-10-17',
                  Statement: [
                    {
                      Effect: 'Allow',
                      Action: [
                        'logs:CreateLogGroup',
                        'logs:CreateLogStream',
                        'logs:PutLogEvents',
                      ],
                      Resource: '*',
                    },
                    {
                      Effect: 'Allow',
                      Action: [
                        'dynamodb:PutItem',
                        'dynamodb:DescribeTable',
                        'dynamodb:DeleteItem',
                      ],
                      Resource: ['arn:aws:dynamodb:*:*:table/*'],
                    },
                  ],
                },
              },
            ],
          },
        },
        [functionLogicalID]: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Handler: 'index.handler',
            Runtime: 'nodejs18.x',
            Role: {
              'Fn::GetAtt': ['CustomResourcePutVariableLambdaRole', 'Arn'],
            },
            MemorySize: 128,
            Code: {
              ZipFile: code,
            },
          },
        },
      },
    };
    return result;
  }
}

export default ServerlessDynamoDbOutputs;
