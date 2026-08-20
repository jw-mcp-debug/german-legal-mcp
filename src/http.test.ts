import { describe, expect, it, afterEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Server as HttpListener } from 'node:http';
import { ConfigurationError } from './config.js';
import { createMcpHttpListener, readHttpConfig } from './http.js';

describe('readHttpConfig', () => {
  it('stays on stdio unless HTTP mode is asked for', () => {
    // PORT alone must not flip the transport — CI runners set it routinely.
    expect(readHttpConfig({ PORT: '10000' })).toBeNull();
    expect(readHttpConfig({})).toBeNull();
  });

  it('refuses to open an endpoint without a token', () => {
    expect(() => readHttpConfig({ GLMCP_HTTP: 'true' })).toThrow(ConfigurationError);
    expect(() => readHttpConfig({ GLMCP_HTTP: 'true' })).toThrow(/GLMCP_HTTP_TOKEN is required/);
  });

  it('prefers the port the platform assigns', () => {
    expect(readHttpConfig({
      GLMCP_HTTP: 'true', GLMCP_HTTP_TOKEN: 't', PORT: '10000', GLMCP_HTTP_PORT: '3000',
    })).toEqual({ port: 10000, token: 't' });

    expect(readHttpConfig({ GLMCP_HTTP: 'true', GLMCP_HTTP_TOKEN: 't', GLMCP_HTTP_PORT: '8080' }))
      .toEqual({ port: 8080, token: 't' });
  });

  it('rejects a port that is not one', () => {
    expect(() => readHttpConfig({ GLMCP_HTTP: 'true', GLMCP_HTTP_TOKEN: 't', PORT: '70000' }))
      .toThrow(ConfigurationError);
  });
});

describe('createMcpHttpListener', () => {
  const listeners: HttpListener[] = [];
  afterEach(async () => {
    await Promise.all(listeners.splice(0).map((l) => new Promise((r) => l.close(r))));
  });

  async function serve(): Promise<string> {
    const listener = createMcpHttpListener(() => {
      const server = new Server({ name: 'test', version: '0' }, { capabilities: { tools: {} } });
      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
      return server;
    }, { port: 0, token: 'secret-token' });
    listeners.push(listener);
    await new Promise<void>((resolve) => listener.listen(0, resolve));
    const address = listener.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return `http://127.0.0.1:${address.port}`;
  }

  it('answers the health check without a token', async () => {
    const response = await fetch(`${await serve()}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('turns away a request with no token, a wrong token, or the wrong scheme', async () => {
    const base = await serve();
    const post = (headers: Record<string, string>) => fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}',
    });

    expect((await post({})).status).toBe(401);
    expect((await post({ Authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await post({ Authorization: 'Bearer secret-token-longer' })).status).toBe(401);
    expect((await post({ Authorization: 'Basic secret-token' })).status).toBe(401);
  });

  it('serves an initialize handshake to a caller holding the token', async () => {
    const response = await fetch(`${await serve()}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer secret-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"serverInfo"');
  });

  it('does not serve MCP anywhere but /mcp', async () => {
    const response = await fetch(`${await serve()}/`, { headers: { Authorization: 'Bearer secret-token' } });

    expect(response.status).toBe(404);
  });
});
