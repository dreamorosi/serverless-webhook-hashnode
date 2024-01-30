import type { EventBridgeEvent } from "aws-lambda";
import { Logger } from "@aws-lambda-powertools/logger";
import type { EventType, PostEvent } from "./types";

const logger = new Logger({ logLevel: "DEBUG" });

export const handler = (event: EventBridgeEvent<EventType, PostEvent>) => {
	const eventType = event["detail-type"];
	logger.debug("Received event", { eventType, event });
};
