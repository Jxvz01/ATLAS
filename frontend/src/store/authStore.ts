import { create } from 'zustand';

export type UserRole = 'admin' | 'hospital' | 'rescuer' | 'civilian' | null;

interface AuthState {
  role: UserRole;
  userName: string | null;
  entityId: string | null; // e.g. 'HOSP-01', 'R-04'
  isAuthenticated: boolean;
  login: (role: UserRole, userName: string, entityId?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  role: (localStorage.getItem('atlas_auth_role') as UserRole) || null,
  userName: localStorage.getItem('atlas_auth_user') || null,
  entityId: localStorage.getItem('atlas_auth_entity') || null,
  isAuthenticated: Boolean(localStorage.getItem('atlas_auth_role')),

  login: (role, userName, entityId) => {
    if (role) {
      localStorage.setItem('atlas_auth_role', role);
      localStorage.setItem('atlas_auth_user', userName);
      if (entityId) localStorage.setItem('atlas_auth_entity', entityId);
      set({ role, userName, entityId: entityId || null, isAuthenticated: true });
    }
  },

  logout: () => {
    localStorage.removeItem('atlas_auth_role');
    localStorage.removeItem('atlas_auth_user');
    localStorage.removeItem('atlas_auth_entity');
    set({ role: null, userName: null, entityId: null, isAuthenticated: false });
  }
}));
