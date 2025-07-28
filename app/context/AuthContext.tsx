'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  ip: '10.250.0.22', // Hardcoded IP as per requirements
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

  // Check for saved session on app load
  useEffect(() => {
    const savedAuth = localStorage.getItem('cairAuth');
    if (savedAuth) {
      try {
        const authData = JSON.parse(savedAuth);
        const now = new Date().getTime();
        
        // Handle both old and new session formats
        if (authData.connectionDetails) {
          // Old format with connectionDetails
          if (authData.expiresAt && now < authData.expiresAt) {
            setConnectionDetails(authData.connectionDetails);
          } else {
            // Session expired, clear it
            localStorage.removeItem('cairAuth');
          }
        } else if (authData.sessionToken) {
          // New session token format - clear it since we're back to old format
          localStorage.removeItem('cairAuth');
        } else {
          // Unknown format, clear it
          localStorage.removeItem('cairAuth');
        }
      } catch (error) {
        // Invalid stored data, clear it
        localStorage.removeItem('cairAuth');
      }
    }
  }, []);

  const clearAuth = () => {
    setConnectionDetails(defaultConnectionDetails);
    // Clear localStorage session
    localStorage.removeItem('cairAuth');
  };

  return (
    <AuthContext.Provider value={{ connectionDetails, setConnectionDetails, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}