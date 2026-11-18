import { describe, expect, it } from 'vitest';
import { hasMoodAndBehavior, recordCoverage, recordCoverageText } from '../src/utils/dailyRecord';
import { makeLog } from './helpers';

describe('Registro diario de ánimo y comportamiento', () => {
  it('exige ánimo y un texto de comportamiento', () => {
    expect(hasMoodAndBehavior(undefined)).toBe(false);
    expect(hasMoodAndBehavior(makeLog('2026-11-01'))).toBe(false);
    expect(hasMoodAndBehavior(makeLog('2026-11-01', { behavior: 'caminé' }))).toBe(true);
    expect(hasMoodAndBehavior(makeLog('2026-11-01', { behavior: '   ' }))).toBe(false);
  });

  it('cuenta los días registrados y la racha seguida', () => {
    const logs = {
      '2026-11-01': makeLog('2026-11-01', { behavior: 'a' }),
      '2026-11-02': makeLog('2026-11-02', { behavior: 'b' }),
      '2026-11-04': makeLog('2026-11-04', { behavior: 'c' }),
      '2026-11-10': makeLog('2026-11-10'),
    };
    const coverage = recordCoverage(logs, '2026-11-18');
    expect(coverage.registeredDays).toBe(3);
    expect(coverage.continuousDays).toBe(2);
    expect(coverage.continuous30).toBe(false);
    expect(recordCoverageText(coverage)).toMatch(/3 días registrados/);
    expect(recordCoverageText(coverage)).toMatch(/puede tener errores/);
  });

  it('reconoce 30 días seguidos', () => {
    const logs: Record<string, ReturnType<typeof makeLog>> = {};
    for (let day = 1; day <= 30; day += 1) {
      const date = `2026-10-${String(day).padStart(2, '0')}`;
      logs[date] = makeLog(date, { behavior: 'registrado' });
    }
    const coverage = recordCoverage(logs, '2026-10-30');
    expect(coverage.registeredDays).toBe(30);
    expect(coverage.continuousDays).toBe(30);
    expect(coverage.continuous30).toBe(true);
    expect(recordCoverageText(coverage)).not.toMatch(/puede tener errores/);
  });
});
