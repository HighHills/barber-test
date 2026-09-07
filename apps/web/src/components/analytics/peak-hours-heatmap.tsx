'use client';

import React, { useState } from 'react';
import type { PeakHourDataPoint } from '../../types/pos';
import { Clock, Flame, Info } from 'lucide-react';

interface PeakHoursHeatmapProps {
  dataPoints: PeakHourDataPoint[];
}

const DAYS = [
  { index: 1, label: 'Senin' },
  { index: 2, label: 'Selasa' },
  { index: 3, label: 'Rabu' },
  { index: 4, label: 'Kamis' },
  { index: 5, label: 'Jumat' },
  { index: 6, label: 'Sabtu' },
  { index: 0, label: 'Minggu' },
];

const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

export function PeakHoursHeatmap({ dataPoints }: PeakHoursHeatmapProps): React.JSX.Element {
  const [hoveredCell, setHoveredCell] = useState<{
    day: string;
    hour: number;
    count: number;
  } | null>(null);

  // Map data to quick lookup key "day-hour"
  const lookup = React.useMemo(() => {
    const map = new Map<string, number>();
    dataPoints.forEach((dp) => {
      map.set(`${dp.dayOfWeek}-${dp.hour}`, dp.sessionCount);
    });
    return map;
  }, [dataPoints]);

  const maxSessions = Math.max(...dataPoints.map((d) => d.sessionCount), 1);

  // Helper function to get cell color class based on session count
  const getCellColor = (count: number) => {
    if (count === 0) return 'bg-slate-100 text-slate-400 border-slate-200/40';
    const ratio = count / maxSessions;
    if (ratio < 0.25) return 'bg-amber-100 text-amber-900 border-amber-200 font-medium';
    if (ratio < 0.5) return 'bg-amber-300 text-amber-950 border-amber-400 font-semibold';
    if (ratio < 0.75) return 'bg-amber-500 text-white border-amber-600 font-bold';
    return 'bg-red-500 text-white border-red-600 font-extrabold shadow-xs';
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span>Heatmap Jam Sibuk Operasional Kursi Pangkas</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Sebaran kepadatan tamu per hari dan jam untuk efisiensi jadwal kerja kapster
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
          <span>Sepi</span>
          <div className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded-sm bg-slate-100 border border-slate-200" />
            <span className="w-3.5 h-3.5 rounded-sm bg-amber-100 border border-amber-200" />
            <span className="w-3.5 h-3.5 rounded-sm bg-amber-300 border border-amber-400" />
            <span className="w-3.5 h-3.5 rounded-sm bg-amber-500" />
            <span className="w-3.5 h-3.5 rounded-sm bg-red-500" />
          </div>
          <span className="flex items-center gap-0.5 font-bold text-red-600">
            <Flame className="w-3 h-3" /> Puncak
          </span>
        </div>
      </div>

      {/* Heatmap Grid Container */}
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[600px]">
          {/* Hour Headers */}
          <div className="grid grid-cols-[80px_repeat(12,1fr)] gap-1 text-center text-[10px] font-bold text-slate-400 mb-1">
            <div className="text-left pl-1">HARI</div>
            {HOURS.map((hour) => (
              <div key={hour}>{hour}:00</div>
            ))}
          </div>

          {/* Day Rows */}
          <div className="space-y-1">
            {DAYS.map((day) => (
              <div
                key={day.index}
                className="grid grid-cols-[80px_repeat(12,1fr)] gap-1 items-center"
              >
                <div className="text-xs font-semibold text-slate-700 pl-1">
                  {day.label}
                </div>
                {HOURS.map((hour) => {
                  const count = lookup.get(`${day.index}-${hour}`) || 0;
                  const colorClass = getCellColor(count);

                  return (
                    <div
                      key={hour}
                      className={`h-8 rounded-lg border flex items-center justify-center text-[11px] cursor-pointer transition-all hover:scale-105 hover:z-20 relative ${colorClass}`}
                      onMouseEnter={() =>
                        setHoveredCell({ day: day.label, hour, count })
                      }
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {count > 0 ? count : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hover Info & Insight Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5 text-slate-600">
          <Info className="w-3.5 h-3.5 text-amber-500" />
          <span>
            {hoveredCell ? (
              <span>
                Hari <b>{hoveredCell.day}</b> jam <b>{hoveredCell.hour}:00</b>: Memiliki{' '}
                <b className="text-slate-900 font-bold">{hoveredCell.count} sesi pangkas</b>
              </span>
            ) : (
              'Arahkan kursor ke kotak untuk melihat detail kepadatan jam operasional.'
            )}
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          *Data diperbarui dari antrean kursi pangkas (queues)
        </span>
      </div>
    </div>
  );
}
