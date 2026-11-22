import React from 'react';
import { Link } from 'react-router-dom';
import { 
  CheckCircle2, 
  Activity, 
  Bell, 
  ArrowRight,
  Zap,
  Users2,
  PlusSquare,
  Layers,
  Monitor,
  Building2,
  Radio,
  Smartphone
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans flex flex-col justify-between selection:bg-[#F26536]/20 relative overflow-x-hidden select-none">
      
      {/* 1. TOP HEADER */}
      <header className="h-20 bg-white/90 backdrop-blur-xs px-8 md:px-16 flex items-center justify-between shrink-0 z-20">
        {/* Brand Lockup */}
        <div className="flex items-center gap-3.5">
          <div className="text-[#F26536] flex items-center justify-center">
            {/* Custom stylized chevron/delta matching image */}
            <svg width="28" height="28" viewBox="0 0 28 28" fill="currentColor">
              <path d="M14 3L2 23H7L14 11L21 23H26L14 3Z" fill="#F26536" />
            </svg>
          </div>
          <div>
            <div className="font-extrabold text-lg tracking-tight text-[#0F172A] leading-tight">
              ATLAS
            </div>
            <div className="text-xs text-[#64748B] font-medium tracking-tight">
              Disaster Response Network
            </div>
          </div>
        </div>

        {/* Right Nav: Pulse activity + SOS button */}
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-[#475569]">
            <Activity className="w-4 h-4 text-[#475569]" />
            <span>Emergency Coordination Network</span>
          </div>

          <Link
            to="/app"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F26536] hover:bg-[#E05322] active:scale-98 text-white font-semibold text-xs shadow-sm transition"
          >
            <Bell className="w-3.5 h-3.5 fill-white text-white" />
            <span>Citizen SOS Portal</span>
            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
          </Link>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-8 md:px-16 py-4 flex flex-col justify-center z-10 space-y-10">
        
        {/* Top Grid: Left Hero Typography & Feature Pills | Right Reframed Visual */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
          
          {/* Left Text Column (Col 1-6) */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FFF1EB] border border-[#FEE0D2] text-[11px] font-semibold text-[#F26536]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#F26536]" />
              <span>Unified Emergency Response & Coordination</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-black tracking-tight text-[#0F172A] leading-[1.08]">
              Coordinating response.<br />
              <span className="text-[#F26536]">Connecting lives.</span>
            </h1>

            {/* Subtext */}
            <p className="text-sm sm:text-base text-[#64748B] max-w-lg leading-relaxed font-normal">
              ATLAS connects emergency reports, response teams and medical facilities through a unified coordination network.
            </p>

            {/* 4 Feature Micro-Columns with Icons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              {/* Feature 1 */}
              <div className="flex items-start gap-2.5">
                <Zap className="w-4 h-4 text-[#F26536] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-[#0F172A] leading-tight">Report</div>
                  <div className="text-[11px] text-[#64748B] leading-tight mt-0.5">Incidents</div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex items-start gap-2.5">
                <Users2 className="w-4 h-4 text-[#F0A43A] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-[#0F172A] leading-tight">Coordinate</div>
                  <div className="text-[11px] text-[#64748B] leading-tight mt-0.5">Resources</div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="flex items-start gap-2.5">
                <PlusSquare className="w-4 h-4 text-[#F26536] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-[#0F172A] leading-tight">Manage</div>
                  <div className="text-[11px] text-[#64748B] leading-tight mt-0.5">Medical Support</div>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="flex items-start gap-2.5">
                <Layers className="w-4 h-4 text-[#E23B3B] shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-[#0F172A] leading-tight">Respond</div>
                  <div className="text-[11px] text-[#64748B] leading-tight mt-0.5">Efficiently</div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Visual Column (Col 7-12): Completely Reframed with Full Copy-Protection */}
          <div className="lg:col-span-6 relative flex justify-center items-center">
            <div 
              className="w-full max-w-[620px] relative rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-[#E2E8F0]/70 select-none group"
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
              }}
            >
              {/* Underlying Image */}
              <img 
                src="/hero-network-blended.png" 
                alt="ATLAS Response Network Topology" 
                draggable={false}
                className="w-full h-auto object-cover block pointer-events-none select-none"
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                  pointerEvents: 'none'
                }}
              />

              {/* Absolute Invisible Anti-Copy & Interaction Interceptor Layer */}
              <div 
                className="absolute inset-0 z-10 cursor-default bg-transparent"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  return false;
                }}
                onDragStart={(e) => {
                  e.preventDefault();
                  return false;
                }}
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none'
                }}
              />

              {/* Subtle Inset Framing Border */}
              <div className="absolute inset-0 z-20 pointer-events-none rounded-2xl ring-1 ring-inset ring-black/5" />
            </div>
          </div>

        </div>

        {/* 3. PORTAL ACCESS SECTION (4 CARDS MATCHING EXACT SPEC) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-2">
          
          {/* CARD 1: Command Center */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 flex flex-col justify-between shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-md transition-all group">
            <div>
              {/* Rounded soft coral icon box */}
              <div className="w-12 h-12 rounded-xl bg-[#FFF1EB] flex items-center justify-center mb-4">
                <Monitor className="w-6 h-6 text-[#F26536]" />
              </div>

              <h2 className="font-bold text-base text-[#0F172A] tracking-tight">
                Command Center
              </h2>

              <p className="text-xs text-[#64748B] mt-2.5 leading-relaxed font-normal">
                Monitor incidents, coordinate response resources and assess emerging situations.
              </p>
            </div>

            <div className="pt-6 mt-4">
              <Link
                to="/admin/login"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F26536] hover:text-[#E05322] group-hover:gap-2.5 transition-all"
              >
                <span>Admin Access</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* CARD 2: Hospital Operations */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 flex flex-col justify-between shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-md transition-all group">
            <div>
              {/* Rounded soft blue icon box */}
              <div className="w-12 h-12 rounded-xl bg-[#E0F2FE] flex items-center justify-center mb-4">
                <Building2 className="w-6 h-6 text-[#0284C7]" />
              </div>

              <h2 className="font-bold text-base text-[#0F172A] tracking-tight">
                Hospital Operations
              </h2>

              <p className="text-xs text-[#64748B] mt-2.5 leading-relaxed font-normal">
                Manage emergency intake, facility capacity and coordinated patient referrals.
              </p>
            </div>

            <div className="pt-6 mt-4">
              <Link
                to="/hospital/login"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0284C7] hover:text-[#0369A1] group-hover:gap-2.5 transition-all"
              >
                <span>Hospital Login</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* CARD 3: Rescuer Operations */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 flex flex-col justify-between shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-md transition-all group">
            <div>
              {/* Rounded soft green icon box */}
              <div className="w-12 h-12 rounded-xl bg-[#DCFCE7] flex items-center justify-center mb-4">
                <Radio className="w-6 h-6 text-[#16A34A]" />
              </div>

              <h2 className="font-bold text-base text-[#0F172A] tracking-tight">
                Rescuer Operations
              </h2>

              <p className="text-xs text-[#64748B] mt-2.5 leading-relaxed font-normal">
                Receive assignments, navigate response sites and report field conditions.
              </p>
            </div>

            <div className="pt-6 mt-4">
              <Link
                to="/rescue/login"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#16A34A] hover:text-[#15803D] group-hover:gap-2.5 transition-all"
              >
                <span>Rescuer Login</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* CARD 4: Civilian Assistance (Prominent border and solid Orange Button) */}
          <div className="bg-white border border-[#F26536]/70 rounded-2xl p-6 flex flex-col justify-between shadow-[0_2px_6px_rgba(242,101,54,0.08)] hover:shadow-lg transition-all group">
            <div>
              {/* Rounded soft coral icon box */}
              <div className="w-12 h-12 rounded-xl bg-[#FFF1EB] flex items-center justify-center mb-4">
                <Smartphone className="w-6 h-6 text-[#F26536]" />
              </div>

              <h2 className="font-bold text-base text-[#0F172A] tracking-tight">
                Civilian Assistance
              </h2>

              <p className="text-xs text-[#64748B] mt-2.5 leading-relaxed font-normal">
                Request emergency assistance, report incidents and track response updates.
              </p>
            </div>

            <div className="pt-6 mt-4">
              <Link
                to="/app"
                className="w-full py-2.5 px-4 rounded-xl bg-[#F26536] hover:bg-[#E05322] active:scale-98 text-white font-bold text-xs inline-flex items-center justify-center gap-2 shadow-xs transition"
              >
                <span>Open Assistance App</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

        </div>

      </main>

      {/* 4. FOOTER */}
      <footer className="h-14 border-t border-[#E2E8F0]/80 bg-white/60 px-8 md:px-16 flex items-center justify-between text-xs text-[#64748B] shrink-0 z-20">
        <div className="flex items-center gap-3">
          <span className="font-bold text-[#0F172A]">ATLAS</span>
          <span className="text-[#CBD5E1]">|</span>
          <span>Disaster Response Network</span>
          <span className="text-[#CBD5E1] hidden sm:inline">|</span>
          <span className="hidden sm:inline">Human-supervised emergency coordination</span>
        </div>
      </footer>

    </div>
  );
};
