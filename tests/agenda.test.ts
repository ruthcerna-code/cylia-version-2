import { describe, expect, it } from 'vitest';
import { agendaDayLabel, agendaGroups, pendingAhead } from '../src/plan/agenda';
import { makeActivity } from './helpers';

const today = '2026-11-18';
const activities = [
  makeActivity({ id: 'c', title: 'Reunión', date: '2026-11-20', startTime: '15:00', endTime: '16:00' }),
  makeActivity({ id: 'a', title: 'Caminar', date: today, startTime: '18:00', endTime: '18:30' }),
  makeActivity({ id: 'b', title: 'Informe', date: today, startTime: '09:00', endTime: '11:00', planStatus: 'hecha' }),
  makeActivity({ id: 'd', title: 'Banco', date: '2026-11-19', startTime: '', endTime: '' }),
  makeActivity({ id: 'e', title: 'Dentista', date: '2026-11-19', startTime: '08:30', endTime: '09:00' }),
  makeActivity({ id: 'f', title: 'Ayer', date: '2026-11-17', startTime: '10:00', endTime: '11:00' }),
];

describe('Agenda (src/plan/agenda.ts)', () => {
  it('ordena por fecha y hora, y agrupa por día', () => {
    const days = agendaGroups(activities, today);
    expect(days.map((day) => day.date)).toEqual(['2026-11-18', '2026-11-19', '2026-11-20']);
    expect(days[0].activities.map((item) => item.id)).toEqual(['b', 'a']);
    // Las actividades sin hora van al final de su día.
    expect(days[1].activities.map((item) => item.id)).toEqual(['e', 'd']);
  });

  it('«Próximas» empieza hoy; «Todas» incluye los días pasados', () => {
    expect(agendaGroups(activities, today, 'proximas').some((day) => day.date < today)).toBe(false);
    expect(agendaGroups(activities, today, 'todas')[0].date).toBe('2026-11-17');
  });

  it('nombra hoy, mañana y ayer, y los demás días con su fecha', () => {
    expect(agendaDayLabel(today, today)).toBe('Hoy');
    expect(agendaDayLabel('2026-11-19', today)).toBe('Mañana');
    expect(agendaDayLabel('2026-11-17', today)).toBe('Ayer');
    expect(agendaDayLabel('2026-11-20', today)).toMatch(/^Viernes, 20 de noviembre$/);
  });

  it('cuenta las pendientes desde hoy, sin las hechas ni las pasadas', () => {
    expect(pendingAhead(activities, today)).toBe(4);
  });

  it('sin actividades no hay días', () => {
    expect(agendaGroups([], today)).toEqual([]);
  });
});
