/** QueueClient — MVP bez brokera; implementacija kad se pojavi prvi potrošač (pg_notify / CF Queues). */
export type MessageHandler = (message: unknown) => Promise<void>;
export type Unsubscribe = () => Promise<void>;

export interface QueueClient {
  publish(topic: string, message: unknown): Promise<void>;
  subscribe(topic: string, handler: MessageHandler): Promise<Unsubscribe>;
}
