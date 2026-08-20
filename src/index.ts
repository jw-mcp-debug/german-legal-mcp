#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import { formatToolCallError } from "./shared/errors.js";
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { rootLogger } from './shared/logger.js';
import { ConfigurationError } from './config.js';
import { PROVIDER_MANIFEST } from './provider-manifest.js';
import { ProviderRegistry } from './provider-registry.js';
import { looksLikeToolInvocation, runCli } from './cli.js';
import { createMcpHttpListener, readHttpConfig } from './http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Single source of truth for package metadata
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

/**
 * `node dist/index.js rii:search --query "..." --limit 5` calls the tool
 * directly and exits — no stdio transport, no MCP client. This must be
 * checked before --version/--help below: a tool name as argv[0] makes this
 * unambiguously CLI mode, including when the invocation itself asks for
 * --help (e.g. `rii:search --help`), which must print that tool's own
 * options, not the server's — a bare `process.argv.includes('--help')`
 * would otherwise match on that trailing flag and never reach runCli.
 */
if (looksLikeToolInvocation(process.argv.slice(2))) {
  const cliRegistry = new ProviderRegistry(PROVIDER_MANIFEST);
  await cliRegistry.load(({ provider, error }) => {
    rootLogger.warn(`Provider "${provider}" disabled: failed to load`, { error });
  });
  const exitCode = await runCli(process.argv.slice(2), cliRegistry);
  await cliRegistry.shutdown();
  process.exit(exitCode);
}

// Handle --version flag
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

// Handle --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  const helpRegistry = new ProviderRegistry(PROVIDER_MANIFEST);
  await helpRegistry.load();
  const helpTools = helpRegistry.getTools().map(({ name, description }) => ({
    name,
    description,
  }));
  await helpRegistry.shutdown();

  const maxName = Math.max(...helpTools.map(t => t.name.length));
  const toolLines = helpTools
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => `  ${t.name.padEnd(maxName + 2)}${t.description.split('.')[0]}.`)
    .join('\n');

  console.log(`
German Legal MCP Server v${pkg.version}

A Model Context Protocol server for German, Austrian and EU legal research.

USAGE:
  node dist/index.js [OPTIONS]

OPTIONS:
  -h, --help       Print this help message
  -v, --version    Print version number

TOOLS (${helpTools.length}):
${toolLines}

For more information, visit:
  https://github.com/metaneutrons/german-legal-mcp
`);
  process.exit(0);
}

const providerRegistry = new ProviderRegistry(PROVIDER_MANIFEST);

/**
 * A server object wired to the shared provider registry.
 *
 * stdio needs exactly one of these for the life of the process. HTTP needs one
 * per request, because the SDK pairs a server with a transport one-to-one — so
 * this is a factory rather than a singleton. Only the handler registrations are
 * per-server; the registry behind them, which holds the adapters and their
 * caches, is created once above.
 */
function createMcpServer(): Server {
  const server = new Server(
    {
      name: "german-legal-mcp",
      version: pkg.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = providerRegistry.getTools();
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: (tool.inputSchema as z.ZodTypeAny).toJSONSchema(),
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const requestId = uuidv4();
    const logger = rootLogger.child({ requestId });
    const { name, arguments: args } = request.params;
  
    logger.info('Tool call received', { tool: name });
    const startTime = Date.now();
  
    try {
      const result = await providerRegistry.handleToolCall(
        name,
        (args as Record<string, unknown>) || {},
      );
      const duration = Date.now() - startTime;
      logger.info('Tool call completed', { tool: name, duration });
    
      return {
        content: result.content,
        isError: result.isError,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Tool call failed', error as Error, { tool: name, duration });
      return {
        content: [{ type: 'text', text: formatToolCallError(error) }],
        isError: true,
      };
    }
  });

  return server;
}

// Graceful shutdown
let isShuttingDown = false;

async function cleanup(signal?: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  rootLogger.info('Shutdown initiated', { signal });

  const shutdownPromise = (async () => {
    try {
      await providerRegistry.shutdown();
      rootLogger.info('Cleanup complete');
    } catch (error) {
      rootLogger.error('Error during cleanup', { error });
    }
  })();

  const timeoutPromise = new Promise<void>((resolve) => {
    // eslint-disable-next-line no-undef
    setTimeout(() => {
      rootLogger.warn('Shutdown timeout reached, forcing exit');
      resolve();
    }, 30000);
  });

  await Promise.race([shutdownPromise, timeoutPromise]);
  process.exit(0);
}

// Surface fatal errors to stderr synchronously. The pino logger runs in a
// worker thread, so its buffered output can be lost when the process exits —
// a crash would otherwise leave the host (e.g. Claude Desktop) with no reason.
function fatal(context: string, error: unknown): never {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`[german-legal-mcp] FATAL: ${context}\n${detail}\n`);
  rootLogger.error(`Fatal: ${context}`, { error });
  process.exit(1);
}

process.on("uncaughtException", (error) => fatal("uncaught exception", error));
process.on("unhandledRejection", (reason) => fatal("unhandled rejection", reason));
process.on("SIGINT", () => cleanup("SIGINT"));
process.on("SIGTERM", () => cleanup("SIGTERM"));

// Read before any transport starts: the shutdown hooks differ by mode, and a
// misconfigured HTTP mode must fail here rather than after the providers load.
const httpConfig = readHttpConfig();

// A closed stdin means the host let go of the pipe — the end of the session for
// a stdio server, and nothing at all for an HTTP one, where a platform may hand
// the process a closed stdin from the start. Registering it unconditionally
// would shut the web service down as it came up.
if (!httpConfig) {
  process.stdin.on("close", () => cleanup("stdin close"));
}

// A provider that fails to load or is misconfigured disables ONLY itself (with a
// warning) — it never aborts the server, so the remaining providers stay usable.
await providerRegistry.load(({ provider, error }) => {
  if (error instanceof ConfigurationError) {
    rootLogger.warn(`Provider "${provider}" disabled: invalid configuration`, {
      issues: error.issues,
    });
  } else {
    rootLogger.warn(`Provider "${provider}" disabled: failed to load`, { error });
  }
});

const activeProviders = providerRegistry.getProviders();
rootLogger.info(
  `Active providers (${activeProviders.length}): ${activeProviders.map((p) => p.name).join(', ') || 'none'}`,
);

if (httpConfig) {
  const listener = createMcpHttpListener(createMcpServer, httpConfig);
  await new Promise<void>((resolve) => listener.listen(httpConfig.port, resolve));
  rootLogger.info('MCP server listening over HTTP', { port: httpConfig.port, path: '/mcp' });
} else {
  const transport = new StdioServerTransport();
  await createMcpServer().connect(transport);
  rootLogger.info('MCP server connected and ready');
}
