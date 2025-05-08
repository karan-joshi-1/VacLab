'use client'
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/navigation';
import { List, Database, RefreshCw } from 'lucide-react';

// Types for MLflow data structures
interface Run {
    run_id: string;
    info: {
        run_name: string;
        status: string;
        start_time: number;
    };
}

interface Parameter {
    key: string;
    value: string;
}

// Add prop type definition for MlLoader
interface MlLoaderProps {
    onJsonChange?: ((json: any) => void) | null;
}

export default function MlLoader({ onJsonChange = null }: MlLoaderProps) {
    // State variables for MLflow integration
    const [mlflowUri, setMlflowUri] = useState<string>('http://10.220.120.17:5000');
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [defaultExperimentId, setDefaultExperimentId] = useState<string>('0'); // Default experiment ID is usually '0'
    const [runs, setRuns] = useState<Run[]>([]);
    const [selectedRun, setSelectedRun] = useState<string>('');
    const [parameters, setParameters] = useState<Parameter[]>([]);
    const [jsonData, setJsonData] = useState<string>('');
    const [connectError, setConnectError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    
    const [runName, setRunName] = useState<string>(''); // State for run name
    
    // Get auth context for connection details
    const { connectionDetails } = useAuth();
    const router = useRouter();
    
    // Add auto-connection when authenticated
    useEffect(() => {
        if (connectionDetails.isAuthenticated && !isConnected) {
            connectToMlflow();
        }
    }, [connectionDetails.isAuthenticated, mlflowUri]);

    // Connect to MLflow server and verify connection
    const connectToMlflow = async () => {
        setIsLoading(true);
        setConnectError(null);
        
        try {
            // Simple check if MLflow server is accessible
            const checkUrl = `/api/mlflow-proxy?run_id=check&mlflowUri=${encodeURIComponent(mlflowUri)}`;
            
            const response = await fetch(checkUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            // Even if the check fails with 404 (run not found), the server is accessible
            if (response.status === 404 || response.ok) {
                setIsConnected(true);
                setConnectError(null);
            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Failed to connect to MLflow server`);
            }
        } catch (error) {
            console.error('Error connecting to MLflow:', error);
            setConnectError(`Failed to connect to MLflow server at ${mlflowUri}: ${error instanceof Error ? error.message : String(error)}`);
            setIsConnected(false);
        } finally {
            setIsLoading(false);
        }
    };

    // Load runs for the default experiment
    const loadRuns = async () => {
        setIsLoading(true);
        setConnectError(null);
        
        try {
            // Use API endpoint for fetching runs from the default experiment
            const apiUrl = `/api/mlflow-runs?experiment_id=${defaultExperimentId}&mlflowUri=${encodeURIComponent(mlflowUri)}`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Debug logging
            console.log('MLflow runs API response:', data);
            
            // Handle different response structures
            let runsArray: Run[] = [];
            
            if (data.runs && Array.isArray(data.runs)) {
                runsArray = data.runs;
            } else if (data.data && data.data.runs && Array.isArray(data.data.runs)) {
                runsArray = data.data.runs;
            } else {
                console.warn('Could not find runs array in MLflow response');
                runsArray = [];
            }
            
            setRuns(runsArray);
        
        } catch (error) {
            console.error('Error loading runs:', error);
            setConnectError(`Failed to load runs: ${error instanceof Error ? error.message : String(error)}`);
            setRuns([]);
            resetRunData();
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch parameters for selected run
    const fetchParameters = async (runId: string) => {
        // Check if runId is valid before making the API call
        if (!runId || runId === 'undefined') {
            console.warn('Attempted to fetch parameters with invalid run ID:', runId);
            setConnectError('Cannot fetch parameters: Invalid run ID');
            return;
        }

        setIsLoading(true);
        try {
            const apiUrl = `/api/mlflow-proxy?run_id=${runId}&mlflowUri=${encodeURIComponent(mlflowUri)}`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            const mlflowParams = data.run.data.params || [];
            setParameters(mlflowParams);
            
            // Use the enhanced parsing method
            const parsedParams = parseMLflowParams(mlflowParams, runId);
            
            // Update local state
            setJsonData(JSON.stringify(parsedParams, null, 2));
            
            // Send data to parent component
            if (onJsonChange) {
                onJsonChange(parsedParams);
            }
        } catch (error) {
            console.error('Error fetching parameters:', error);
            setConnectError(`Failed to fetch parameters for run: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Parse MLflow parameters with special handling for JSON values
    const parseMLflowParams = (params: Parameter[], currentRunId: string) => {
        const parsedParams: Record<string, any> = {
            run_id: currentRunId,
            fetch_time: new Date().toISOString(),
            parameters: {}
        };
        
        // First handle all parameters
        params.forEach(param => {
            parsedParams.parameters[param.key] = param.value;
        });
        
        // Special handling for JSON parameters
        params.forEach(param => {
            if (param.key === 'gitParams' || param.key === 'modelParams') {
                try {
                    const jsonValue = param.value.replace(/'/g, '"');
                    const parsed = JSON.parse(jsonValue);
                    Object.assign(parsedParams, { [param.key]: parsed });
                } catch (error) {
                    console.warn(`Could not parse JSON for ${param.key}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        });
        
        return parsedParams;
    };

    // Handle run change
    const handleRunChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const runId = e.target.value;
        setSelectedRun(runId);
        
        // Get the selected option element
        const selectedOption = e.target.options[e.target.selectedIndex];
        
        // Extract the run name directly from the option text (before any parentheses)
        if (selectedOption && selectedOption.text) {
            // Extract text before parentheses to get just the run name
            const runName = selectedOption.text.split('(')[0].trim();
            console.log('Setting run name from selected option text:', runName);
            setRunName(runName);
        }
        
        if (runId) {
            fetchParameters(runId);
        }
    };

    // Reset run data
    const resetRunData = () => {
        setParameters([]);
        setJsonData('');
        setSelectedRun('');
        setRunName('');
    };

    // Reset connection
    const resetConnection = () => {
        setIsConnected(false);
        setRuns([]);
        resetRunData();
        setConnectError(null);
    };

    // Search run by name - updated to directly extract parameters from response
    const searchRunByName = async () => {
        if (!runName.trim()) {
            setConnectError('Please enter a valid Run Name');
            return;
        }

        setIsLoading(true);
        setConnectError(null);
        
        try {
            const trimmedRunName = runName.trim();
            
            // Use our API endpoint for searching runs by name
            const apiUrl = `/api/mlflow-search?mlflowUri=${encodeURIComponent(mlflowUri)}`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    experimentId: defaultExperimentId,
                    runName: trimmedRunName
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log("Search response:", data);
            
            if (!data.runs || data.runs.length === 0) {
                throw new Error(`No run found with name: ${trimmedRunName}`);
            }
            
            // Use the first matching run
            const foundRun = data.runs[0];
            
            // Check if the run data contains parameters directly
            if (foundRun?.data?.params) {
                // Extract parameters directly from the response
                const mlflowParams = foundRun.data.params;
                
                // Set parameters from the response
                setParameters(mlflowParams);
                
                // Use run_id if available, otherwise generate a placeholder
                const runIdToUse = foundRun.run_id || `run-${Date.now()}`;
                setSelectedRun(runIdToUse);
                
                // Parse parameters and update JSON
                const parsedParams = parseMLflowParams(mlflowParams, runIdToUse);
                
                // Update local state
                setJsonData(JSON.stringify(parsedParams, null, 2));
                
                // Send data to parent component
                if (onJsonChange) {
                    onJsonChange(parsedParams);
                }
            } else {
                // If parameters aren't directly available but we have a run_id, fetch them
                if (foundRun.run_id) {
                    setSelectedRun(foundRun.run_id);
                    await fetchParameters(foundRun.run_id);
                } else {
                    // If run exists but doesn't have parameters or ID, show an error
                    throw new Error(`Found run with name "${trimmedRunName}" but it doesn't contain parameters`);
                }
            }
            
        } catch (error) {
            console.error('Error searching for run by name:', error);
            setConnectError(`Failed to find run with name "${runName}": ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsLoading(false);
        }
    };

    // Extract server information from mlflowUri for display
    const getServerInfo = () => {
        try {
            const url = new URL(mlflowUri);
            return {
                ip: url.hostname,
                port: url.port || '80'
            };
        } catch (e) {
            // If URL parsing fails, extract what we can with regex
            const ipMatch = mlflowUri.match(/\/\/([^:\/]+)(?::(\d+))?/);
            if (ipMatch) {
                return {
                    ip: ipMatch[1] || 'unknown',
                    port: ipMatch[2] || '80'
                };
            }
            return { ip: 'unknown', port: 'unknown' };
        }
    };

    const serverInfo = getServerInfo();

    return (
        <div className="w-full mx-auto">
            
            <div className="px-6 pb-6">
                {/* MLflow connection section */}
                <div className="bg-gray-800 p-4 rounded-lg shadow-lg mb-4">
                    <div className="mb-4">
                        <div className="flex flex-col space-y-2">
                            {/* Add search by run name section */}
                            <div className="mt-4">
                                <label htmlFor="runName" className="block text-sm font-medium text-gray-300 mb-1">
                                    Search by Run Name
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        id="runName"
                                        value={runName || ''} 
                                        onChange={(e) => setRunName(e.target.value)}
                                        className="flex-grow px-4 py-2 bg-gray-700 border border-gray-600 rounded-l-md text-white"
                                        placeholder="Enter run name to search"
                                    />
                                    <button
                                        onClick={searchRunByName}
                                        disabled={isLoading}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-r-md transition-colors duration-300"
                                    >
                                        {isLoading ? 'Searching...' : 'Search'}
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex justify-between mt-1">
                                <a 
                                    href={mlflowUri + '/#/'}
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors duration-300"
                                >
                                    Open MLflow UI ↗
                                </a>
                                <span className="text-sm text-gray-400">
                                    Current server: {serverInfo.ip}:{serverInfo.port}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-gray-700 my-4 pt-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center">
                                <Database className="w-5 h-5 mr-2 text-indigo-400" />
                                <h3 className="text-lg font-medium">Default Experiment Runs</h3>
                            </div>
                            {isConnected && (
                                <button
                                    onClick={loadRuns}
                                    disabled={isLoading}
                                    className="flex items-center px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded"
                                    title="Load Runs"
                                >
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    {isLoading ? 'Loading...' : 'Load Runs'}
                                </button>
                            )}
                        </div>
                        
                        {!isConnected ? (
                            <div className="p-2 bg-yellow-900/30 border border-yellow-700 rounded-md mb-4">
                                <p className="text-yellow-400 text-sm">
                                    Connecting to MLflow server at {mlflowUri}...
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="p-2 bg-green-900/30 border border-green-700 rounded-md mb-4">
                                    <p className="text-green-400 text-sm">
                                        Connected to MLflow server at {mlflowUri}
                                    </p>
                                </div>
                                
                                {runs.length > 0 ? (
                                    <div className="mb-4">
                                        <label htmlFor="run-select" className="block text-sm font-medium text-gray-300 mb-1">
                                            Available Runs
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <select
                                                id="run-select"
                                                value={selectedRun}
                                                onChange={handleRunChange}
                                                className="w-full px-4 py-2 rounded-md bg-gray-700 border border-gray-600 text-white"
                                            >
                                                <option value="" key="empty-option">-- Select a run --</option>
                                                {runs.map((run) => (
                                                    <option 
                                                        key={run.run_id || `run-${Math.random()}`} 
                                                        value={run.run_id || ''}
                                                    >
                                                        {run.info?.run_name || run.run_id || 'Unnamed Run'} 
                                                        {run.info?.start_time ? 
                                                            `(${new Date(run.info.start_time).toLocaleDateString()})` : 
                                                            ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={resetConnection}
                                                className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md"
                                                title="Disconnect"
                                            >
                                                <List className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-gray-400 text-sm italic mb-4">
                                        No runs loaded yet. Click "Load Runs" to fetch runs from the default experiment.
                                    </p>
                                )}
                            </>
                        )}
                        {connectError && (
                            <p className="mt-1 text-xs text-red-400">{connectError}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}