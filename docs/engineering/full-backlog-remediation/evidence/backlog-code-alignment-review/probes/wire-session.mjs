// Audit-only adapter in disposable checkout. Each probe gets native PostgreSQL in a fresh container.
import {disposableDatabase} from '../support.ts';
import pg from 'pg';
export async function bootPostgres(){const d=await disposableDatabase();const client=new pg.Client({connectionString:d.url});await client.connect();return {client,connectionString:d.url,async close(){await client.end();await d.stop()}}}
export async function assertWire(env){return (await env.client.query('select version()')).rows}
