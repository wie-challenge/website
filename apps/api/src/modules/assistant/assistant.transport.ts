import { connect } from 'amqplib';
import { assistantEventSchema, type AssistantEvent } from '@nasj/contracts';

export const ASSISTANT_QUEUE = 'nasouj.chat.v1';
export const queueOptions = {
  durable: false,
  arguments: { 'x-message-ttl': 60000, 'x-max-length': 100, 'x-overflow': 'reject-publish' },
};

export function decodeAssistantEvent(
  body: Buffer,
  correlationId: unknown,
  requestId: string,
): AssistantEvent | null {
  if (correlationId !== requestId) return null;
  if (body.length > 20000) throw new Error('Oversized event');
  const event = assistantEventSchema.parse(JSON.parse(body.toString('utf8')));
  return event.requestId === requestId ? event : null;
}

// A reply queue belongs to one HTTP request. No browser-supplied routing or identity is accepted.
export async function openAssistantTransport(url: string, signal: AbortSignal) {
  const connection = await connect(url, { timeout: 5000 });
  connection.on('error', () => {}); // Never log broker URLs/credentials.
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener('abort', aborted);
    await connection.close().catch(() => {});
  };
  const aborted = () => {
    void close();
  };
  signal.addEventListener('abort', aborted, { once: true });
  try {
    signal.throwIfAborted();
    const channel = await connection.createConfirmChannel();
    channel.on('error', () => {});
    await channel.assertQueue(ASSISTANT_QUEUE, queueOptions);
    const reply = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
      durable: false,
    });
    return {
      close,
      async start(
        requestId: string,
        body: unknown,
        event: (event: AssistantEvent) => void,
        failed: () => void,
      ) {
        connection.once('close', () => {
          if (!closed) failed();
        });
        channel.once('close', () => {
          if (!closed) failed();
        });
        await channel.consume(
          reply.queue,
          (message) => {
            if (!message) {
              failed();
              return;
            }
            try {
              const parsed = decodeAssistantEvent(
                message.content,
                message.properties.correlationId,
                requestId,
              );
              if (parsed) event(parsed);
            } catch {
              failed();
            }
          },
          { noAck: true },
        );
        channel.sendToQueue(ASSISTANT_QUEUE, Buffer.from(JSON.stringify(body)), {
          correlationId: requestId,
          replyTo: reply.queue,
          contentType: 'application/json',
          expiration: '60000',
          persistent: false,
        });
        await channel.waitForConfirms();
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
