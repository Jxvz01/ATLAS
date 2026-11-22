import React, { useState } from 'react';
import { 
  AlertCircle, 
  Filter, 
  Clock, 
  MapPin, 
  Users, 
  CheckCircle, 
  ChevronRight, 
  ArrowUpRight,
  ShieldCheck,
  Radio
} from 'lucide-react';
import { useAtlasStore } from '../../store/atlasStore';
import { Incident } from '../../types/atlas';

export const IncidentsPanel: React.FC = () => {
  const { state, selectedIncidentId, setSelectedIncident, updateIncident } = useAtlasStore();
  const [filter, setFilter] = useState<'All' | 'Critical' | 'High' | 'Active' | 'Resolved'>('All');

  const incidents = state?.incidents || [];

  const filteredIncidents = incidents.filter(inc => {
    if (filter === 'Critical') return inc.priority_level === 'Critical';
    if (filter === 'High') return inc.priority_level === 'High' || inc.priority_level === 'Critical';
    if (filter === 'Active') return inc.status === 'Active' || inc.status === 'Assigned' || inc.status === 'In Progress';
    if (filter === 'Resolved') return inc.status === 'Resolved';
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-graphite border-r border-steel/60">
      {/* Header & Filter Controls */}
      <div className="p-3 border-b border-steel/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-coolwhite uppercase">
            <AlertCircle className="w-4 h-4 text-signal" />
            <span>Incidents Queue</span>
            <span className="text-[10px] bg-steel/60 text-gray-300 px-1.5 py-0.2 rounded font-normal">
              {filteredIncidents.length}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 text-[11px] font-mono overflow-x-auto pb-1">
          {(['All', 'Critical', 'High', 'Active', 'Resolved'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-2 py-0.5 rounded transition ${
                filter === tab 
                  ? 'bg-steel text-signal font-bold border border-signal/40' 
                  : 'text-gray-400 hover:text-coolwhite hover:bg-steel/30'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Incidents List */}
      <div className="flex-1 overflow-y-auto divide-y divide-steel/40">
        {filteredIncidents.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500 font-mono">
            No incidents found matching filter.
          </div>
        ) : (
          filteredIncidents.map(inc => {
            const isSelected = selectedIncidentId === inc.id;
            const isCritical = inc.priority_level === 'Critical';

            return (
              <div
                key={inc.id}
                onClick={() => setSelectedIncident(inc.id)}
                className={`p-3 cursor-pointer transition select-none ${
                  isSelected 
                    ? 'bg-steel/50 border-l-4 border-l-signal' 
                    : 'hover:bg-steel/20 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-gray-300">
                      {inc.id}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                      isCritical
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                        : inc.priority_level === 'High'
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {inc.priority_level} ({inc.priority_score})
                    </span>
                  </div>

                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    inc.status === 'Resolved'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                      : inc.status === 'In Progress'
                      ? 'bg-blue-950/60 text-blue-400 border border-blue-800'
                      : inc.status === 'Assigned'
                      ? 'bg-purple-950/60 text-purple-400 border border-purple-800'
                      : 'bg-amber-950/60 text-amber-400 border border-amber-800'
                  }`}>
                    {inc.status}
                  </span>
                </div>

                <div className="font-semibold text-xs text-coolwhite mt-1">
                  {inc.type}
                </div>

                <div className="text-[11px] text-gray-400 line-clamp-2 mt-0.5">
                  {inc.description}
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 mt-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-gray-500" />
                      {inc.affected_population} affected
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-gray-500" />
                      {inc.latitude.toFixed(3)}, {inc.longitude.toFixed(3)}
                    </span>
                  </div>

                  <span className="text-gray-500">{inc.source}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
