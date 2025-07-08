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

    // Function to convert string values to appropriate types
    const convertValueType = (value: any): any => {
        // If it's not a string, return as-is
        if (typeof value !== 'string') {
            return value;
        }

        const originalValue = value;

        // Handle empty string
        if (value.trim() === '') {
            return '';
        }

        // Check for boolean values (case insensitive)
        const lowerValue = value.toLowerCase().trim();
        if (lowerValue === 'true') {
            console.log(`Converted "${originalValue}" to boolean: true`);
            return true;
        }
        if (lowerValue === 'false') {
            console.log(`Converted "${originalValue}" to boolean: false`);
            return false;
        }
        if (lowerValue === 'null') {
            console.log(`Converted "${originalValue}" to null`);
            return null;
        }

        // Check for numbers
        if (/^-?\d+$/.test(value.trim())) {
            // Integer
            const intValue = parseInt(value.trim(), 10);
            if (!isNaN(intValue)) {
                console.log(`Converted "${originalValue}" to integer: ${intValue}`);
                return intValue;
            }
        }

        if (/^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(value.trim())) {
            // Float/decimal
            const floatValue = parseFloat(value.trim());
            if (!isNaN(floatValue)) {
                console.log(`Converted "${originalValue}" to float: ${floatValue}`);
                return floatValue;
            }
        }

        // Return as string if no other type matches
        console.log(`Keeping "${originalValue}" as string`);
        return value;
    };

    // Function to recursively convert types in an object
    const convertObjectTypes = (obj: any): any => {
        if (Array.isArray(obj)) {
            return obj.map(item => convertObjectTypes(item));
        }
        
        if (obj !== null && typeof obj === 'object') {
            const converted: any = {};
            for (const [key, value] of Object.entries(obj)) {
                converted[key] = convertObjectTypes(value);
            }
            return converted;
        }
        
        return convertValueType(obj);
    };

    // Handle changes to the JSON data
    const handleOnChange = (edit: { updated_src: any }) => {
        const convertedData = convertObjectTypes(edit.updated_src);
        setJsonData(convertedData);
        if (onJsonChange) {
            onJsonChange(convertedData);
        }
        return true; // Return true to allow the edit
    };

    // Handle adding new values to the JSON
    const handleOnAdd = (add: { updated_src: number | string | boolean | null | object | Array<any> }) => {
        const convertedData = convertObjectTypes(add.updated_src);
        setJsonData(convertedData);
        if (onJsonChange) {
            onJsonChange(convertedData);
        }
        return true; // Return true to allow the addition
    };

    // Handle deleting values from the JSON
    const handleOnDelete = (deleteObj: { updated_src: any }) => {
        const convertedData = convertObjectTypes(deleteObj.updated_src);
        setJsonData(convertedData);
        if (onJsonChange) {
            onJsonChange(convertedData);
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
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #374151;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #6B7280;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #9CA3AF;
                }
                /* Custom styles for react-json-view to handle long strings */
                .react-json-view .object-key-val span {
                    word-break: break-all !important;
                    overflow-wrap: break-word !important;
                    white-space: pre-wrap !important;
                }
                .react-json-view .string-value {
                    word-break: break-all !important;
                    overflow-wrap: break-word !important;
                    white-space: pre-wrap !important;
                }
            `}</style>
            <div className="bg-gray-800 p-4 rounded-lg shadow-lg">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center min-w-0 flex-1 mr-4">
                        <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className="h-5 w-5 text-blue-400 mr-2 flex-shrink-0" 
                            viewBox="0 0 20 20" 
                            fill="currentColor"
                        >
                            <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm0 2h4v3a1 1 0 001 1h3v8H6V4z" clipRule="evenodd" />
                        </svg>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-xl font-semibold text-gray-200 break-all" title={currentFileName}>
                                {currentFileName}
                            </h2>
                            {currentFileName.length > 30 && (
                                <p className="text-xs text-gray-400 mt-1 font-mono break-all">
                                    {currentFileName}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="space-x-2 flex flex-shrink-0">
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
                
                {/* Type conversion info */}
                <div className="mb-3 p-2 bg-gray-700/50 rounded text-xs text-gray-300">
                    <div className="flex items-center mb-1">
                        <svg className="h-3 w-3 mr-1 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <span className="font-medium">Auto Type Conversion:</span>
                    </div>
                    <div className="text-gray-400 break-words">
                        Values are automatically converted: integers (123), floats (12.34), booleans (true/false), null, or kept as strings. Long paths and values will wrap properly. Use Ctrl/Cmd+Enter to Submit
                    </div>
                </div>
                
                {/* Scrollable container for the JSON editor */}
                <div className="max-h-[680px] overflow-y-auto overflow-x-auto custom-scrollbar">
                    {/* Pass props directly to the component with proper typing */}
                    <ReactJson
                        src={jsonData}
                        theme="monokai"
                        name={false}
                        iconStyle="triangle"
                        indentWidth={2}
                        collapsed={false}
                        collapseStringsAfterLength={false}
                        displayDataTypes={true}
                        displayObjectSize={true}
                        enableClipboard={true}
                        onEdit={handleOnChange}
                        onAdd={handleOnAdd}
                        onDelete={handleOnDelete}
                        style={{ 
                            padding: '10px', 
                            borderRadius: '4px',
                            wordBreak: 'break-all',
                            overflowWrap: 'break-word'
                        }}
                    />
                </div>
            </div>
        </div>
    );
}