/*
 * Model Run API Route with Isolated Execution Environments
 * 
 * This API creates isolated execution environments for each model run to prevent conflicts
 * between concurrent executions. Each run gets its own folder with the pattern:
 * RunName_YYYYMMDD_HHMMSS (e.g., MyModel_20241201_143025)
 * 
 * Features:
 * - Extracts runName from uploaded JSON files (supports multiple field locations)
 * - Creates timestamped isolated folders under /home/{hostname}/
 * - Copies necessary files to isolated environment
 * - Executes envSetup.sh within the isolated context
 * - Prevents duplicate executions with reduced timeout (2s vs 5s due to isolation)
 */
import { NextResponse } from 'next/server';
import { Client } from 'ssh2';

// Keeping track of active executions to prevent duplicates
let activeExecutions = new Map();

export async function POST(request: Request) {
    try {
      // Get authentication details and upload parameters from request
      const formData = await request.formData();
      const remoteDir = formData.get('remoteDir') as string || '/tmp';
      
      // Extract connection details from the connectionDetails JSON string
      let ip, hostname, password;
      const connectionDetailsStr = formData.get('connectionDetails') as string;
      
      // Extract branch-name from uploaded file content for isolated execution
      let runName = 'DefaultRun';
      const fileEntry = formData.get('file') as File;
      if (fileEntry) {
        try {
          const fileContent = await fileEntry.text();
          const jsonContent = JSON.parse(fileContent);
          
          // Log all top-level keys for debugging
          console.log(`JSON Content Keys:`, Object.keys(jsonContent));
          
          // Look for branchName in gitParams (camelCase)
          if (jsonContent.gitParams?.branchName) {
            runName = jsonContent.gitParams.branchName;
            console.log(`Found branchName in gitParams: ${runName}`);
          }
          // Look for branchName in gitParms (typo variant with camelCase)
          else if (jsonContent.gitParms?.branchName) {
            runName = jsonContent.gitParms.branchName;
            console.log(`Found branchName in gitParms: ${runName}`);
          }
          // Check root level
          else if (jsonContent.branchName) {
            runName = jsonContent.branchName;
            console.log(`Found branchName at root level: ${runName}`);
          }
          // Check if gitParams exists directly and log its contents
          else if (jsonContent.gitParams) {
            console.log("Found gitParams:", Object.keys(jsonContent.gitParams));
            if (typeof jsonContent.gitParams === 'object') {
              // Try different capitalization/formats
              const possibleKeys = ['branchname', 'branch_name', 'branch-name', 'branch', 'BRANCHNAME'];
              for (const key of possibleKeys) {
                if (jsonContent.gitParams[key]) {
                  runName = jsonContent.gitParams[key];
                  console.log(`Found branch name as ${key} in gitParams: ${runName}`);
                  break;
                }
              }
            }
          }
          // Final fallback options
          else {
            console.warn('No branchName found in expected locations, checking alternatives');
            // Try run name or other identifiers
            if (jsonContent.run_name) {
              runName = jsonContent.run_name;
              console.log(`Using run_name as fallback: ${runName}`);
            } else if (jsonContent.name) {
              runName = jsonContent.name;
              console.log(`Using name as fallback: ${runName}`);
            } else if (fileEntry.name && fileEntry.name !== 'data.json') {
              runName = fileEntry.name.replace(/\.[^/.]+$/, "");
              console.log(`Using filename as fallback: ${runName}`);
            } else {
              console.warn('No suitable name found in uploaded file, using default');
            }
          }
          
          // Clean runName for use in folder names (remove invalid characters)
          runName = runName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
          
        } catch (parseError) {
          console.warn('Could not parse uploaded file for branch-name, using default:', parseError);
        }
      }
      
      if (connectionDetailsStr) {
        try {
          const connectionDetails = JSON.parse(connectionDetailsStr);
          ip = connectionDetails.ip;
          hostname = connectionDetails.hostname;
          password = connectionDetails.password;
          
        } catch (parseError) {
          console.error('Failed to parse connectionDetails JSON:', parseError);
        }
      }
      
      // Check if required parameters are provided
      if (!ip || !hostname || !password) {
        return NextResponse.json(
          { error: true, message: 'Missing required parameters (ip, hostname, password)' },
          { status: 400 }
        );
      }
      
      // Generate timestamp for isolated folder creation in format: MM_DD_YY-HH_MM
      const now = new Date();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const day = now.getDate().toString().padStart(2, '0');
      const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const timestamp = `${month}_${day}_${year}-${hours}_${minutes}`;
      
      // Create isolated folder name with pattern: RunName-MM_DD_YY-HH_MM
      const isolatedFolderName = `${runName}-${timestamp}`;
      const isolatedPath = `/home/${hostname}/${isolatedFolderName}`;
      const sourcePath = `/home/${hostname}/loading`;
      
      console.log(`Creating isolated execution environment: ${isolatedPath}`);
      
      // Create a unique key for this execution using the isolated folder
      const executionKey = `${hostname}-${isolatedFolderName}`;
      
      // Check if there's already an active execution for this specific run
      // Note: With isolated folders, we can be more permissive since each run has its own space
      const userKey = `${hostname}-${runName}`;
      if (activeExecutions.has(userKey)) {
        // If the execution happened less than 2 seconds ago, don't allow another one
        const lastExecution = activeExecutions.get(userKey);
        const timeSinceLastExecution = Date.now() - lastExecution;
        
        if (timeSinceLastExecution < 2000) { // 2 seconds (reduced from 5 since we have isolation)
          console.log(`Preventing duplicate execution for ${userKey}, last executed ${timeSinceLastExecution}ms ago`);
          return NextResponse.json(
            { 
              message: 'Command is already running, please wait before submitting again.',
              type: 'status' 
            },
            { status: 429 }
          );
        }
      }
      
      // Record this execution
      activeExecutions.set(userKey, Date.now());
      
      // Set a timeout to remove this execution from the active list after some time
      setTimeout(() => {
        activeExecutions.delete(userKey);
      }, 30000); // 30 seconds should be enough for most executions to complete

      // Set up streaming response
      const encoder = new TextEncoder();
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();

      // Create an async task for the SSH connection and command execution
      const sshTask = async () => {
        return new Promise<void>((resolve, reject) => {
          const sshClient = new Client();
          
          sshClient.on('ready', () => {
            console.log('SSH Connection established');
            
            // Send connection established message
            writer.write(encoder.encode(JSON.stringify({
              type: 'status',
              message: 'SSH Connection established'
            }) + '\n'));
            
            // Send isolated folder creation message
            writer.write(encoder.encode(JSON.stringify({
              type: 'status',
              message: `Creating isolated execution environment: ${isolatedFolderName}`
            }) + '\n'));
            
            // Execute all commands in sequence
            executeIsolatedEnvironment();
            
            // Function to execute the isolated environment setup and command
            function executeIsolatedEnvironment() {
              // Build the command to:
              // 1. Create the isolated directory
              // 2. Copy files from loading directory to isolated directory
              // 3. Change to isolated directory
              // 4. Execute envSetup.sh
              const commands = [
                `mkdir -p "${isolatedPath}"`,
                `cp -r "${sourcePath}"/* "${isolatedPath}/" 2>/dev/null || echo "Warning: Some files may not have been copied"`,
                `cd "${isolatedPath}"`,
                `echo "Isolated environment created at: ${isolatedPath}"`,
                `echo "Files copied from: ${sourcePath}"`,
                `echo "Current directory: $(pwd)"`,
                `echo "Starting envSetup.sh execution..."`,
                `source envSetup.sh`
              ];
              
              const fullCommand = commands.join(' && ');
              
              writer.write(encoder.encode(JSON.stringify({
                type: 'status',
                message: `Setting up isolated environment: ${isolatedFolderName}`
              }) + '\n'));
              
              writer.write(encoder.encode(JSON.stringify({
                type: 'status',
                message: `Copying files from ${sourcePath} to ${isolatedPath}`
              }) + '\n'));
              
              console.log(`Executing isolated setup command: ${fullCommand}`);
              
              sshClient.exec(fullCommand, (err, stream) => {
                if (err) {
                  console.error('Error executing isolated setup command:', err);
                  writer.write(encoder.encode(JSON.stringify({
                    type: 'error',
                    message: `Error setting up isolated environment ${isolatedFolderName}: ${err.message}`
                  }) + '\n'));
                  sshClient.end();
                  resolve();
                  return;
                }

                writer.write(encoder.encode(JSON.stringify({
                  type: 'status',
                  message: `Isolated environment setup running for ${isolatedFolderName}...`
                }) + '\n'));

                stream.on('close', (code: any, signal: any) => {
                  console.log(`Isolated environment setup completed with code: ${code}, signal: ${signal} for: ${isolatedFolderName}`);
                  
                  writer.write(encoder.encode(JSON.stringify({
                    type: code === 0 ? 'success' : 'error',
                    message: code === 0 ? 
                      `Isolated environment ${isolatedFolderName} setup completed successfully` : 
                      `Isolated environment ${isolatedFolderName} setup failed with exit code ${code}`
                  }) + '\n'));
                  
                  sshClient.end();
                  writer.close().catch(console.error);
                  resolve();
                }).on('data', (data: any) => {
                  const dataString = data.toString().trim();
                  console.log(`STDOUT: ${dataString}`);
                  
                  if (dataString) {
                    // Stream stdout to client in real-time
                    writer.write(encoder.encode(JSON.stringify({
                      type: 'stdout',
                      message: dataString
                    }) + '\n'));
                  }
                  
                  // End connection when "Deactivating conda" is detected
                  if (dataString.includes("Deactivating conda")) {
                    stream.close();
                  }
                }).stderr.on('data', (data: any) => {
                  const dataString = data.toString().trim();
                  console.error(`STDERR: ${dataString}`);
                  
                  if (dataString) {
                    // Stream stderr to client in real-time
                    writer.write(encoder.encode(JSON.stringify({
                      type: 'stderr',
                      message: dataString
                    }) + '\n'));
                  }
                });
              });
            }
          });
          
          sshClient.on('error', (err) => {
            console.error('SSH connection error:', err);
            writer.write(encoder.encode(JSON.stringify({
              type: 'error',
              message: `SSH connection error: ${err.message}`
            }) + '\n'));
            writer.close().catch(console.error);
            resolve();
          });
          
          // Connect to the remote server
          sshClient.connect({
            host: ip,
            username: hostname,
            password: password,
            port: 22,
            readyTimeout: 10000
          });
        });
      };
      
      // Start the SSH task but don't await it - it will run in the background
      // while we return the streaming response
      sshTask().catch(error => {
        console.error('Error in SSH task:', error);
        writer.write(encoder.encode(JSON.stringify({
          type: 'error', 
          message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
        }) + '\n')).catch(console.error);
      });
      
      // Return the readable stream as the response
      return new Response(stream.readable, {
        headers: {
          'Content-Type': 'application/json',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
      
    } catch (error) {
      console.error('Error in model-run API:', error);
      return NextResponse.json(
        { error: true, message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` },
        { status: 500 }
      );
    }
}