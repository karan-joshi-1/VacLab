'use client'
import { useEffect, useState, useRef } from 'react';

interface CommandOutputProps {
  streamUrl?: string;
  formData?: FormData;
  autoScroll?: boolean;
}

type OutputLine = {
  type: 'status' | 'stdout' | 'stderr' | 'error' | 'success';
  message: string;
  timestamp: Date;
};

export default function CommandOutput({ 
  streamUrl = '/api/model-run',
  formData,
  autoScroll = true 
}: CommandOutputProps) {
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const outputContainerRef = useRef<HTMLDivElement>(null);

  // Start streaming when formData is provided
  useEffect(() => {
    if (!formData) return;
    
    // Reset state for new streaming session
    setOutputLines([]);
    setIsComplete(false);
    setIsStreaming(true);

    const fetchStream = async () => {
      try {
        const response = await fetch(streamUrl, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          setOutputLines(prev => [...prev, {
            type: 'error',
            message: `Server error: ${response.status} - ${errorText || 'Unknown error'}`,
            timestamp: new Date()
          }]);
          setIsStreaming(false);
          setIsComplete(true);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setOutputLines(prev => [...prev, {
            type: 'error',
            message: 'Cannot read stream from server',
            timestamp: new Date()
          }]);
          setIsStreaming(false);
          setIsComplete(true);
          return;
        }

        // Add initial connecting message
        setOutputLines([{ 
          type: 'status', 
          message: 'Connecting to server...', 
          timestamp: new Date() 
        }]);

        // Read the stream
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          
          if (done) {
            // Process any remaining buffer
            if (buffer.trim()) {
              try {
                const line = JSON.parse(buffer.trim());
                setOutputLines(prev => [...prev, {
                  type: line.type || 'status',
                  message: line.message,
                  timestamp: new Date()
                }]);
              } catch (e) {
                // If not valid JSON, just add as status
                setOutputLines(prev => [...prev, {
                  type: 'status',
                  message: buffer.trim(),
                  timestamp: new Date()
                }]);
              }
            }
            
            setIsStreaming(false);
            setIsComplete(true);
            break;
          }

          // Decode the chunk and add it to our buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process any complete lines in the buffer
          const lines = buffer.split('\n');
          
          // Keep the last line in the buffer if it's incomplete
          buffer = lines.pop() || '';

          // Process complete lines
          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsedLine = JSON.parse(line.trim());
                setOutputLines(prev => [...prev, {
                  type: parsedLine.type || 'status',
                  message: parsedLine.message,
                  timestamp: new Date()
                }]);
              } catch (e) {
                // If not JSON, treat as plain text
                setOutputLines(prev => [...prev, {
                  type: 'status',
                  message: line.trim(),
                  timestamp: new Date()
                }]);
              }
            }
          }
        }
      } catch (error) {
        setOutputLines(prev => [...prev, {
          type: 'error',
          message: `Error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date()
        }]);
        setIsStreaming(false);
        setIsComplete(true);
      }
    };

    fetchStream();

    // Cleanup function
    return () => {
      setIsStreaming(false);
    };
  }, [formData, streamUrl]);

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (autoScroll && outputContainerRef.current && outputLines.length > 0) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight;
    }
  }, [outputLines, autoScroll]);

  // Get the appropriate style for each message type
  const getLineStyle = (type: string) => {
    switch (type) {
      case 'stdout':
        return 'text-green-300';
      case 'stderr':
        return 'text-yellow-300';
      case 'error':
        return 'text-red-400';
      case 'success':
        return 'text-green-400';
      case 'status':
      default:
        return 'text-blue-300';
    }
  };

  // Format timestamp
  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString();
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={`h-4 w-4 ${isStreaming ? 'text-green-400' : isComplete ? 'text-blue-400' : 'text-gray-400'} mr-2`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          <h3 className="text-sm font-medium text-gray-200">
            Command Output {isStreaming && <span className="text-green-400 animate-pulse">● Live</span>}
          </h3>
        </div>
        <div className="text-xs text-gray-400">
          {isComplete ? 'Completed' : isStreaming ? 'Streaming...' : 'Waiting...'}
        </div>
      </div>

      <div 
        ref={outputContainerRef}
        className="max-h-[320px] overflow-y-auto font-mono text-xs p-3 bg-gray-900 custom-scrollbar"
      >
        {outputLines.length === 0 ? (
          <div className="text-gray-500 italic p-2">No output yet...</div>
        ) : (
          <div className="space-y-1">
            {outputLines.map((line, index) => (
              <div key={index} className="flex">
                <span className="text-gray-500 mr-2">[{formatTimestamp(line.timestamp)}]</span>
                <span className={`${getLineStyle(line.type)}`}>{line.message}</span>
              </div>
            ))}
          </div>
        )}
        
        {isStreaming && (
          <div className="border-l-2 border-blue-500 pl-2 ml-2 mt-2 animate-pulse">
            <span className="text-blue-400">Waiting for more output...</span>
          </div>
        )}
      </div>
    </div>
  );
}