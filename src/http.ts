import { createServer as createHttpListener, type IncomingMessage, type ServerResponse, type Server as HttpListener } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ConfigurationError,
  getEnvironment,
  readBooleanEnv,
  readIntegerEnv,
  readStringEnv,
  type Environment,
} from './config.js';
import { rootLogger } from './shared/logger.js';

const logger = rootLogger.child({ module: 'http' });

/** Anything larger is a client error, not a tool call; MCP requests are small. */
const MAX_BODY_BYTES = 1024 * 1024;

export interface HttpConfig {
  readonly port: number;
  readonly token: string;
}

/**
 * HTTP mode is opt-in through `GLMCP_HTTP`, never inferred from `PORT` alone:
 * CI runners and countless hosts set `PORT`, and a server that quietly stopped
 * speaking stdio because of it would be a hard failure to diagnose. Once the
 * mode is on, `PORT` is honoured, which is what a platform like Render assigns.
 *
 * The token is mandatory. An MCP endpoint is a remote-control surface for
 * everything the server can reach, and here that is a set of public portals
 * whose robots.txt asks automated agents to stay away — running one open to the
 * internet would hand strangers those requests under this deployment's name.
 */
export function readHttpConfig(env: Environment = getEnvironment()): HttpConfig | null {
  if (!readBooleanEnv('GLMCP_HTTP', false, env)) return null;

  const token = readStringEnv('GLMCP_HTTP_TOKEN', env);
  if (!token) {
    throw new ConfigurationError([
      'GLMCP_HTTP_TOKEN is required when GLMCP_HTTP is true — an MCP endpoint without a bearer token is open to anyone who learns its URL',
    ]);
  }

  const port = readStringEnv('PORT', env) !== undefined
    ? readIntegerEnv('PORT', 3000, { min: 1, max: 65535 }, env)
    : readIntegerEnv('GLMCP_HTTP_PORT', 3000, { min: 1, max: 65535 }, env);

  return { port, token };
}

/** Constant-time, and length-safe: timingSafeEqual throws on a length mismatch. */
function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  return tokenMatches(header.slice('Bearer '.length).trim(), token);
}

function respond(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`);
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

/**
 * One transport, and one MCP server object, per request.
 *
 * The SDK pairs a server with a transport one-to-one, so a shared server cannot
 * serve concurrent HTTP requests. What is expensive is the provider registry —
 * its adapters hold the caches — and that stays a single instance behind
 * `createMcpServer`, which only registers handlers against it.
 */
async function handleMcpRequest(
  createMcpServer: () => Server,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const body = request.method === 'POST' ? await readJsonBody(request) : undefined;
  // No sessionIdGenerator means stateless, which is what the fresh transport per
  // request above is for; the SDK rejects a reused transport in that mode.
  const transport = new StreamableHTTPServerTransport({});
  const server = createMcpServer();

  response.on('close', () => {
    void transport.close();
    void server.close();
  });

  // The SDK declares this transport's onclose/onerror/onmessage as accessors of
  // type `T | undefined`, which `exactOptionalPropertyTypes` will not accept as
  // the optional properties of `Transport`. The object satisfies the interface
  // at runtime — StdioServerTransport differs only in how it declares them.
  await server.connect(transport as unknown as Parameters<Server['connect']>[0]);
  await transport.handleRequest(request, response, body);
}

export function createMcpHttpListener(
  createMcpServer: () => Server,
  config: HttpConfig,
): HttpListener {
  return createHttpListener((request, response) => {
    const path = (request.url ?? '/').split('?')[0];

    // Unauthenticated on purpose: the platform's health check has no token, and
    // this says nothing a caller could not learn by opening a TCP connection.
    if (path === '/healthz') {
      respond(response, 200, { status: 'ok' });
      return;
    }

    if (path !== '/mcp') {
      respond(response, 404, { error: 'not found', hint: 'MCP is served at POST /mcp' });
      return;
    }

    if (!isAuthorized(request, config.token)) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      respond(response, 401, { error: 'unauthorized' });
      return;
    }

    handleMcpRequest(createMcpServer, request, response).catch((error: unknown) => {
      logger.error('HTTP request failed', error as Error);
      if (!response.headersSent) respond(response, 400, { error: 'bad request' });
      else response.end();
    });
  });
}
