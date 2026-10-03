import { environment as dev } from '../../environments/environment';
import { environment as prod } from '../../environments/environment.prod';
import { environment as staging } from '../../environments/environment.staging';

/**
 * Issue #49 (phase 1): every build is version-stamped. CI rewrites the
 * placeholder below into the computed stamp (deploy/version.sh — semver
 * derived from the last v* git tag, pre-release counter, UTC timestamp, short
 * SHA) before building. A build without stamping (local dev) keeps the
 * placeholder, so the contract asserted here is shape, not a specific value.
 */
const STAMP_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.\-]+)?(\+[0-9A-Za-z.\-]+)?$/;

describe('environment version stamp', () => {
  const variants: [string, typeof dev][] = [
    ['dev', dev],
    ['prod', prod],
    ['staging', staging],
  ];

  it.each(variants)('%s environment carries a semver-shaped version', (_name, env) => {
    expect(typeof env.version).toBe('string');
    expect(env.version).toMatch(STAMP_PATTERN);
  });

  it.each(variants)('%s environment declares the version field alongside the others', (_name, env) => {
    expect(Object.keys(env)).toEqual(
      expect.arrayContaining(['production', 'googleClientId', 'apiBaseUrl', 'version']),
    );
  });
});
