import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAtlasStore } from './store/atlasStore';
import { networkMonitor } from './services/networkMonitor';
import { offlineQueue } from './services/offlineQueue';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { AdminLogin } from './pages/AdminLogin';
import { HospitalLogin } from './pages/HospitalLogin';
import { RescuerLogin } from './pages/RescuerLogin';
import { AdminPortal } from './pages/AdminPortal';
import { HospitalPortal } from './pages/HospitalPortal';
import { RescuerPortal } from './pages/RescuerPortal';
import { CitizenApp } from './pages/CitizenApp';

export const App: React.FC = () => {
  const { fetchState, refreshNetworkState } = useAtlasStore();

  useEffect(() => {
    // Initial state fetch & queue flush
    fetchState();
    offlineQueue.flush();

    const handleOnline = () => {
      refreshNetworkState();
      offlineQueue.flush(true).then(() => fetchState());
    };
    const handleOffline = () => refreshNetworkState();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Adaptive polling based on ONLINE / LOW_BANDWIDTH (2G) / OFFLINE
    let timer: any;
    const scheduleNext = () => {
      const intervalMs = networkMonitor.getAdaptivePollIntervalMs();
      timer = setTimeout(async () => {
        await fetchState();
        await offlineQueue.flush();
        scheduleNext();
      }, intervalMs);
    };
    scheduleNext();

    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchState, refreshNetworkState]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#F5F7F9] text-[#17212B] font-sans antialiased">
        <Routes>
          {/* Public Gateway & Authentication Pages */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/hospital/login" element={<HospitalLogin />} />
          <Route path="/rescue/login" element={<RescuerLogin />} />

          {/* Admin Command Center (Protected: Admin role) */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminPortal />
              </ProtectedRoute>
            }
          />
          {/* Redirect /admin to /admin/dashboard */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

          {/* Hospital Portal (Protected: Hospital role) */}
          <Route
            path="/hospital/dashboard"
            element={
              <ProtectedRoute allowedRoles={['hospital']}>
                <HospitalPortal />
              </ProtectedRoute>
            }
          />
          {/* Redirect /hospital to /hospital/dashboard */}
          <Route path="/hospital" element={<Navigate to="/hospital/dashboard" replace />} />

          {/* Rescuer Portal (Protected: Rescuer role) */}
          <Route
            path="/rescue/dashboard"
            element={
              <ProtectedRoute allowedRoles={['rescuer']}>
                <RescuerPortal />
              </ProtectedRoute>
            }
          />
          {/* Redirect /rescue and /rescuer to /rescue/dashboard */}
          <Route path="/rescue" element={<Navigate to="/rescue/dashboard" replace />} />
          <Route path="/rescuer" element={<Navigate to="/rescue/dashboard" replace />} />

          {/* Civilian Mobile Application (Publicly accessible) */}
          <Route path="/app" element={<CitizenApp />} />

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

export default App;
