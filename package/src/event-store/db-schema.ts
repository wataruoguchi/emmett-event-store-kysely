// Minimal Kysely schema for the event store tables used by this package

export interface MessagesTable {
  message_id: string;
  stream_id: string;
  stream_position: string; // stored as text/numeric in DB, handle as string here
  partition: string;
  message_type: string;
  message_kind: string;
  message_data: unknown; // JSON
  message_metadata: unknown; // JSON
  message_schema_version: string;
  global_position: string | number | bigint | null;
  is_archived: boolean;
}

export interface StreamsTable {
  stream_id: string;
  stream_position: string;
  partition: string;
  stream_type: string;
  stream_metadata: unknown; // JSON
  is_archived: boolean;
}

export interface SubscriptionsTable {
  subscription_id: string;
  partition: string;
  version: number;
  last_processed_position: string; // stored as string
  is_archived: boolean;
}

export interface EventStoreDBSchema {
  messages: MessagesTable;
  streams: StreamsTable;
  subscriptions: SubscriptionsTable;
}
