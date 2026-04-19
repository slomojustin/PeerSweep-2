import { assertEquals, assertExists, assertStrictEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  extractPeerRunIds,
  parsePeerRunResult,
  mergeMarketIntelResults,
  hasUsableMarketIntelData,
  type PeerRunResult,
} from '../poll-agent-runs/market-intel-helpers.ts';

// ── extractPeerRunIds ─────────────────────────────────────────────────────────

Deno.test('extractPeerRunIds: returns ids from valid _runIds.peers', () => {
  const metrics = { _peerRssds: ['111'], _runIds: { peers: ['run_a', 'run_b'] } };
  const ids = extractPeerRunIds(metrics);
  assertEquals(ids, ['run_a', 'run_b']);
});

Deno.test('extractPeerRunIds: returns null when _runIds is absent', () => {
  assertEquals(extractPeerRunIds({ _peerRssds: ['111'] }), null);
});

Deno.test('extractPeerRunIds: returns null when peers array is empty', () => {
  assertEquals(extractPeerRunIds({ _runIds: { peers: [] } }), null);
});

Deno.test('extractPeerRunIds: returns null for non-object input', () => {
  assertEquals(extractPeerRunIds(null), null);
  assertEquals(extractPeerRunIds('string'), null);
});

// ── parsePeerRunResult ────────────────────────────────────────────────────────

const sampleRates = [{ bankName: 'Bank A', product: '12-Month CD', rate: 4.5, source: 'banka.com' }];
const sampleNews = [{ bankName: 'Bank A', headline: 'Rate increase', source: 'News', url: 'https://x.com', date: '2026-01-01', summary: 'Summary' }];
const sampleSocial = [{ bankName: 'Bank A', platform: 'LinkedIn', profileUrl: 'https://li.com', followers: 1000, recentPromo: null, lastPostDate: null }];

Deno.test('parsePeerRunResult: parses result as plain object', () => {
  const runData = { result: { peerBankRates: sampleRates, localNews: sampleNews, socialMedia: sampleSocial } };
  const result = parsePeerRunResult(runData);
  assertExists(result);
  assertEquals(result.peerBankRates, sampleRates);
  assertEquals(result.localNews, sampleNews);
  assertEquals(result.socialMedia, sampleSocial);
});

Deno.test('parsePeerRunResult: parses result as JSON string', () => {
  const payload = { peerBankRates: sampleRates, localNews: [], socialMedia: sampleSocial };
  const runData = { result: JSON.stringify(payload) };
  const result = parsePeerRunResult(runData);
  assertExists(result);
  assertEquals(result.peerBankRates, sampleRates);
});

Deno.test('parsePeerRunResult: strips markdown code fences', () => {
  const payload = { peerBankRates: sampleRates, localNews: [], socialMedia: [] };
  const runData = { result: '```json\n' + JSON.stringify(payload) + '\n```' };
  const result = parsePeerRunResult(runData);
  assertExists(result);
  assertEquals(result.peerBankRates, sampleRates);
});

Deno.test('parsePeerRunResult: returns null when all arrays are empty', () => {
  const runData = { result: { peerBankRates: [], localNews: [], socialMedia: [] } };
  assertEquals(parsePeerRunResult(runData), null);
});

Deno.test('parsePeerRunResult: returns null when result is absent', () => {
  assertEquals(parsePeerRunResult({}), null);
  assertEquals(parsePeerRunResult({ result: null }), null);
});

Deno.test('parsePeerRunResult: returns null for unparseable string', () => {
  assertEquals(parsePeerRunResult({ result: 'not json at all' }), null);
});

// ── mergeMarketIntelResults ───────────────────────────────────────────────────

Deno.test('mergeMarketIntelResults: concatenates arrays from two successful peer results', () => {
  const r1: PeerRunResult = { peerBankRates: [{ bank: 'A' }], localNews: [{ h: '1' }], socialMedia: [] };
  const r2: PeerRunResult = { peerBankRates: [{ bank: 'B' }], localNews: [{ h: '2' }], socialMedia: [{ p: 'LinkedIn' }] };
  const merged = mergeMarketIntelResults([r1, r2]);
  assertEquals(merged.peerBankRates.length, 2);
  assertEquals(merged.localNews.length, 2);
  assertEquals(merged.socialMedia.length, 1);
});

Deno.test('mergeMarketIntelResults: mixed success/failure — only successful results appear', () => {
  // Simulate: run 1 succeeded, run 2 failed (parsePeerRunResult returned null, so not added)
  const r1: PeerRunResult = { peerBankRates: [{ bank: 'A' }], localNews: [], socialMedia: [] };
  const merged = mergeMarketIntelResults([r1]); // only r1 passed; failed run excluded by caller
  assertEquals(merged.peerBankRates.length, 1);
  assertEquals(merged.localNews.length, 0);
});

Deno.test('mergeMarketIntelResults: returns empty arrays when given no results', () => {
  const merged = mergeMarketIntelResults([]);
  assertEquals(merged.peerBankRates, []);
  assertEquals(merged.localNews, []);
  assertEquals(merged.socialMedia, []);
});

// ── hasUsableMarketIntelData ──────────────────────────────────────────────────

Deno.test('hasUsableMarketIntelData: returns true when any array is non-empty', () => {
  assertEquals(hasUsableMarketIntelData({ peerBankRates: [{}], localNews: [], socialMedia: [] }), true);
  assertEquals(hasUsableMarketIntelData({ peerBankRates: [], localNews: [{}], socialMedia: [] }), true);
  assertEquals(hasUsableMarketIntelData({ peerBankRates: [], localNews: [], socialMedia: [{}] }), true);
});

Deno.test('hasUsableMarketIntelData: returns false when all runs failed (all arrays empty)', () => {
  assertEquals(hasUsableMarketIntelData({ peerBankRates: [], localNews: [], socialMedia: [] }), false);
});
