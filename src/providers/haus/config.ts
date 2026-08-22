import type { Environment } from '../../config.js';
import { getEnvironment, readBooleanEnv, readIntegerEnv, readStringEnv } from '../../config.js';
import { statePath } from '../../shared/state-paths.js';

export interface HausConfig {
  readonly enabled: boolean;
  readonly indexPath: string;
  /** Beyond this age a document's stated Stand is reported as questionable. */
  readonly staleAfterMonths: number;
}

/**
 * Disabled unless asked for, unlike every public provider here.
 *
 * The public sources answer the same question for everyone, so defaulting them
 * on costs nothing. A house corpus is meaningful only where its index exists,
 * and an empty index answering "nothing found" is worse than no tool at all —
 * it reads as "no rule exists". Off by default also keeps the shared HTTP
 * deployment unchanged when this branch eventually merges.
 */
export function readHausConfig(env: Environment = getEnvironment()): HausConfig {
  return {
    enabled: readBooleanEnv('GLMCP_HAUS_ENABLED', false, env),
    indexPath: readStringEnv('GLMCP_HAUS_INDEX', env) ?? statePath('haus', 'index.db'),
    staleAfterMonths: readIntegerEnv('GLMCP_HAUS_STALE_MONTHS', 24, { min: 1 }, env),
  };
}
