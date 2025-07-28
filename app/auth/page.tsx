'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../context/AuthContext'

export default function AuthPage() {
  // Hardcoded random IP 
  const hardcodedIp = '10.250.0.22'
  
  const [hostname, setHostname] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { setConnectionDetails } = useAuth()

  // Hardcoded 5-digit PIN
  const correctPin = '13425'

  // Check for existing session on component mount
  useEffect(() => {
    const savedAuth = localStorage.getItem('cairAuth')
    if (savedAuth) {
      try {
        const authData = JSON.parse(savedAuth)
        
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
              })
              router.push('/')
            } else {
              // Invalid or expired session
              localStorage.removeItem('cairAuth')
            }
          })
          .catch(() => {
            // Network error or server issue
            localStorage.removeItem('cairAuth')
          })
        } else {
          // Old format without session token, clear it
          localStorage.removeItem('cairAuth')
        }
      } catch (error) {
        // Invalid stored data, clear it
        localStorage.removeItem('cairAuth')
      }
    }
  }, [router, setConnectionDetails])

  function handlePinChange(value: string) {
    // Only allow digits and limit to 5 characters
    const digitsOnly = value.replace(/\D/g, '').slice(0, 5)
    setPin(digitsOnly)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    
    // Validate credentials
    if (!password) {
      setError('Please provide a password')
      setIsLoading(false)
      return
    }

    if (!pin) {
      setError('Please provide a 5-digit PIN')
      setIsLoading(false)
      return
    }

    if (pin.length !== 5) {
      setError('PIN must be exactly 5 digits')
      setIsLoading(false)
      return
    }

    if (pin !== correctPin) {
      setError('Incorrect PIN')
      setIsLoading(false)
      return
    }
    
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ip: hardcodedIp, 
          hostname, 
          password
        }),
      })
      
      const data = await res.json()
      
      if (res.ok) {
        // Server returned session token
        const { sessionToken, expiresAt } = data
        
        const connectionDetails = {
          ip: hardcodedIp,
          hostname,
          isAuthenticated: true,
          sessionToken
        }
        
        setConnectionDetails(connectionDetails)
        
        // Save session token to localStorage (no password!)
        localStorage.setItem('cairAuth', JSON.stringify({
          sessionToken,
          expiresAt
        }))
        
        router.push('/')
      } else {
        setError(data.message || 'Authentication failed')
        console.error('Server error:', data.originalError || data.message)
      }
    } catch (err) {
      setError('Connection error. Please try again.')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md p-8">
        <form
          onSubmit={handleSubmit}
          className="bg-gray-800 p-8 rounded-lg shadow-2xl border border-gray-700"
        >
          <h1 className="text-3xl font-bold mb-6 text-white text-center">CAIR LOGIN</h1>
          
          {error && (
            <div className="mb-6 p-3 bg-red-900/50 border border-red-700 rounded-md">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          
          <div className="space-y-6">
            <label className="block">
              <span className="text-gray-300 text-sm font-medium block mb-1">Host Name</span>
              <input
                type="text"
                value={hostname}
                onChange={e => setHostname(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-md bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter host name"
              />
            </label>
            
            <label className="block">
              <span className="text-gray-300 text-sm font-medium block mb-1">Password</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-md bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter password"
              />
            </label>

            <label className="block">
              <span className="text-gray-300 text-sm font-medium block mb-1"> PIN</span>
              <input
                type="password"
                value={pin}
                onChange={e => handlePinChange(e.target.value)}
                maxLength={5}
                required
                className="w-full px-4 py-3 text-center text-lg tracking-widest rounded-md bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="•••••"
              />
            </label>
            
            <button
              type="submit"
              disabled={isLoading || pin.length !== 5}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md shadow-sm transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Connecting...' : 'Connect to Host'}
            </button>
          </div>
          
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500">
              Secure connection to CAIR
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}