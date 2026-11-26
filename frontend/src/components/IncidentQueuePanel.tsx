import React, { useState, useMemo } from 'react';
import {
  Search,
  AlertCircle,
  MapPin,
  Users,
  ArrowUpDown,
  Radio
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';
import { Incident } from '../types/atlas';

interface IncidentQueuePanelProps {
  onSelectIncident?: (inc: Incident) => void;
}

export const IncidentQueuePanel: React.FC<IncidentQueuePanelProps> = ({ onSelectIncident }) => {
  const { state, selectedIncidentId, setSelectedIncident } = useAtlasStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Critical' | 'Assigned' | 'Resolved'>('All');
  const [sortBy, setSortBy] = useState<'priority' | 'newest'>('priority');

  const incidents = state?.incidents || [];
  const assignments = state?.assignments || [];

  const getAssignedUnit = (incidentId: string) => {
    const asg = assignments.find(
      a => a.incident_id === incidentId && a.assignment_status !== 'Completed' && a.assignment_status !== 'Canceled'
    );
    return asg ? asg.resource_id : null;
  };

  const filteredIncidents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...incidents]
      .filter(inc => {
        if (statusFilter === 'Critical' && (inc.priority_level !== 'Critical' || inc.status === 'Resolved')) return false;
        if (statusFilter === 'Active' && inc.status !== 'Active') return false;
        if (statusFilter === 'Assigned' && inc.status !== 'Assigned' && inc.status !== 'In Progress') return false;
        if (statusFilter === 'Resolved' && inc.status !== 'Resolved') return false;
        if (q) {
          const hay = `${inc.id} ${inc.type} ${inc.description} ${inc.source || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'priority') {
          if (a.status === 'Resolved' && b.status !== 'Resolved') return 1;
          if (b.status === 'Resolved' && a.status !== 'Resolved') return -1;
          return (b.priority_score || 0) - (a.priority_score || 0);
        }
        return (b.created_at || '').localeCompare(a.created_at || '');
      });
  }, [incidents, searchQuery, statusFilter, sortBy]);

  return (
    <aside className="w-full lg:w-[300px] h-full bg-white border-r border-[#DCE2E8] flex flex-col select-none shrink-0 z-10">
      {/* Queue Header */}
      <div className="p-2.5 border-b border-[#DCE2E8] bg-[#F8FAFC] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0F172A] font-mono">
            <AlertCircle className="w-3.5 h-3.5 text-[#E85D2A]" />
            <span>Incident Queue</span>
            <span className="px-1.5 py-0.2 rounded bg-[#E5E9ED] text-[#111827] text-[10px] tabular-nums">
              {filteredIncidents.length}
            </span>
          </div>
          <button
            onClick={() => setSortBy(prev => prev === 'priority' ? 'newest' : 'priority')}
            title="Toggle sort order"
            className="flex items-center gap-1 text-[10px] font-mono font-semibold text-[#5B6777] hover:text-[#0F172A] px-1.5 py-0.5 rounded border border-[#DCE2E8] bg-white"
          >
            <ArrowUpDown className="w-2.5 h-2.5" />
            <span>{sortBy === 'priority' ? 'Priority' : 'Newest'}</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#5B6777] absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ID, type, area..."
            className="w-full pl-7 pr-2 py-1 rounded border border-[#DCE2E8] bg-white text-[11px] text-[#111827] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0284C7]"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {(['All', 'Active', 'Critical', 'Assigned', 'Resolved'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition ${
                statusFilter === tab
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-white border border-[#DCE2E8] text-[#5B6777] hover:text-[#111827]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Scannable Incident List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#DCE2E8]">
        {filteredIncidents.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#5B6777]">
            No incidents match current filter.
          </div>
        ) : (
          filteredIncidents.map(inc => {
            const isSelected = selectedIncidentId === inc.id;
            const assignedUnit = getAssignedUnit(inc.id);
            const isCrit = inc.priority_level === 'Critical';
            const isHigh = inc.priority_level === 'High';
            const isField = inc.id.startsWith('INC-FLD-');

            const prioClass = isCrit
              ? 'bg-red-50 text-[#DC2626] border-red-200'
              : isHigh
              ? 'bg-orange-50 text-[#E85D2A] border-orange-200'
              : 'bg-amber-50 text-[#D97706] border-amber-200';

            const statusClass = inc.status === 'Resolved'
              ? 'bg-emerald-50 text-[#15803D] border-emerald-200'
              : inc.status === 'Assigned' || inc.status === 'In Progress'
              ? 'bg-sky-50 text-[#0284C7] border-sky-200'
              : 'bg-amber-50 text-[#D97706] border-amber-200';

            return (
              <div
                key={inc.id}
                onClick={() => {
                  setSelectedIncident(inc.id);
                  if (onSelectIncident) onSelectIncident(inc);
                }}
                className={`p-2.5 cursor-pointer transition border-l-3 ${
                  isSelected
                    ? 'bg-[#FFF5F2] border-l-4 border-l-[#E85D2A]'
                    : 'bg-white hover:bg-[#F8FAFC] border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-[11px] font-bold text-[#0F172A]">{inc.id}</span>
                    {isField && (
                      <span className="px-1 py-0.2 rounded bg-red-600 text-white text-[8px] font-mono font-bold">
                        FIELD
                      </span>
                    )}
                    <span className={`px-1.5 py-0.2 rounded border text-[9px] font-mono font-bold uppercase ${prioClass}`}>
                      {inc.priority_level}
                    </span>
                  </div>
                  <span className={`px-1.5 py-0.2 rounded border text-[9px] font-mono font-semibold ${statusClass}`}>
                    {inc.status}
                  </span>
                </div>

                <div className="font-semibold text-xs text-[#111827] mt-1 truncate">
                  {inc.type}
                </div>

                <div className="text-[11px] text-[#5B6777] line-clamp-1 mt-0.5">
                  {inc.description}
                </div>

                <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-[#5B6777] tabular-nums">
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    <span>{inc.latitude.toFixed(3)}, {inc.longitude.toFixed(3)}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {inc.affected_population > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Users className="w-2.5 h-2.5" />
                        {inc.affected_population}
                      </span>
                    )}
                    <span className={`font-bold ${assignedUnit ? 'text-[#15803D]' : 'text-[#D97706]'}`}>
                      {assignedUnit ? `Unit ${assignedUnit}` : 'Unassigned'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
