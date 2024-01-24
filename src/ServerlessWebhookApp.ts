import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { ServerlessWebhookAuthStack } from "./ServerlessWebhookAuthStack";
import { ServerlessWebhookApiStack } from "./ServerlessWebhookApiStack";

const app = new App();
const serverlessWebhookAuthStack = new ServerlessWebhookAuthStack(
  app,
  "ServerlessWebhookAuthStack",
  {
    env: {
      region: "us-east-1",
    },
  }
);
const serverlessWebhookApiStack = new ServerlessWebhookApiStack(
  app,
  "ServerlessWebhookApiStack",
  {}
);
serverlessWebhookApiStack.addDependency(serverlessWebhookAuthStack);
