import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import Serverless from 'serverless';
import Plugin from 'serverless/classes/Plugin';

import {logicalName} from './utils';

interface DynamoDbExports {
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
  }

  async beforePackage() {
    const exports = this.serverless.service.custom[
      'dynamoDbExports'
    ] as DynamoDbExports;
    if (!exports) {
      this.log.debug('no exports');
      return;
    }
    const {tableName, params} = exports;
    const template =
      this.serverless.service.provider.compiledCloudFormationTemplate;

    template.Resources = {
      ...template.Resources,
      ...this.createPutVariableLambdaFunctionResource(),
    };

    for (const [name, value] of Object.entries(params || {})) {
      const logicalId = 'DynamoDbOutputVariable' + logicalName(name);
      template.Resources[logicalId] = {
        Type: 'Custom::DynamoDbOutputVariable',
        DependsOn: 'CustomResourcePutVariableLambdaFunction',
        Properties: {
          ServiceToken: {
            'Fn::GetAtt': ['CustomResourcePutVariableLambdaFunction', 'Arn'],
          },
          TableName: tableName,
          Name: name,
          Value: value,
        },
      };
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

    // Clean up temporary file
    fs.rmSync(distFile);

    return {
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
      CustomResourcePutVariableLambdaFunction: {
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
    };
  }
}

export default ServerlessDynamoDbOutputs;
