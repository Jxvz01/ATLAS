import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const AdminLogin: React.FC = () => {
  const [username, setUsername] = useState('admin@atlas.seoc.gov.in');
  const [password, setPassword] = useState('demo-admin-pass');
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please provide credentials.');
      return;
    }
    login('admin', 'State Emergency Operations Center (SEOC)', username);
    navigate('/admin/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#F5F7F9] flex flex-col justify-center items-center p-4 font-sans select-none">
      <div className="w-full max-w-md bg-white border border-[#E3E8ED] rounded-xl p-8 shadow-sm">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-[#F26536] text-white flex items-center justify-center font-black text-lg shadow-sm">
            Δ
          </div>
          <div>
            <h1 className="font-bold text-base text-[#17212B] tracking-tight">ATLAS Command</h1>
            <p className="text-xs text-[#64748B]">State Emergency Operations Center</p>
          </div>
        </div>

        <div className="mb-5 p-3 rounded-lg bg-[#3985C6]/10 border border-[#3985C6]/20 text-xs text-[#3985C6] leading-relaxed">
          <div className="font-semibold flex items-center gap-1.5 mb-0.5">
            <ShieldCheck className="w-4 h-4 text-[#3985C6]" />
            <span>Authorized Operations Access Only</span>
          </div>
          Restricted to command staff. Demonstration mode: pre-filled with demo clearance credentials.
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded bg-[#E23B3B]/10 border border-[#E23B3B]/20 text-xs text-[#E23B3B] flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[#17212B] mb-1">Commander ID / Official Email</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E3E8ED] bg-[#F5F7F9] focus:bg-white focus:outline-none focus:border-[#F26536] text-[#17212B]"
            />
          </div>

          <div>
            <label className="block font-semibold text-[#17212B] mb-1">Security Access Key / Passcode</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E3E8ED] bg-[#F5F7F9] focus:bg-white focus:outline-none focus:border-[#F26536] text-[#17212B]"
            />
          </div>

          <button
            type="submit"
            className="w-full mt-2 py-2.5 rounded-lg bg-[#F26536] hover:bg-[#d95529] text-white font-semibold text-xs tracking-wide transition flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>Authenticate Command Access</span>
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
