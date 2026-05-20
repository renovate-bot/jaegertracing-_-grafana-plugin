/**
 * Playwright e2e tests for the reverse-proxy deployment scenario.
 *
 * Runs against the Grafana instance in examples/reverse-proxy/ (port 18082),
 * which has two Jaeger datasources pointing at httpd reverse proxies:
 *   - jaeger-option1: transparent proxy + base_path configured
 *   - jaeger-option2: prefix stripping (base path auto-detected by UI since Jaeger 2.18.0)
 *
 * The Grafana in this stack has anonymous Admin auth enabled, so no login needed.
 * Datasource UIDs are stable (defined in examples/reverse-proxy/provisioning/datasources/datasources.yml).
 *
 * Run via: make test-reverse-proxy  (starts the stack, runs these tests, tears down)
 */

import { test, expect } from '@playwright/test';

// Datasource UIDs as provisioned in examples/reverse-proxy/provisioning/datasources/datasources.yml
const DATASOURCES = [
  {
    label: 'Option 1 (transparent proxy)',
    uid: 'jaeger-option1',
    name: 'Jaeger-Option1',
    expectedProxyURL: 'http://httpd1/jaeger/ui',
    expectedPublicURL: 'http://localhost:18080/jaeger/ui',
  },
  {
    label: 'Option 2 (prefix stripping)',
    uid: 'jaeger-option2',
    name: 'Jaeger-Option2',
    expectedProxyURL: 'http://httpd2/jaeger/ui',
    expectedPublicURL: 'http://localhost:18081/jaeger/ui',
  },
];

for (const ds of DATASOURCES) {
  test(`${ds.label}: /api/services returns data via public URL`, async ({ request }) => {
    const resp = await request.get(`${ds.expectedPublicURL}/api/services`);
    await expect(resp).toBeOK();
    const body = await resp.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test(`${ds.label}: /api/services returns data via Grafana DataProxy`, async ({ request }) => {
    const resp = await request.get(`/api/datasources/proxy/uid/${ds.uid}/api/services`);
    await expect(resp).toBeOK();
    const body = await resp.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test(`${ds.label}: datasource url (proxy) and publicUrl are provisioned correctly`, async ({ request }) => {
    const resp = await request.get(`/api/datasources/uid/${ds.uid}`);
    await expect(resp).toBeOK();
    const body = await resp.json();
    // url = internal address used by Grafana DataProxy for API calls
    expect(body.url).toBe(ds.expectedProxyURL);
    // jsonData.publicUrl = browser-accessible address used by the panel iframe
    expect(body.jsonData?.publicUrl).toBe(ds.expectedPublicURL);
  });

  test(`${ds.label}: datasource config page loads`, async ({ page }) => {
    // Provisioned datasources are read-only in the UI; verify the page loads for the correct datasource.
    await page.goto(`/connections/datasources/edit/${ds.uid}`);
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(ds.name, { timeout: 10000 });
  });
}
