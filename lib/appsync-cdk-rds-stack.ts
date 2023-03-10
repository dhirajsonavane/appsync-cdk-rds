import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as lambda from "@aws-cdk/aws-lambda";
import * as rds from "@aws-cdk/aws-rds";
import * as appsync from "@aws-cdk/aws-appsync";

export class AppsyncCdkRdsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create the AppSync API
    const api = new appsync.GraphqlApi(this, "Api", {
      name: "cdk-blog-appsync-api",
      schema: appsync.Schema.fromAsset("graphql/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(365)),
          },
        },
      },
    });

    const vpc = new ec2.Vpc(this, "BlogAppVPC");
    // Create the Serverless Aurora DB cluster; set the engine to Postgres
    const cluster = new rds.ServerlessCluster(this, "AuroraBlogCluster", {
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      parameterGroup: rds.ParameterGroup.fromParameterGroupName(
        this,
        "ParameterGroup",
        "default.aurora-postgresql10"
      ),
      defaultDatabaseName: "BlogDB",
      vpc,
      scaling: { autoPause: cdk.Duration.seconds(0) }, // Optional. If not set, then instance will pause after 5 minutes
    });

    const postFn = new lambda.Function(this, "MyFunction", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: new lambda.AssetCode("lambda-fns"),
      handler: "index.handler",
      memorySize: 1024,
      environment: {
        CLUSTER_ARN: cluster.clusterArn,
        SECRET_ARN: cluster.secret?.secretArn || "",
        DB_NAME: "BlogDB",
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      },
    });

    cluster.grantDataApiAccess(postFn);

    const lambdaDs = api.addLambdaDataSource("lambdaDatasource", postFn);

    lambdaDs.createResolver({
      typeName: "Query",
      fieldName: "listPosts",
    });
    lambdaDs.createResolver({
      typeName: "Query",
      fieldName: "getPostById",
    });
    lambdaDs.createResolver({
      typeName: "Mutation",
      fieldName: "createPost",
    });
    lambdaDs.createResolver({
      typeName: "Mutation",
      fieldName: "updatePost",
    });
    lambdaDs.createResolver({
      typeName: "Mutation",
      fieldName: "deletePost",
    });

    new cdk.CfnOutput(this, "AppSyncAPIURL", {
      value: api.graphqlUrl,
    });
    new cdk.CfnOutput(this, "AppSyncAPIKey", {
      value: api.apiKey || "",
    });
    new cdk.CfnOutput(this, "ProjectRegion", {
      value: this.region,
    });
  }
}
