import { eventType } from "./constants";

interface PostBase {
	uuid: string;
}

type EventType = (typeof eventType)[keyof typeof eventType];

interface PostDeleted extends PostBase {
	eventType: typeof eventType.postDeleted;
}

interface PostCreated extends PostBase {
	eventType: typeof eventType.postCreated;
	post: {
		id: string;
		publication: {
			id: string;
		};
		publishedAt: string;
		updatedAt: string;
		title: string;
		subtitle: string;
		brief: string;
		content: {
			markdown: string;
		};
	};
}

interface PostUpdated extends PostBase {
	eventType: typeof eventType.postUpdated;
	post: {
		id: string;
		publication: {
			id: string;
		};
		publishedAt: string;
		updatedAt: string;
		title: string;
		subtitle: string;
		brief: string;
		content: {
			markdown: string;
		};
	};
}

type PostEvent = PostDeleted | PostCreated | PostUpdated;

export type {
	PostEvent,
	PostBase,
	PostDeleted,
	PostCreated,
	PostUpdated,
	EventType,
	eventType,
};
