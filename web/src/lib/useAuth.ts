import { createContext, useContext } from 'react';
import type { AuthUser } from './auth';

export const AuthContext = createContext<AuthUser | null>(null);

/** The signed-in user (always set inside the app's signed-in pages). */
export const useAuth = () => useContext(AuthContext);
