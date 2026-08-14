'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface Admin {
  id: string;
  email: string;
  role: 'ADMIN' | 'SUPERADMIN';
}

const AdminContext = createContext<Admin | null>(null);

export function AdminProvider({ admin, children }: { admin: Admin; children: ReactNode }) {
  return <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>;
}

/**
 * Administrateur courant. Non nul dans tout sous-arbre de /admin — le layout
 * ne rend ses enfants qu'une fois /api/admin/me confirmé.
 */
export function useAdmin(): Admin | null {
  return useContext(AdminContext);
}
