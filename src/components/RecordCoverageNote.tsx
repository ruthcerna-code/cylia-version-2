import type { DailyLog } from '../types';
import { recordCoverage, recordCoverageText } from '../utils/dailyRecord';

export default function RecordCoverageNote({
  logs,
  today,
}: {
  logs: Record<string, DailyLog> | DailyLog[];
  today: string;
}) {
  const coverage = recordCoverage(logs, today);
  return (
    <p className={`m-0 rounded-2xl px-3 py-2 text-sm leading-relaxed ${coverage.continuous30 ? 'bg-[#E7F6EA] text-[#153E40]' : 'bg-[#FFF6CF] text-[#153E40]'}`}>
      {recordCoverageText(coverage)}
    </p>
  );
}
