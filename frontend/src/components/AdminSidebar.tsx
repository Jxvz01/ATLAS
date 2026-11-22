import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  AlertCircle, 
  Users, 
  Building2, 
  Cpu, 
  BarChart2, 
  Radio, 
  Play, 
  ShieldCheck, 
  Settings, 
  Building,
  RadioTower,
  Smartphone,
  ChevronDown
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';

interface AdminSidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({ currentTab, onTabChange }) => {
  const { state } = useAtlasStore();

  const incidentsCount = (state?.incidents || []).filter(i => i.status !== 'Resolved').length;
  const criticalCount = (state?.incidents || []).filter(i => i.priority_level === 'Critical' && i.status !== 'Resolved').length;
  const unitsCount = (state?.resources || []).length;
  const hospitalsCount = (state?.hospitals || []).length;
  const alertsCount = (state?.alerts || []).length;

  const navItems = [
    { id: 'command-center', label: 'Command Center', icon: LayoutDashboard, count: null },
    { id: 'incidents', label: 'Incidents', icon: AlertCircle, count: incidentsCount, isCrit: criticalCount > 0 },
    { id: 'resources', label: 'Resources', icon: Users, count: unitsCount },
    { id: 'hospitals', label: 'Hospitals', icon: Building2, count: hospitalsCount },
    { id: 'hazard-intel', label: 'Hazard Intelligence', icon: Cpu, count: null },
    { id: 'analytics', label: 'Analytics', icon: BarChart2, count: null },
    { id: 'communications', label: 'Communications', icon: Radio, count: alertsCount },
    { id: 'simulation', label: 'Simulation', icon: Play, count: null },
    { id: 'access-control', label: 'Access Control', icon: ShieldCheck, count: null },
  ];

  return (
    <aside className="w-[240px] h-full bg-white border-r border-[#E5E9ED] flex flex-col justify-between select-none z-20 shadow-[1px_0_4px_rgba(0,0,0,0.02)]">
      {/* Top Branding & Nav List */}
      <div>
        {/* Brand Header */}
        <div className="p-4 pb-3 border-b border-[#E5E9ED]">
          <div className="flex items-center gap-2.5">
            {/* Minimal orange emblem */}
            <div className="w-7 h-7 rounded-md bg-[#F26A38] text-white flex items-center justify-center font-black text-sm shadow-sm">
              Δ
            </div>
            <div>
              <div className="font-extrabold text-sm tracking-wide text-[#18212B]">
                ATLAS
              </div>
              <div className="text-[10px] text-[#718096] font-medium tracking-tight">
                Disaster Response Network
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-2 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all relative ${
                  isActive
                    ? 'bg-[#F26A38]/10 text-[#F26A38] font-semibold'
                    : 'text-[#18212B] hover:text-[#18212B] hover:bg-[#F5F6F7]'
                }`}
              >
                {/* Thin orange indicator along edge */}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#F26A38] rounded-r" />
                )}

                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-[#F26A38]' : 'text-[#718096]'
                  }`} />
                  <span>{item.label}</span>
                </div>

                {item.count !== null && item.count !== undefined && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                    item.isCrit
                      ? 'bg-[#DC3C3C]/10 text-[#DC3C3C] border border-[#DC3C3C]/20'
                      : isActive
                      ? 'bg-[#F26A38]/20 text-[#F26A38]'
                      : 'bg-[#F5F6F7] text-[#718096]'
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick Portal Switcher (Clean, Minimal) */}
        <div className="px-3 pt-3 mt-1 border-t border-[#E5E9ED]">
          <div className="text-[10px] font-mono font-bold text-[#718096] uppercase px-1 mb-1">
            Connected Interfaces
          </div>
          <div className="space-y-0.5 text-xs">
            <NavLink
              to="/hospital"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#718096] hover:text-[#18212B] hover:bg-[#F5F6F7] transition"
            >
              <Building2 className="w-3.5 h-3.5 text-[#4386C6]" />
              <span>Hospital Operations</span>
            </NavLink>
            <NavLink
              to="/rescuer"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#718096] hover:text-[#18212B] hover:bg-[#F5F6F7] transition"
            >
              <RadioTower className="w-3.5 h-3.5 text-[#27966B]" />
              <span>Rescuer Terminal</span>
            </NavLink>
            <NavLink
              to="/app"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-[#718096] hover:text-[#18212B] hover:bg-[#F5F6F7] transition"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#F26A38]" />
              <span>Citizen SOS App</span>
            </NavLink>
          </div>
        </div>
      </div>

      {/* Footer Settings & Status Indicator */}
      <div className="p-3 border-t border-[#E5E9ED] bg-white">
        <button 
          onClick={() => onTabChange('access-control')}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs text-[#718096] hover:text-[#18212B] hover:bg-[#F5F6F7] transition"
        >
          <Settings className="w-4 h-4 text-[#718096]" />
          <span>Settings</span>
        </button>

        {/* Compact System Online Indicator */}
        <div className="mt-2 p-2 rounded-md bg-[#F5F6F7] border border-[#E5E9ED] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#27966B]" />
          <div>
            <div className="text-[11px] font-bold text-[#27966B] font-mono leading-none">
              System Online
            </div>
            <div className="text-[10px] text-[#718096] font-sans mt-0.5">
              All services operational
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
