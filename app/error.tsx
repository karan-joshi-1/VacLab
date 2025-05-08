'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <div className="h-2 w-2 bg-red-500 rounded-full"></div>
          <h2 className="text-lg font-medium text-gray-200">Something went wrong</h2>
        </div>
        
        <p className="text-gray-400 mb-6">
          {error.message || 'An unexpected error occurred.'}
        </p>
        
        <button
          onClick={() => reset()}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded transition duration-200"
        >
          Try again
        </button>
      </div>
    </main>
  )
}