'use client'
import { createContext, useContext, useState, ReactNode } from 'react';

type ConnectionDetails = {
  ip: string;
  hostname: string;
  password: string;
  isAuthenticated: boolean;
};

interface AuthContextType {
  connectionDetails: ConnectionDetails;
  setConnectionDetails: (details: ConnectionDetails) => void;
  clearAuth: () => void;
}

// Default connection details
const defaultConnectionDetails: ConnectionDetails = {
  ip: '10.250.0.22', // Hardcoded IP as per your requirements
  hostname: '',
  password: '',
  isAuthenticated: false,
};

// Create the auth context
const AuthContext = createContext<AuthContextType>({
  connectionDetails: defaultConnectionDetails,
  setConnectionDetails: () => {},
  clearAuth: () => {},
});

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

// Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails>(defaultConnectionDetails);

  const clearAuth = () => {
    setConnectionDetails(defaultConnectionDetails);
  };

  return (
    <AuthContext.Provider value={{ connectionDetails, setConnectionDetails, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}