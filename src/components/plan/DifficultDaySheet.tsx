import React, { useEffect, useState } from 'react';
import type { ScheduledActivity } from '../../types';
import type { ActivityDraft } from '../../firebase';
import { formatFriendlyDate } from '../../utils/cycle';
import {
  activityMinutes,
  draftsFor,
  regroup,
  replanDifficultDay,
  toDraft,
  type DifficultDayPlan,
  type ReplanGroup,
  type ReplanItem,
} from '../../plan/difficultDay';

const GROUPS: Array<{ id: ReplanGroup; title: string; empty: string; color: string }> = [
  { id: 'mantener', title: 'Se mantiene', empty: 'Nada queda igual.', color: '#3A44C4' },
  { id: 'acortar', title: 'Se acorta', empty: 'Nada se acorta.', color: '#B8860B' },
  { id: 'esperar', title: 'Puede esperar', empty: 'Nada se mueve a otro día.', color: '#D4536A' },
];

const MOVE_LABEL: Record<ReplanGroup, string> = {
  mantener: 'Mantener',
  acortar: 'Acortar',
  esperar: 'Otro día',
};

function Item({ item, onMove }: { item: ReplanItem; onMove: (group: ReplanGroup) => void }) {
  const { activity } = item;
  return (
    <li className="rounded-2xl bg-[#F8F9FE] p-3">
      <p className="m-0 text-[12px] font-bold text-[#4A4F7A]">
        {activity.startTime || '—'}{activity.endTime ? `–${activity.endTime}` : ''} · {activityMinutes(activity)} min
      </p>
      <strong className="block text-[15px] text-[#1B1F5E]">{activity.title}</strong>
      <span className="block text-sm text-[#3B4070]">{item.reason}</span>
      {item.group === 'acortar' && item.newEndTime && (
        <span className="mt-1 block text-sm font-bold text-[#1B1F5E]">Nuevo horario: {activity.startTime}–{item.newEndTime}</span>
      )}
      {item.group === 'esperar' && item.proposedDate && (
        <span className="mt-1 block text-sm font-bold text-[#1B1F5E]">
          Fecha propuesta: {formatFriendlyDate(item.proposedDate)}{activity.startTime ? `, ${activity.startTime}` : ''}
        </span>
      )}
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Mover ${activity.title}`}>
        {(['mantener', 'acortar', 'esperar'] as ReplanGroup[]).filter((group) => group !== item.group).map((group) => (
          <button
            key={group}
            type="button"
            onClick={() => onMove(group)}
            className="flex h-11 cursor-pointer items-center rounded-full bg-white px-4 text-sm font-extrabold text-[#3A44C4]"
          >
            {MOVE_LABEL[group]}
          </button>
        ))}
      </div>
    </li>
  );
}

export default function DifficultDaySheet({
  open,
  date,
  activities,
  onClose,
  onApply,
}: {
  open: boolean;
  date: string;
  activities: ScheduledActivity[];
  onClose: () => void;
  onApply: (drafts: ActivityDraft[], before: ActivityDraft[]) => Promise<void>;
}) {
  const [plan, setPlan] = useState<DifficultDayPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPlan(replanDifficultDay(activities, date));
    setError('');
    setSaving(false);
    // Only rebuild when the sheet opens, so her changes are not lost while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date]);

  if (!open || !plan) return null;

  const changes = draftsFor(plan);
  const apply = async () => {
    setSaving(true);
    setError('');
    try {
      const ids = new Set(changes.map((draft) => draft.id));
      const before = plan.items.filter((item) => ids.has(item.activity.id)).map((item) => toDraft(item.activity));
      await onApply(changes, before);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron guardar los cambios.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B1F5E]/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dia-dificil"
        className="max-h-[90vh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-white px-4 pb-8 pt-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="dia-dificil" className="m-0 text-lg font-extrabold text-[#1B1F5E]">Hoy es un día difícil</h2>
        {plan.items.length === 0 ? (
          <p className="mt-2 text-sm text-[#3B4070]">Hoy no quedan actividades pendientes. No hay nada que mover.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-[#3B4070]">
              Esta es una propuesta. No se mueve nada hasta que la apruebes, y después puedes deshacerla.
              {plan.savedMinutes > 0 ? ` Liberas unos ${plan.savedMinutes} min hoy.` : ''}
            </p>
            {GROUPS.map((group) => {
              const list = plan.items.filter((item) => item.group === group.id);
              return (
                <section key={group.id} aria-labelledby={`grupo-${group.id}`} className="mt-4">
                  <h3 id={`grupo-${group.id}`} className="m-0 text-sm font-extrabold tracking-wide" style={{ color: group.color }}>
                    {group.title.toUpperCase()} · {list.length}
                  </h3>
                  {list.length === 0 ? (
                    <p className="m-0 mt-1 text-sm text-[#4A4F7A]">{group.empty}</p>
                  ) : (
                    <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                      {list.map((item) => (
                        <Item
                          key={item.activity.id}
                          item={item}
                          onMove={(next) => setPlan((current) => current ? regroup(current, item.activity.id, next, activities) : current)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </>
        )}
        {error && <p className="mt-3 text-sm text-[#D4536A]" role="alert">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F8F9FE] text-[15px] font-extrabold text-[#1B1F5E]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || changes.length === 0}
            onClick={() => { void apply(); }}
            className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Guardando…' : changes.length === 0 ? 'Sin cambios' : `Aprobar ${changes.length} ${changes.length === 1 ? 'cambio' : 'cambios'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
