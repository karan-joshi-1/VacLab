'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import MlLoader from "./features/mlLoader"
import JsonEditor from "./features/jsonEditor"
import FileUploader from "./features/fileUploader"
import { useAuth } from './context/AuthContext'

export default function Home() {
  const router = useRouter()
  const { connectionDetails } = useAuth()
  
  // Shared state for JSON data between MlLoader and JsonEditor
  const [sharedJsonData, setSharedJsonData] = useState<any>(null)

  // Redirect to auth page if not authenticated
  useEffect(() => {
    if (!connectionDetails.isAuthenticated) {
      router.push('/auth')
    }
  }, [connectionDetails.isAuthenticated, router])

  // If authenticated, this will show the dashboard with components laid out as requested
  return (
    <main className="flex min-h-screen flex-col">
      {/* Connection status bar */}
      <div className="bg-gray-800 border-b border-gray-700 p-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-300">
              Connected as: <span className="font-medium">{connectionDetails.hostname}</span> to <span className="font-bold">CAIR.LOGIN</span>
            </span>
          </div>
          <h1 className="text-xl font-bold text-white">VMES Platform</h1>
        </div>
      </div>

      {/* Content area with components in the requested layout */}
      <div className="flex-1 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
          {/* Left side: stacked MlLoader (top) and FileUploader (bottom) */}
          <div className="flex flex-col gap-4">
            {/* MlLoader in top left - pass setSharedJsonData to update JSON data */}
            <div className="bg-gray-900 rounded-lg shadow-lg">
              <MlLoader onJsonChange={setSharedJsonData} />
            </div>
            
            {/* FileUploader in bottom left */}
            <div className="bg-gray-900 rounded-lg shadow-lg overflow-auto">
              <FileUploader />
            </div>
          </div>
          
          {/* JsonEditor takes full height on the right side - pass sharedJsonData */}
          <div className="lg:row-span-2 bg-gray-900 rounded-lg shadow-lg">
            <JsonEditor importedJson={sharedJsonData} onJsonChange={setSharedJsonData} />
          </div>
        </div>
      </div>
    </main>
  )
}