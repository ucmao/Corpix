import type { Config } from './config.js';
import { HttpClient } from './http.js';
import { sources, type Source, type Provider, type CompanyModules } from './types.js';
import { Tianyancha } from './providers/tianyancha.js';
import { Aiqicha } from './providers/aiqicha.js';
import { Qichacha } from './providers/qichacha.js';
import { Shuidi } from './providers/shuidi.js';
import { HttpQccTransport } from './qcc-http.js';

type Availability = 'inline' | 'index' | 'not_returned';
interface SourceDefinition {
  create(http: HttpClient, config: Config): Provider;
  configured(config: Config): boolean;
  liveVerified(config: Config): boolean;
  modules: Record<keyof CompanyModules | 'basic', Availability>;
}
const absent = { basic: 'inline', shareholders: 'not_returned', people: 'not_returned', investments: 'not_returned',
  branches: 'not_returned', changes: 'not_returned', annualReports: 'not_returned' } as const;
export const sourceDefinitions: Record<Source, SourceDefinition> = {
  tianyancha: {
    create: (http, c) => new Tianyancha(http, c.tycCookie), configured: () => true,
    liveVerified: () => true, modules: { ...absent }
  },
  qichacha: {
    create: (http, c) => new Qichacha(new HttpQccTransport(http, c.qccCookie)), configured: c => Boolean(c.qccCookie),
    liveVerified: () => true, modules: { ...absent, shareholders: 'inline', people: 'inline', branches: 'inline' }
  },
  aiqicha: {
    create: (http, c) => new Aiqicha(http, c.aqcCookie), configured: c => Boolean(c.aqcCookie),
    liveVerified: () => true, modules: { ...absent, shareholders: 'inline', people: 'inline', branches: 'inline', annualReports: 'index' }
  },
  shuidi: {
    create: (http, c) => new Shuidi(http, c.shuidiCookie), configured: () => true,
    liveVerified: () => true, modules: { ...absent, shareholders: 'inline', people: 'inline', branches: 'inline', annualReports: 'index', changes: 'inline' }
  }
};
export function createProviders(http: HttpClient, config: Config): Record<Source, Provider> {
  return Object.fromEntries(sources.map(source => [source, sourceDefinitions[source].create(http, config)])) as Record<Source, Provider>;
}
export function describeSources(config: Config) {
  return sources.map(source => {
    const d = sourceDefinitions[source], verified = d.liveVerified(config);
    return { source, search: true, detail: true, mode: 'http' as const, configured: d.configured(config),
      liveVerified: verified, ...(verified ? { lastVerifiedAt: '2026-11-19' } : {}), modules: d.modules };
  });
}
