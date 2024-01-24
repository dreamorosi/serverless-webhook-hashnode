import type {
  Context,
  LambdaFunctionURLEventWithIAMAuthorizer,
} from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import {
  makeIdempotent,
  IdempotencyConfig,
} from "@aws-lambda-powertools/idempotency";
import { DynamoDBPersistenceLayer } from "@aws-lambda-powertools/idempotency/dynamodb";
import { Client, gql, fetchExchange } from "@urql/core";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

const persistenceStore = new DynamoDBPersistenceLayer({
  tableName: process.env.IDEMPOTENCY_TABLE_NAME!,
});

const logger = new Logger({ logLevel: "DEBUG" });

const gqlClient = new Client({
  url: "https://gql.hashnode.com",
  exchanges: [fetchExchange],
});

const query = gql`
  query PostById($id: ID!) {
    post(id: $id) {
      id
      publication {
        id
      }
      publishedAt
      updatedAt
      title
      subtitle
      brief
      content {
        markdown
      }
    }
  }
`;

const eventBridgeClient = new EventBridgeClient({});
const eventBusName = process.env.EVENT_BUS_NAME!;

export const handler = makeIdempotent(
  async (event: LambdaFunctionURLEventWithIAMAuthorizer, context: Context) => {
    logger.addContext(context);

    const { body } = event;
    const payload = JSON.parse(body || "{}");

    // TODO handle delete post

    const {
      data: {
        post: { id },
      },
    } = payload;
    const { data, error } = await gqlClient.query(query, { id }).toPromise();

    if (error) {
      logger.error("error", { error });
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Error fetching post",
          error,
        }),
      };
    }

    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: eventBusName,
            Source: "serverlessWebhookApi",
            DetailType: payload.data.eventType,
            Detail: JSON.stringify({
              uuid: payload.metadata.uuid,
              post: data.post,
            }),
          },
        ],
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Hello from API",
        timestamp: Date.now(),
      }),
    };
  },
  {
    persistenceStore,
    config: new IdempotencyConfig({
      eventKeyJmesPath: "body",
      useLocalCache: true,
      maxLocalCacheSize: 100,
      expiresAfterSeconds: 60 * 60 * 2, // 2 hours
    }),
  }
);
