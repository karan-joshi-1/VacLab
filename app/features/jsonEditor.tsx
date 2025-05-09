'use client'
import { useState, ComponentType, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '../context/AuthContext';

// Define the prop types for ReactJson component
interface ReactJsonProps {
  src: object;
  theme?: string;
  name?: string | false;
  iconStyle?: 'circle' | 'triangle' | 'square';
  indentWidth?: number;
  collapsed?: boolean | number;
  collapseStringsAfterLength?: number | false;
  displayDataTypes?: boolean;
  displayObjectSize?: boolean;
  enableClipboard?: boolean;
  onEdit?: (edit: { updated_src: object }) => boolean;
  onAdd?: (add: { updated_src: object }) => boolean;
  onDelete?: (deleteObj: { updated_src: object }) => boolean;
  style?: React.CSSProperties;
}

// Define the props for our JsonEditor component
interface JsonEditorProps {
  importedJson?: any;  // Can be a string or an object or null
  onJsonChange?: ((json: any) => void) | null;  // Properly typed as an optional function or null
  fileName?: string;  // Add fileName prop to display in the header
}

// Correct dynamic import with proper typing
const ReactJson = dynamic(
  () => import('react-json-view').then((mod) => mod.default) as unknown as Promise<ComponentType<ReactJsonProps>>,
  { ssr: false }
);

export default function JsonEditor({ importedJson = null, onJsonChange = null, fileName = 'modelConfig.json' }: JsonEditorProps) {
    // Get connection details for SFTP upload
    const { connectionDetails } = useAuth();
    
    // Sample JSON data - will be overridden if importedJson is provided
    const [jsonData, setJsonData] = useState({
        name: "ML Model Parameters",
        version: "1.0.0",
        description: "Configuration for ML Model",
        parameters: {
            learning_rate: 0.01,
            batch_size: 64,
            epochs: 100,
            optimizer: "adam"
        },
        hyperparameters: {
            dropout_rate: 0.25,
            regularization: 0.001
        }
    });

    // Default file name based on the JSON content , could be used to dynamically set the file name
    const [currentFileName, setCurrentFileName] = useState(fileName);

    // When importedJson changes, update the jsonData state
    useEffect(() => {
        if (importedJson) {
            try {
                // If importedJson is a string, parse it
                const parsedData = typeof importedJson === 'string'
                    ? JSON.parse(importedJson)
                    : importedJson;
                setJsonData(parsedData);

                
            } catch (error) {
                console.error('Error parsing imported JSON:', error);
            }
        }
    }, [importedJson, fileName]);

    // Update file name when the fileName prop changes
    useEffect(() => {
        setCurrentFileName(fileName);
    }, [fileName]);

    // Handle changes to the JSON data
    const handleOnChange = (edit: { updated_src: any }) => {
        setJsonData(edit.updated_src);
        if (onJsonChange) {
            onJsonChange(edit.updated_src);
        }
        return true; // Return true to allow the edit
    };

    // Handle adding new values to the JSON
    const handleOnAdd = (add: { updated_src: any }) => {
        setJsonData(add.updated_src);
        if (onJsonChange) {
            onJsonChange(add.updated_src);
        }
        return true; // Return true to allow the addition
    };

    // Handle deleting values from the JSON
    const handleOnDelete = (deleteObj: { updated_src: any }) => {
        setJsonData(deleteObj.updated_src);
        if (onJsonChange) {
            onJsonChange(deleteObj.updated_src);
        }
        return true; // Return true to allow the deletion
    };

    // Function to download the JSON data
    const handleDownload = () => {
        const dataStr = JSON.stringify(jsonData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = currentFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Function to copy JSON to clipboard
    const handleCopyToClipboard = () => {
        navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2))
            .then(() => {
                alert('JSON copied to clipboard!');
            })
            .catch(err => {
                console.error('Failed to copy: ', err);
                alert('Failed to copy JSON to clipboard');
            });
    };
    
    // Function to send JSON to FileUploader
    const handleSendToSFTPUploader = () => {
        // Create custom event to pass JSON data to FileUploader
        const jsonStr = JSON.stringify(jsonData, null, 2);
        const event = new CustomEvent('openInFileUploader', { 
            detail: { 
                jsonContent: jsonStr,
                fileName: currentFileName 
            } 
        });
        document.dispatchEvent(event);
    };

    return (
        <div className="w-full mx-auto">
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center">
                        <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className="h-5 w-5 text-blue-400 mr-2" 
                            viewBox="0 0 20 20" 
                            fill="currentColor"
                        >
                            <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm0 2h4v3a1 1 0 001 1h3v8H6V4z" clipRule="evenodd" />
                        </svg>
                        <h2 className="text-xl font-semibold text-gray-200 truncate max-w-xs" title={currentFileName}>
                            {currentFileName}
                        </h2>
                    </div>
                    <div className="space-x-2 flex">
                        <button 
                            onClick={handleSendToSFTPUploader}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded flex items-center"
                            title="Send to SFTP server"
                        >
                            <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                className="h-3.5 w-3.5 mr-1" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                            >
                                <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                                />
                            </svg>
                            Upload
                        </button>
                        <button 
                            onClick={handleCopyToClipboard}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                        >
                            Copy
                        </button>
                        <button 
                            onClick={handleDownload}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
                        >
                            Download
                        </button>
                    </div>
                </div>
                {/* Scrollable container for the JSON editor */}
                <div className="max-h-[680px] overflow-y-auto custom-scrollbar">
                    {/* Pass props directly to the component with proper typing */}
                    <ReactJson
                        src={jsonData}
                        theme="monokai"
                        name={false}
                        iconStyle="triangle"
                        indentWidth={.5}
                        collapsed={false}
                        collapseStringsAfterLength={50}
                        displayDataTypes={true}
                        displayObjectSize={true}
                        enableClipboard={true}
                        onEdit={handleOnChange}
                        onAdd={handleOnAdd}
                        onDelete={handleOnDelete}
                        style={{ padding: '10px', borderRadius: '4px' }}
                    />
                </div>
            </div>
        </div>
    );
}