import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RadioTower, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const RescuerLogin: React.FC = () => {
  const [unitId, setUnitId] = useState('R-04');
  const [passcode, setPasscode] = useState('RESCUE-UNIT-4-KEY');
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitId || !passcode) {
      setError('Please provide tactical responder credentials.');
      return;
    }
    login('rescuer', 'Civil Defense Inflatable Boat Bravo (R-04)', unitId);
    navigate('/rescue/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#F5F7F9] flex flex-col justify-center items-center p-4 font-sans select-none">
      <div className="w-full max-w-md bg-white border border-[#E3E8ED] rounded-xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-[#23966B] text-white flex items-center justify-center font-bold text-lg shadow-sm">
            <RadioTower className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base text-[#17212B] tracking-tight">ATLAS Rescuer Portal</h1>
            <p className="text-xs text-[#64748B]">Tactical Field Operations & Incident Response</p>
          </div>
        </div>

        <div className="mb-5 p-3 rounded-lg bg-[#23966B]/10 border border-[#23966B]/20 text-xs text-[#23966B] leading-relaxed">
          <div className="font-semibold flex items-center gap-1.5 mb-0.5">
            <ShieldCheck className="w-4 h-4 text-[#23966B]" />
            <span>Field Responder Authentication</span>
          </div>
          Select assigned tactical callsign or unit ID to access field assignment stream.
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded bg-[#E23B3B]/10 border border-[#E23B3B]/20 text-xs text-[#E23B3B] flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#17212B] mb-1">Assigned Response Unit</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E3E8ED] bg-[#F5F7F9] focus:bg-white focus:outline-none focus:border-[#F26536] text-[#17212B]"
            >
              <option value="R-04">R-04: Civil Defense Inflatable Boat Bravo (Water Rescue)</option>
              <option value="R-01">R-01: SDRF Water Rescue Alpha (Evacuation / First Aid)</option>
              <option value="R-02">R-02: NDRF Quick Response Unit 4 (Structural / Extrication)</option>
              <option value="R-03">R-03: Jeeva 108 ALS Ambulance 07 (Medical Trauma)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#17212B] mb-1">Tactical Radio Passcode</label>
            <input
              type="password"
              required
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E3E8ED] bg-[#F5F7F9] focus:bg-white focus:outline-none focus:border-[#F26536] text-[#17212B]"
            />
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-2.5 rounded-lg bg-[#23966B] hover:bg-[#1e805b] text-white font-semibold text-xs tracking-wide transition flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>Connect Field Terminal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#E3E8ED] text-center text-[11px] text-[#64748B]">
          <a href="/" className="hover:underline text-[#3985C6]">← Back to Public Gateway</a>
        </div>
      </div>
    </div>
  );
};
