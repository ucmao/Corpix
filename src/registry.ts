import type { Config } from './config.js';
import { HttpClient } from './http.js';
import { sources, type Source, type Provider, type CompanyModules } from './types.js';
import { Tianyancha } from './providers/tianyancha.js';
import { Aiqicha } from './providers/aiqicha.js';
import { Qichacha } from './providers/qichacha.js';
import { BrowserQccTransport } from './cdp.js';
import { HttpQccTransport } from './qcc-http.js';

type Availability = 'inline' | 'index' | 'not_returned';
interface SourceDefinition {
  create(http: HttpClient, config: Config): Provider;
  mode(config: Config): 'http' | 'browser';
  configured(config: Config): boolean;
  liveVerified(config: Config): boolean;
  modules: Record<keyof CompanyModules | 'basic', Availability>;
}
export const qccMode = (config: Config) => config.qccMode ?? (config.qccCookie ? 'http' : config.qccCdpUrl ? 'browser' : 'http');
const absent = { basic: 'inline', shareholders: 'not_returned', people: 'not_returned', investments: 'not_returned',
  branches: 'not_returned', changes: 'not_returned', annualReports: 'not_returned' } as const;
export const sourceDefinitions: Record<Source, SourceDefinition> = {
  tianyancha: {
    create: (http, c) => new Tianyancha(http, c.tycCookie), mode: () => 'http', configured: () => true,
    liveVerified: () => true, modules: { ...absent }
  },
  qichacha: {
    create: (http, c) => new Qichacha(qccMode(c) === 'browser' ? new BrowserQccTransport(c.qccCdpUrl, c.timeoutMs, http) : new HttpQccTransport(http, c.qccCookie ?? '')),
    mode: qccMode, configured: c => Boolean(qccMode(c) === 'browser' ? c.qccCdpUrl : c.qccCookie),
    liveVerified: c => qccMode(c) === 'http', modules: { ...absent, shareholders: 'inline', people: 'inline', branches: 'inline' }
  },
  aiqicha: {
    create: (http, c) => new Aiqicha(http, c.aqcCookie), mode: () => 'http', configured: c => Boolean(c.aqcCookie),
    liveVerified: () => true, modules: { ...absent, shareholders: 'inline', people: 'inline', branches: 'inline', annualReports: 'index' }
  }
};
export function createProviders(http: HttpClient, config: Config): Record<Source, Provider> {
  return Object.fromEntries(sources.map(source => [source, sourceDefinitions[source].create(http, config)])) as Record<Source, Provider>;
}
export function describeSources(config: Config) {
  return sources.map(source => {
    const d = sourceDefinitions[source], verified = d.liveVerified(config);
    return { source, search: true, detail: true, mode: d.mode(config), configured: d.configured(config),
      liveVerified: verified, ...(verified ? { lastVerifiedAt: '2026-11-19' } : {}), modules: d.modules };
  });
}
