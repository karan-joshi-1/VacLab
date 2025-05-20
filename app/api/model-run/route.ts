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
      
      // Create a unique key for this execution
      const executionKey = `${hostname}-${remoteDir}-${Date.now()}`;
      
      // Check if there's already an active execution for this user/directory
      const userKey = `${hostname}-${remoteDir}`;
      if (activeExecutions.has(userKey)) {
        // If the execution happened less than 5 seconds ago, don't allow another one
        const lastExecution = activeExecutions.get(userKey);
        const timeSinceLastExecution = Date.now() - lastExecution;
        
        if (timeSinceLastExecution < 5000) { // 5 seconds
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
            
            // Execute the envSetup.sh script
            const command = `cd /home/${hostname}/loading && source envSetup.sh`;
            sshClient.exec(command, (err, stream) => {
              if (err) {
                console.error('Error executing command:', err);
                writer.write(encoder.encode(JSON.stringify({
                  type: 'error',
                  message: `Error executing command: ${err.message}`
                }) + '\n'));
                sshClient.end();
                resolve();
              } else {
                writer.write(encoder.encode(JSON.stringify({
                  type: 'status',
                  message: 'Command running...'
                }) + '\n'));

                stream.on('close', (code:any, signal:any) => {
                  console.log(`Command executed with code: ${code}, signal: ${signal}`);
                  
                  writer.write(encoder.encode(JSON.stringify({
                    type: code === 0 ? 'success' : 'error',
                    message: code === 0 ? 'Command completed successfully' : `Command failed with exit code ${code}`
                  }) + '\n'));
                  
                  sshClient.end();
                  writer.close().catch(console.error);
                  resolve();
                }).on('data', (data:any) => {
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
                }).stderr.on('data', (data) => {
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
              }
            });
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