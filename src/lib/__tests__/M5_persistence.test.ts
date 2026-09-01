import { describe, it, expect } from 'vitest';
import {
  MIN_MATCH_SCORE,
  buildReciprocalRow,
  buildSavedSearchRecord,
  buildBlindNotification,
  type MatchRow,
  type SavedSearchInput,
  type BlindNotificationInput,
} from '../M5_persistence';

describe('M5_persistence pure builders', () => {
  it('builds reciprocal row correctly', () => {
    const fwd: MatchRow = {
      proposal_id: 'NEW',
      matched_proposal_id: 'OLD',
      similarity_score: 0.7,
      industry_score: 1,
      financial_score: 0.5,
      geography_boost: 1,
      confidence_score: 0.5,
      final_score: 82,
      match_reason: 'describes OLD',
      match_archetype: 'Same-sector bolt-on',
      status: 'ACTIVE',
    };
    const rec = buildReciprocalRow(fwd, 'describes NEW');
    expect(rec.proposal_id).toBe('OLD');
    expect(rec.matched_proposal_id).toBe('NEW');
    expect(rec.final_score).toBe(82);
    expect(rec.similarity_score).toBe(0.7);
    expect(rec.industry_score).toBe(1);
    expect(rec.geography_boost).toBe(1);
    expect(rec.match_reason).toBe('describes NEW');
    expect(rec.status).toBe('ACTIVE');
    expect(buildReciprocalRow(fwd).match_reason).toBe('describes OLD');
  });

  it('builds saved search record correctly', () => {
    const ssIn: SavedSearchInput = {
      userId: 'u1',
      intent: 'BUY_SIDE',
      sector: 'saas',
      industry: 'vertical SaaS for clinics',
      geography: 'Mumbai',
      structure: 'Majority',
      sub_sector: 'digital health',
      deal_size_min: '20',
      deal_size_max: '100',
      revenue_min: '10',
      revenue_max: '50',
      special_conditions: ['x'],
    };
    const ss = buildSavedSearchRecord(ssIn, 'P1', [0.1, 0.2, 0.3], 3, true);
    expect(typeof ss.query_object).toBe('object');
    expect(ss.query_object).not.toBeNull();
    expect((ss.query_object as any).intent).toBe('BUY_SIDE');
    expect((ss.query_object as any).industry).toBe('vertical SaaS for clinics');
    expect((ss.query_object as any).deal_size_max_cr).toBe(100);
    expect(Array.isArray(ss.query_embedding) && ss.query_embedding.length === 3).toBe(true);
    expect(ss.min_score).toBe(60);
    expect(MIN_MATCH_SCORE).toBe(60);
    expect(ss.status).toBe('PENDING');
    expect(ss.sectors[0]).toBe('TECHNOLOGY');
    expect(ss.geographies[0]).toBe('Mumbai');
    expect(ss.match_count).toBe(3);
    expect(ss.match_attempt_count).toBe(1);
    expect(ss.no_match_reason).toBeNull();
    expect(ss.notification_status).toBe('SENT');

    const ss0 = buildSavedSearchRecord(ssIn, 'P1', [0.1], 0, false);
    expect(ss0.no_match_reason).toBe('NO_CANDIDATE_ABOVE_MIN_SCORE');
    expect(ss0.notification_status).toBe('NOT_SENT');
  });

  it('builds blind notification correctly', () => {
    const nIn: BlindNotificationInput = {
      oldUserId: 'old-user',
      subjectProposalId: 'OLDPROP',
      subjectRef: '#A1B2C3',
      subjectIntent: 'SELL_SIDE',
      subjectSector: 'MANUFACTURING',
      subjectGeography: 'Pune',
      matchId: 'M1',
      cpSectorLabel: 'TECHNOLOGY',
      cpGeographyLabel: 'Mumbai',
      finalScore: 82,
    };
    const n = buildBlindNotification(nIn);
    expect(n.user_id).toBe('old-user');
    expect(n.type).toBe('NEW_COUNTERPARTY');
    expect(n.is_read).toBe(false);
    expect(n.match_id).toBe('M1');
    expect(n.proposal_id).toBe('OLDPROP');
    expect(Array.isArray(n.delivery_channels) && n.delivery_channels.includes('in_app')).toBe(true);
    expect((n.metadata as any).blind).toBe(true);
    expect((n.metadata as any).subject_ref).toBe('#A1B2C3');
    expect(/\d{10}/.test(n.message)).toBe(false);
    expect(/ltd|pvt|advisor|@/i.test(n.message)).toBe(false);
    expect(/strong/.test(n.message)).toBe(true);
    expect(n.message.includes('TECHNOLOGY') && n.message.includes('Mumbai')).toBe(true);
    expect(n.message.includes('#A1B2C3')).toBe(true);
    expect(n.message.includes('Sell-side') && n.message.includes('MANUFACTURING') && n.message.includes('Pune')).toBe(true);
    expect(/potential/.test(buildBlindNotification({ ...nIn, finalScore: 61 }).message)).toBe(false);
  });
});