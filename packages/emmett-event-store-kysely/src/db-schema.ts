// Use the example project's database schema which includes the event store tables
// This makes the package compatible with any database that includes these tables

export interface MessagesTable {
  created: Date;
  global_position: bigint | null;
  is_archived: boolean;
  message_data: unknown; // JSON
  message_id: string;
  message_kind: string;
  message_metadata: unknown; // JSON
  message_schema_version: string;
  message_type: string;
  partition: string;
  stream_id: string;
  stream_position: bigint;
}

export interface StreamsTable {
  is_archived: boolean;
  partition: string;
  stream_id: string;
  stream_metadata: unknown; // JSON
  stream_position: bigint;
  stream_type: string;
}

export interface SubscriptionsTable {
  last_processed_position: bigint;
  partition: string;
  subscription_id: string;
  version: number;
}

export interface EventStoreDBSchema {
  messages: MessagesTable;
  streams: StreamsTable;
  subscriptions: SubscriptionsTable;
}
