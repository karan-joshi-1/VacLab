'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ConnectionDetails = {
  ip: string;
  hostname: string;
  isAuthenticated: boolean;
  sessionToken?: string;
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
        
        // Validate session token with server
        if (authData.sessionToken) {
          fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken: authData.sessionToken })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setConnectionDetails({
                ...data.sessionData,
                sessionToken: authData.sessionToken
              });
            } else {
              // Invalid or expired session
              localStorage.removeItem('cairAuth');
            }
          })
          .catch(() => {
            // Network error or server issue
            localStorage.removeItem('cairAuth');
          });
        } else {
          // Old format without session token, clear it
          localStorage.removeItem('cairAuth');
        }
      } catch (error) {
        // Invalid stored data, clear it
        localStorage.removeItem('cairAuth');
      }
    }
  }, []);

  const clearAuth = () => {
    // If we have a session token, invalidate it on server
    if (connectionDetails.sessionToken) {
      fetch('/api/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken: connectionDetails.sessionToken })
      }).catch(() => {
        // Ignore errors during logout
      });
    }
    
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