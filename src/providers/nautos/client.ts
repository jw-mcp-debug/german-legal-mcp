import axios, { type AxiosInstance } from 'axios';
import { nautosConfig } from './config.js';
import { AuthenticationError, wrapAxiosError } from '../../shared/errors.js';

// --- Types ---

export interface SearchResult {
  acCode: string;
  documentNumber: string;
  title: string;
  titleEn?: string;
  dateOfIssue: string;
  documentType: string[];
  score: number;
}

export interface DocumentDetail {
  acCode: string;
  documentNumber: string;
  titleDe: string;
  titleEn: string;
  dateOfIssue: string;
  valid: boolean;
  documentType: string[];
  classificationIcs: string[];
  din21Id?: string;
  format?: string;
}

export interface TocSection {
  id: string;
  label?: string;
  title: string;
  section?: TocSection[];
}

// --- JWT management ---

interface JwtSession {
  token: string;
  exp: number;
  userAccountId: string;
}

let session: JwtSession | null = null;

export interface NautosAuthenticationSnapshot {
  readonly authenticated: boolean;
  readonly expiresAt?: number;
}

export function getNautosAuthenticationSnapshot(): NautosAuthenticationSnapshot {
  if (!session || isExpired()) return { authenticated: false };
  return { authenticated: true, expiresAt: session.exp };
}

export async function refreshNautosAuthentication(): Promise<NautosAuthenticationSnapshot> {
  session = null;
  const refreshed = await login();
  return { authenticated: true, expiresAt: refreshed.exp };
}

export function clearNautosAuthentication(): void {
  session = null;
  viewerAuthCache.clear();
}

function isExpired(): boolean {
  if (!session) return true;
  return Date.now() / 1000 > session.exp - 300; // 5min buffer
}

function parseSession(data: Record<string, unknown>): JwtSession {
  const token = data.token as string;
  const encodedPayload = token.split('.')[1];
  if (encodedPayload === undefined) throw new AuthenticationError('Invalid nautos JWT.');
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as {
    exp?: unknown;
  };
  return { token, exp: Number(payload.exp), userAccountId: (data.userAccountId as string) ?? '' };
}

let loginPromise: Promise<JwtSession> | null = null;

async function login(): Promise<JwtSession> {
  if (!isExpired()) return session!;
  if (loginPromise) return loginPromise;

  loginPromise = (async () => {
    const base = `${nautosConfig.baseUrl}/api/authentication`;

    // Try IP-based auth first (requires tenant key)
    if (nautosConfig.tenantKey) {
      try {
        const { data } = await axios.post<Record<string, unknown>>(`${base}/${nautosConfig.tenantKey}`, {}, {
          headers: { 'Content-Type': 'application/json' }, timeout: 15000,
        });
        if (data?.token) { session = parseSession(data); return session; }
      } catch { /* fall through to user-based */ }
    }

    // Fall back to user-based auth if credentials are configured
    if (nautosConfig.username && nautosConfig.password) {
      try {
        const { data } = await axios.post<Record<string, unknown>>(base, {
          username: nautosConfig.username,
          password: nautosConfig.password,
          tenantName: nautosConfig.tenantKey,
        }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
        if (data?.token) { session = parseSession(data); return session; }
      } catch { /* fall through to error */ }
    }

    const hints = [];
    if (!nautosConfig.tenantKey) hints.push('GLMCP_NAUTOS_TENANT_KEY is required');
    if (!nautosConfig.username) hints.push('set GLMCP_NAUTOS_USERNAME and GLMCP_NAUTOS_PASSWORD for user-based login');
    throw new AuthenticationError(
      `nautos: Authentication failed. ${hints.length ? hints.join('; ') + '.' : 'Check your IP range and credentials.'}`,
    );
  })().finally(() => {
    loginPromise = null;
  });

  return loginPromise;
}

// --- NV Viewer auth cache (in-memory, per din21Id) ---

interface ViewerAuth { xSHI: string; exp: number; }
const viewerAuthCache = new Map<string, ViewerAuth>();

function getCachedViewerAuth(din21Id: string): string | null {
  const cached = viewerAuthCache.get(din21Id);
  if (!cached || Date.now() / 1000 > cached.exp - 60) { viewerAuthCache.delete(din21Id); return null; }
  return cached.xSHI;
}

function parseJwtExp(jwt: string): number {
  try {
    const encodedPayload = jwt.split('.')[1];
    if (encodedPayload === undefined) return 0;
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' ? payload.exp : 0;
  }
  catch { return 0; }
}

/** Normalize TOC sections — API returns single object or array; recurse into children */
function normalizeSections(raw: unknown): TocSection[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((value: unknown) => {
    const s = value as Record<string, unknown>;
    const label = typeof s.label === 'string' ? s.label : undefined;
    return {
      id: typeof s.id === 'string' ? s.id : '',
      ...(label === undefined ? {} : { label }),
      title: (typeof s.title === 'string' ? s.title : '').replace(/\n/g, ' '),
      ...(s.section ? { section: normalizeSections(s.section) } : {}),
    };
  });
}

// --- Client ---

export class NautosClient {
  private apiClient = axios.create({
    baseURL: `${nautosConfig.baseUrl}/api/v1`,
    timeout: 30000,
  });

  private async api(): Promise<AxiosInstance> {
    const s = await login();
    this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${s.token}`;
    return this.apiClient;
  }

  private nv = axios.create({
    baseURL: `${nautosConfig.baseUrl}/api/nv/nv-rest`,
    timeout: 30000,
  });

  // --- Search & Metadata ---

  async search(documentNr: string, pageSize = 25): Promise<{ count: number; items: SearchResult[] }> {
    try {
      const api = await this.api();
      const { data } = await api.post(
        `/search?pageSize=${pageSize}&pageNumber=0&sortField=&sortDir=`,
        { documentNr, useDynamicSearch: false },
      );
      return {
        count: data.count ?? 0,
        items: (data.searchResultItems ?? []).map((r: Record<string, unknown>) => ({
          acCode: r.id as string,
          documentNumber: r.documentNumber as string,
          title: (r.titleDe || r.title) as string,
          titleEn: r.titleEn as string | undefined,
          dateOfIssue: r.dateOfIssue as string,
          documentType: r.documentType as string[],
          score: r.score as number,
        })),
      };
    } catch (e) { throw wrapAxiosError(e) ?? e; }
  }

  async getDetail(acCode: string): Promise<DocumentDetail> {
    try {
      const api = await this.api();
      const { data } = await api.get(`/detail/${acCode}`);
      let din21Id: string | undefined;
      let format: string | undefined;
      try {
        const s = await login();
        const { data: access } = await api.post('/documentaccess', { userId: s.userAccountId, acCodes: [acCode] });
        const ft = access?.[0]?.fulltexts?.[0];
        if (ft) { din21Id = ft.din21Id; format = ft.format; }
      } catch { /* non-fatal */ }
      return {
        acCode: data.id ?? acCode, documentNumber: data.documentNumber,
        titleDe: data.titleDe ?? '', titleEn: data.titleEn ?? '',
        dateOfIssue: data.dateOfIssue ?? '', valid: data.valid ?? false,
        documentType: data.documentType ?? [], classificationIcs: data.classificationIcs ?? [],
        ...(din21Id === undefined ? {} : { din21Id }),
        ...(format === undefined ? {} : { format }),
      };
    } catch (e) { throw wrapAxiosError(e) ?? e; }
  }

  // --- NV Viewer Auth Chain ---

  private authPending = new Map<string, Promise<string>>();

  private async authenticate(din21Id: string): Promise<string> {
    const cached = getCachedViewerAuth(din21Id);
    if (cached) return cached;
    // Serialize concurrent auth for same din21Id
    const pending = this.authPending.get(din21Id);
    if (pending) return pending;
    const p = this.doAuthenticate(din21Id).finally(() => this.authPending.delete(din21Id));
    this.authPending.set(din21Id, p);
    return p;
  }

  private async doAuthenticate(din21Id: string): Promise<string> {
    try {
      const api = await this.api();
      const { data: lockRaw } = await api.get(`/documentaccess/simultaneously/${din21Id}`);
      const lockId = String(lockRaw).replace(/"/g, '');
      const { data: octaRaw } = await api.get<unknown>('/octa/token', {
        params: { din21id: din21Id, lockId },
      });
      const octaToken = (
        typeof octaRaw === 'object'
        && octaRaw !== null
        && 'octaToken' in octaRaw
        && typeof octaRaw.octaToken === 'string'
      )
        ? octaRaw.octaToken
        : String(octaRaw).match(/:([A-F0-9]{64})/i)?.[1];
      if (!octaToken) throw new Error(`Invalid OCTA token format: ${JSON.stringify(octaRaw).slice(0, 80)}`);
      const { data: authData } = await this.nv.post<{ xSHISecurity?: unknown }>('/auth/user', {
        isFullscreen: false, token: octaToken, subuser: '',
        contextid: 'octa', lang: 'de', url: `${nautosConfig.baseUrl}/api/nv/nv-rest/`,
      });
      const xSHI = authData.xSHISecurity;
      if (typeof xSHI !== 'string') throw new Error('No xSHISecurity in NV auth response');
      viewerAuthCache.set(din21Id, { xSHI, exp: parseJwtExp(xSHI) });
      return xSHI;
    } catch (e) { throw wrapAxiosError(e) ?? e; }
  }

  // --- Document Content ---

  async getToc(din21Id: string): Promise<TocSection[]> {
    const xSHI = await this.authenticate(din21Id);
    try {
      const { data } = await this.nv.get(`/${din21Id}/toc`, {
        params: { lang: 'de' }, headers: { 'X-SHI-SECURITY': xSHI },
      });
      return normalizeSections(data?.body?.toc?.section);
    } catch (e) { throw wrapAxiosError(e) ?? e; }
  }

  async getSection(din21Id: string, sectionId: string): Promise<string> {
    const xSHI = await this.authenticate(din21Id);
    try {
      const { data } = await this.nv.get(`/${din21Id}/doc`, {
        params: { los: false, onlyBody: true, sectId: sectionId, lang: 'de', resolution: 2, unit: 'mm', marginalia: true },
        headers: { 'X-SHI-SECURITY': xSHI },
      });
      return data?.content ?? '';
    } catch (e) { throw wrapAxiosError(e) ?? e; }
  }
}
