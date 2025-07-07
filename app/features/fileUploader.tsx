'use client'
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import CommandOutput from './CommandOutput';

interface FileUploaderProps {
  onJsonUpload?: (jsonData: any, fileName: string) => void;
}

export default function FileUploader({ onJsonUpload }: FileUploaderProps) {
  // Use the auth context to get user information
  const { connectionDetails } = useAuth();
  const router = useRouter();
  
  // Create base home directory from connection details
  const baseHomeDir = `/home/${connectionDetails.hostname || 'username'}/loading`;
  
  // Use the home directory as default
  const [remoteDir, setRemoteDir] = useState<string>(baseHomeDir);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{
    status: 'idle' | 'uploading' | 'success' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // JSON file states - we keep the content but don't show textarea
  const [jsonFileName, setJsonFileName] = useState<string>('data.json');
  const [jsonMode, setJsonMode] = useState<boolean>(false);
  const [jsonContent, setJsonContent] = useState<string>('{}');

  // Add state for command execution
  const [commandFormData, setCommandFormData] = useState<FormData | undefined>(undefined);
  const [showCommandOutput, setShowCommandOutput] = useState(false);
  
  // Listen for events from JsonEditor to open content directly in FileUploader
  useEffect(() => {
    const handleOpenInFileUploader = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        const { jsonContent: content, fileName } = customEvent.detail;
        setJsonContent(content);
        setJsonFileName(fileName || 'data.json');
        setJsonMode(true);
        // Create a file object for display
        const file = new File([content], fileName, { type: 'application/json' });
        setSelectedFile(file);
        
        // Parse and pass JSON data to parent component
        if (onJsonUpload) {
          try {
            const parsedJson = JSON.parse(content);
            onJsonUpload(parsedJson, fileName || 'data.json');
          } catch (error) {
            console.error('Error parsing JSON content:', error);
          }
        }
      }
    };
    
    document.addEventListener('openInFileUploader', handleOpenInFileUploader);
    
    return () => {
      document.removeEventListener('openInFileUploader', handleOpenInFileUploader);
    };
  }, [onJsonUpload]);
  
  // Handle authentication redirect
  useEffect(() => {
    if (!connectionDetails.isAuthenticated) {
      setIsRedirecting(true);
      router.push('/auth');
    }
  }, [connectionDetails.isAuthenticated, router]);

  // If redirecting, show a loading state
  if (isRedirecting) {
    return (
      <div className="p-6 w-full mx-auto">
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-400">Redirecting to login page...</p>
        </div>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadStatus({ status: 'idle', message: '' });
      setShowCommandOutput(false);
      setCommandFormData(undefined);
      
      // If file is JSON, set JSON mode and extract content
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        setJsonMode(true);
        setJsonFileName(file.name);
        
        // Read file content
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setJsonContent(content);
          
          // Parse and pass JSON data to parent component
          if (onJsonUpload) {
            try {
              const parsedJson = JSON.parse(content);
              onJsonUpload(parsedJson, file.name);
            } catch (error) {
              console.error('Error parsing JSON file:', error);
            }
          }
        };
        reader.readAsText(file);
      } else {
        setJsonMode(false);
      }
    }
  };

  // Validate and update the remote directory path
  const handleDirectoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPath = e.target.value;
    
    // Always ensure path starts with a slash
    const formattedPath = newPath.startsWith('/') ? newPath : `/${newPath}`;
    
    // Check if the path starts with the user's home directory
    if (!formattedPath.startsWith(baseHomeDir)) {
      setPathError(`Path must start with your home directory: ${baseHomeDir}`);
    } else {
      setPathError(null);
    }
    
    setRemoteDir(formattedPath);
  };

  // Toggle between file upload and JSON creation
  const toggleJsonMode = () => {
    setJsonMode(!jsonMode);
    if (selectedFile && !selectedFile.name.endsWith('.json')) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    setUploadStatus({ status: 'idle', message: '' });
    setShowCommandOutput(false);
    setCommandFormData(undefined);
  };

  // Handle JSON file name change
  const handleJsonFileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let name = e.target.value;
    if (!name.endsWith('.json')) {
      name += '.json';
    }
    setJsonFileName(name);
    
    // Update selectedFile display name too if it exists
    if (selectedFile && jsonMode) {
      const updatedFile = new File([selectedFile], name, { type: 'application/json' });
      setSelectedFile(updatedFile);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate path before upload
    if (!remoteDir.startsWith(baseHomeDir)) {
      setUploadStatus({
        status: 'error',
        message: `Upload path must be within your home directory: ${baseHomeDir}`
      });
      return;
    }

    let fileToUpload: File | null = selectedFile;
    
    // If in JSON mode, create a file from JSON content
    if (jsonMode) {
      try {
        // Validate JSON if we're in JSON mode
        JSON.parse(jsonContent); // This will throw if invalid JSON
        fileToUpload = new File([jsonContent], jsonFileName, { type: 'application/json' });
        setSelectedFile(fileToUpload); // Update the displayed file too
      } catch (error) {
        setUploadStatus({
          status: 'error',
          message: 'Invalid JSON format. Please check your JSON content.'
        });
        return;
      }
    } else if (!fileToUpload) {
      setUploadStatus({
        status: 'error',
        message: 'Please select a file to upload'
      });
      return;
    }
    
    // Create form data
    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('remoteDir', remoteDir);
    formData.append('connectionDetails', JSON.stringify(connectionDetails));
    
    setUploadStatus({ status: 'uploading', message: 'Uploading file...' });
    
    try {
      // First upload the file
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const uploadResult = await uploadResponse.json();
      
      if (uploadResponse.ok) {
        setUploadStatus({
          status: 'success',
          message: uploadResult.message || 'File uploaded successfully'
        });

        // Only show the command output component - do not execute any API calls here
        // The CommandOutput component will handle the model-run API call
        setShowCommandOutput(true);
        
        // Create a new FormData object with a flag to prevent double execution
        const commandFormData = new FormData();
        commandFormData.append('file', fileToUpload);
        commandFormData.append('remoteDir', remoteDir);
        commandFormData.append('connectionDetails', JSON.stringify(connectionDetails));
        
        // Set the form data for CommandOutput to use
        setCommandFormData(commandFormData);

        // Reset file input if we're not in JSON mode
        if (!jsonMode && fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        setUploadStatus({
          status: 'error',
          message: uploadResult.message || 'Upload failed'
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus({
        status: 'error',
        message: 'Upload failed due to a network error. Please try again.'
      });
    }
  };
  
  const statusColors = {
    idle: 'bg-transparent',
    uploading: 'bg-blue-900/50 border-blue-700',
    success: 'bg-green-900/50 border-green-700',
    error: 'bg-red-900/50 border-red-700',
  };
  
  const statusTextColors = {
    idle: 'text-gray-400',
    uploading: 'text-blue-400',
    success: 'text-green-400',
    error: 'text-red-400',
  };

  return (
    <div className={`w-full ${showCommandOutput ? 'p-2' : 'p-4'}`}>
      <div className={`bg-gray-800 rounded-lg shadow-lg ${showCommandOutput ? 'p-3' : 'p-4'}`}>
        {/* Simple header showing file being uploaded */}
        <div className={`flex justify-between items-center border-b border-gray-700 ${showCommandOutput ? 'mb-2 pb-2' : 'mb-4 pb-3'}`}>
          <div className="flex items-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-5 w-5 ${jsonMode ? 'text-blue-400' : 'text-gray-400'} mr-2`}
              viewBox="0 0 20 20" 
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm0 2h4v3a1 1 0 001 1h3v8H6V4z" clipRule="evenodd" />
            </svg>
            <h2 className="text-lg font-medium text-gray-200">
              {selectedFile ? 'Upload File: ' + selectedFile.name : 'Upload File'}
            </h2>
          </div>
          
          {/* Only show file select button if it's a JSON file already */}
          {jsonMode && selectedFile && (
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded"
            >
              Select Different File
            </button>
          )}
        </div>

        <form onSubmit={handleUpload} className={`${showCommandOutput ? 'space-y-2' : 'space-y-4'}`}>
          {/* Remote directory input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Remote Directory Path
            </label>
            <input
              type="text"
              value={remoteDir}
              onChange={handleDirectoryChange}
              className={`w-full px-4 py-2 rounded-md bg-gray-700 border ${
                pathError ? 'border-red-500' : 'border-gray-600'
              } text-white`}
              placeholder={baseHomeDir}
            />
            {pathError ? (
              <p className="mt-1 text-xs text-red-400">{pathError}</p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                Path must be within your home directory: {baseHomeDir}
              </p>
            )}
          </div>
          
          {/* File selection */}
          {!selectedFile ? (
            <div 
              onClick={() => fileInputRef.current?.click()} 
              className="border border-gray-700/50 rounded p-6 bg-gray-800/30 hover:bg-gray-800/50 transition-colors cursor-pointer"
            >
              <input
                type="file"
                onChange={handleFileChange}
                className="hidden"
                ref={fileInputRef}
                id="fileInput"
              />
              <div className="flex flex-col items-center justify-center ">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-10 text-gray-400"
                  fill="none"
                  viewBox="24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-sm text-gray-300 font-medium">Click to select a file</p>
              </div>
            </div>
          ) : (
            <>
              {/* File details */}
              <div className="border border-gray-700/50 rounded p-4 bg-gray-800/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-gray-700 p-2 rounded">
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className={`h-6 w-6 ${jsonMode ? 'text-blue-400' : 'text-gray-300'}`}
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={1.5} 
                          d={jsonMode 
                            ? "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" 
                            : "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          } 
                        />
                      </svg>
                    </div>
                    <div>
                      {jsonMode ? (
                        <input
                          type="text"
                          value={jsonFileName}
                          onChange={handleJsonFileNameChange}
                          className="bg-transparent border-b border-gray-600 px-2 py-1 text-white focus:border-blue-400 focus:outline-none"
                        />
                      ) : (
                        <p className="text-gray-200 font-medium">{selectedFile.name}</p>
                      )}
                      <p className="text-xs text-gray-400">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setJsonContent('{}');
                      setShowCommandOutput(false);
                      setCommandFormData(undefined);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-gray-400 hover:text-white p-1"
                    title="Remove file"
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-5 w-5" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={1.5} 
                        d="M6 18L18 6M6 6l12 12" 
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
          
          {/* Upload status */}
          {uploadStatus.message && (
            <div className={`p-3 border rounded-md ${statusColors[uploadStatus.status]}`}>
              <p className={`text-sm ${statusTextColors[uploadStatus.status]}`}>
                {uploadStatus.message}
              </p>
            </div>
          )}
          
          {/* Upload button */}
          <button
            type="submit"
            disabled={uploadStatus.status === 'uploading' || !selectedFile || !!pathError}
            className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md shadow-sm transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadStatus.status === 'uploading' 
              ? 'Uploading...' 
              : `Upload & Run ${selectedFile ? selectedFile.name : ''}`}
          </button>
        </form>

        {/* Command Output Component */}
        {showCommandOutput && (
          <div className="mt-4">
            <CommandOutput formData={commandFormData} />
          </div>
        )}
      </div>
    </div>
  );
}