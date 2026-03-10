import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import { dipConfig } from './config.js';

class DipRateLimitError extends Error {
  constructor() {
    super('DIP API rate limit exceeded (Enodia challenge). Wait a few minutes and try again.');
    this.name = 'DipRateLimitError';
  }
}

function checkRateLimit(res: AxiosResponse): void {
  if (typeof res.data === 'string' && res.data.includes('Enodia')) {
    throw new DipRateLimitError();
  }
}

export interface DipSearchResult {
  numFound: number;
  documents: DipDocument[];
  cursor: string;
}

export interface DipDocument {
  id: string;
  titel: string;
  datum: string;
  dokumentnummer?: string;
  drucksachetyp?: string;
  dokumentart?: string;
  wahlperiode?: number;
  herausgeber?: string;
  aktualisiert?: string;
  text?: string;
  fundstelle?: {
    pdf_url?: string;
    dokumentnummer?: string;
    datum?: string;
    herausgeber?: string;
    urheber?: string[];
  };
  urheber?: Array<{ bezeichnung: string; titel: string }>;
  ressort?: Array<{ federfuehrend: boolean; titel: string }>;
  vorgangsbezug?: Array<{ id: string; titel: string; vorgangstyp: string }>;
  // Vorgang-specific
  beratungsstand?: string;
  vorgangstyp?: string;
  deskriptor?: Array<{ name: string; typ: string }>;
}

export class DipClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: dipConfig.baseUrl,
      params: { apikey: dipConfig.apiKey },
      timeout: 30000,
    });
    this.http.interceptors.response.use(res => { checkRateLimit(res); return res; });
  }

  async searchDrucksachen(params: Record<string, string | number>): Promise<DipSearchResult> {
    const { data } = await this.http.get<DipSearchResult>('/drucksache', { params });
    return data;
  }

  async searchDrucksachenText(params: Record<string, string | number>): Promise<DipSearchResult> {
    const { data } = await this.http.get<DipSearchResult>('/drucksache-text', { params });
    return data;
  }

  async searchVorgang(params: Record<string, string | number>): Promise<DipSearchResult> {
    const { data } = await this.http.get<DipSearchResult>('/vorgang', { params });
    return data;
  }

  async searchPlenarprotokollText(params: Record<string, string | number>): Promise<DipSearchResult> {
    const { data } = await this.http.get<DipSearchResult>('/plenarprotokoll-text', { params });
    return data;
  }

  async getDrucksache(id: string): Promise<DipDocument | null> {
    const { data } = await this.http.get<DipDocument>(`/drucksache/${id}`);
    return data;
  }
}
