import { describe, expect, it } from 'vitest';
import {
  addAlert,
  durationLabel,
  endsNextDay,
  moveSubtask,
  quarterSlots,
  subtaskProgress,
  subtasksOf,
  taskStatus,
} from '../src/plan/task';
import { overlappingActivity } from '../src/utils/activities';
import { endClock } from '../src/plan/proposal';
import { makeActivity } from './helpers';

const at = (date: string, clock: string) => new Date(`${date}T${clock}:00`);

describe('Bandeja de entrada: tareas (src/plan/task.ts)', () => {
  it('ofrece horas cada 15 minutos sin pasar a otro día', () => {
    expect(quarterSlots('10:07')).toEqual(['09:30', '09:45', '10:00', '10:15', '10:30', '10:45', '11:00', '11:15']);
    expect(quarterSlots('00:05')[0]).toBe('00:00');
    const late = quarterSlots('23:50');
    expect(late).toHaveLength(8);
    expect(late[late.length - 1]).toBe('23:45');
    expect(late).not.toContain('00:00');
  });

  it('calcula la hora de término, también cuando termina al día siguiente', () => {
    expect(endClock('09:00', 90)).toBe('10:30');
    expect(endsNextDay('09:00', 90)).toBe(false);
    expect(endClock('23:30', 45)).toBe('00:15');
    expect(endsNextDay('23:30', 45)).toBe(true);
  });

  it('muestra las duraciones de forma corta', () => {
    expect(durationLabel(15)).toBe('15 min');
    expect(durationLabel(60)).toBe('1 h');
    expect(durationLabel(90)).toBe('1 h 30 min');
    expect(durationLabel(120)).toBe('2 h');
  });

  it('calcula el estado sin completar nada solo porque pasó la hora', () => {
    const task = makeActivity({ id: 't', title: 'Tarea', date: '2026-11-18', startTime: '10:00', endTime: '11:00' });
    expect(taskStatus(task, at('2026-11-18', '09:00'))).toBe('pendiente');
    expect(taskStatus(task, at('2026-11-18', '10:30'))).toBe('en_curso');
    expect(taskStatus(task, at('2026-11-18', '11:30'))).toBe('vencida');
    expect(taskStatus(task, at('2026-11-19', '08:00'))).toBe('vencida');
    expect(taskStatus(task, at('2026-11-17', '23:00'))).toBe('pendiente');
    expect(taskStatus({ ...task, planStatus: 'hecha' }, at('2026-11-19', '08:00'))).toBe('hecha');
    expect(taskStatus({ ...task, planStatus: 'pospuesta' }, at('2026-11-18', '09:00'))).toBe('no_realizada');
  });

  it('una tarea que cruza la medianoche sigue en curso pasada las 00:00 de su día', () => {
    const night = makeActivity({ id: 'n', title: 'Noche', date: '2026-11-18', startTime: '23:00', endTime: '00:30' });
    expect(taskStatus(night, at('2026-11-18', '23:30'))).toBe('en_curso');
  });

  it('usa los pasos de Cyclia como subtareas cuando no hay subtareas propias', () => {
    const withSteps = makeActivity({ id: 's', title: 'Correo', date: '2026-11-18', steps: [{ action: 'Abrir el correo', minutes: 5, doneWhen: '' }, { action: 'Responder', minutes: 10, doneWhen: '' }] });
    expect(subtasksOf(withSteps).map((item) => item.title)).toEqual(['Abrir el correo', 'Responder']);
    expect(subtaskProgress(withSteps)).toEqual({ done: 0, total: 2 });
    const own = makeActivity({ id: 'o', title: 'Propia', date: '2026-11-18', subtasks: [{ id: 'a', title: 'Uno', done: true }, { id: 'b', title: 'Dos', done: false }] });
    expect(subtaskProgress(own)).toEqual({ done: 1, total: 2 });
  });

  it('reordena subtareas sin salirse de la lista', () => {
    const list = [{ id: 'a', title: 'A', done: false }, { id: 'b', title: 'B', done: false }, { id: 'c', title: 'C', done: false }];
    expect(moveSubtask(list, 'c', -1).map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(moveSubtask(list, 'a', 1).map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(moveSubtask(list, 'a', -1)).toBe(list);
  });

  it('no repite alertas y las mantiene en orden', () => {
    expect(addAlert(['15'], 'inicio')).toEqual(['inicio', '15']);
    expect(addAlert(['inicio', '15'], '15')).toEqual(['inicio', '15']);
  });

  it('avisa del choque de horario con otra actividad', () => {
    const existing = [makeActivity({ id: 'x', title: 'Reunión', date: '2026-11-18', startTime: '10:00', endTime: '11:00' })];
    expect(overlappingActivity(existing, { date: '2026-11-18', startTime: '10:30', endTime: '11:15', durationMinutes: 45 })?.id).toBe('x');
    expect(overlappingActivity(existing, { date: '2026-11-18', startTime: '11:00', endTime: '11:30', durationMinutes: 30 })).toBeFalsy();
    // Al editar la misma actividad no choca consigo misma.
    expect(overlappingActivity(existing, { id: 'x', date: '2026-11-18', startTime: '10:15', endTime: '11:15', durationMinutes: 60 })).toBeFalsy();
  });
});
