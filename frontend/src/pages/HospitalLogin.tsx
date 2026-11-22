import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const HospitalLogin: React.FC = () => {
  const [hospitalId, setHospitalId] = useState('HOSP-01');
  const [accessCode, setAccessCode] = useState('KR-MED-8492');
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalId || !accessCode) {
      setError('Please provide hospital identity and access key.');
      return;
    }
    login('hospital', 'K.R. Hospital, Mysuru', hospitalId);
    navigate('/hospital/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#F5F7F9] flex flex-col justify-center items-center p-4 font-sans select-none">
      <div className="w-full max-w-md bg-white border border-[#E3E8ED] rounded-xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-[#3985C6] text-white flex items-center justify-center font-bold text-lg shadow-sm">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base text-[#17212B] tracking-tight">ATLAS Hospital Portal</h1>
            <p className="text-xs text-[#64748B]">Emergency Care & Patient Intake Network</p>
          </div>
        </div>

        <div className="mb-5 p-3 rounded-lg bg-[#3985C6]/10 border border-[#3985C6]/20 text-xs text-[#3985C6] leading-relaxed">
          <div className="font-semibold flex items-center gap-1.5 mb-0.5">
            <ShieldCheck className="w-4 h-4 text-[#3985C6]" />
            <span>Facility Access Verification</span>
          </div>
          Restricted to accredited healthcare triage desk personnel.
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded bg-[#E23B3B]/10 border border-[#E23B3B]/20 text-xs text-[#E23B3B] flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#17212B] mb-1">Registered Facility</label>
            <select
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E3E8ED] bg-[#F5F7F9] focus:bg-white focus:outline-none focus:border-[#F26536] text-[#17212B]"
            >
              <option value="HOSP-01">K.R. Hospital, Mysuru (Govt Medical College)</option>
              <option value="HOSP-02">Apollo BGS Hospitals, Kuvempunagar</option>
              <option value="HOSP-03">Cauvery Multi Speciality Hospital</option>
              <option value="HOSP-04">Columbia Asia Hospital (Manipal)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#17212B] mb-1">Assigned Access Code / Token</label>
            <input
              type="password"
              required
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E3E8ED] bg-[#F5F7F9] focus:bg-white focus:outline-none focus:border-[#F26536] text-[#17212B]"
            />
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-2.5 rounded-lg bg-[#3985C6] hover:bg-[#2c72af] text-white font-semibold text-xs tracking-wide transition flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>Access Clinical Portal</span>
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
