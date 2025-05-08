import { NextResponse } from 'next/server';
import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Temporary directory for storing uploaded files
const TEMP_DIR = path.join(os.tmpdir(), 'sftp-uploads');

// Ensure the temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

export async function POST(request: Request) {
  try {
    // Get authentication details and upload parameters from request
    const formData = await request.formData();
    const file = formData.get('file') as File;
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
    if (!file || !ip || !hostname || !password) {
      return NextResponse.json(
        { error: true, message: 'Missing required parameters (file, ip, hostname, password)' },
        { status: 400 }
      );
    }

    // Get file name and extension
    const fileName = file.name;
    const remotePath = path.posix.join(remoteDir, fileName);

    // Create a temporary local file
    const localPath = path.join(TEMP_DIR, fileName);
    
    // Write the file to the temporary directory
    const fileBuffer = await file.arrayBuffer();
    fs.writeFileSync(localPath, Buffer.from(fileBuffer));

    // Create an SSH connection and upload the file via SFTP
    return new Promise<NextResponse>((resolve) => {
      const sshClient = new Client();
      
      // Set a timeout for the connection
      const timeoutId = setTimeout(() => {
        sshClient.end();
        // Cleanup the temporary file
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
        
        resolve(
          NextResponse.json(
            { error: true, message: 'SFTP upload timeout' },
            { status: 500 }
          )
        );
      }, 30000); // 30 seconds timeout
      
      sshClient.on('ready', () => {
        console.log('SSH connection successful, starting SFTP session');
        // Start SFTP session
        sshClient.sftp((err, sftp) => {
          if (err) {
            clearTimeout(timeoutId);
            sshClient.end();
            
            // Cleanup the temporary file
            if (fs.existsSync(localPath)) {
              fs.unlinkSync(localPath);
            }
            
            console.error('SFTP session error:', err.message);
            resolve(
              NextResponse.json(
                { error: true, message: 'Failed to start SFTP session', details: err.message },
                { status: 500 }
              )
            );
            return;
          }

          console.log(`Starting file upload to ${remotePath}`);
          // Upload the file using fastPut
          sftp.fastPut(localPath, remotePath, (uploadErr) => {
            clearTimeout(timeoutId);
            
            // Cleanup the temporary file
            if (fs.existsSync(localPath)) {
              fs.unlinkSync(localPath);
            }
            
            if (uploadErr) {
              console.error('File upload error:', uploadErr.message);
              sshClient.end();
              resolve(
                NextResponse.json(
                  { error: true, message: 'Failed to upload file', details: uploadErr.message },
                  { status: 500 }
                )
              );
              return;
            }

            // Successfully uploaded
            console.log(`File successfully uploaded to ${remotePath}`);
            sshClient.end();
            resolve(
              NextResponse.json({
                success: true,
                message: 'File uploaded successfully',
                fileName,
                remotePath
              })
            );
          });
        });
      }).on('error', (err) => {
        clearTimeout(timeoutId);
        
        // Cleanup the temporary file
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
        
        // Handle connection errors
        let statusMessage = err.message;
        let statusCode = 500;
        
        if (err.message.includes('authentication methods failed')) {
          statusMessage = 'Invalid credentials. Please check your username and password.';
          statusCode = 401;
          console.error('SSH authentication failed with provided credentials. Error:', err.message);
        } else if (err.message.includes('ECONNREFUSED')) {
          statusMessage = `Connection refused. Please check if SSH is running on ${ip}:22.`;
        }
        
        resolve(
          NextResponse.json(
            { error: true, message: statusMessage, details: err.message },
            { status: statusCode }
          )
        );
      }).on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
        // If we have a password and this is a keyboard-interactive fallback
        if (password && prompts.length === 1) {
          finish([password]);
        } else {
          finish([]);
        }
      });

      // Connect to the server with correct configuration
      sshClient.connect({
        host: ip,
        port: 22,
        username: hostname,
        password: password,
        readyTimeout: 10000,
        keepaliveInterval: 2000,
        keepaliveCountMax: 3,
        tryKeyboard: true  // Enable keyboard-interactive authentication as fallback
      });
    });
  } catch (error) {
    console.error('Upload request processing error:', error);
    return NextResponse.json(
      { error: true, message: 'Failed to process upload request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}