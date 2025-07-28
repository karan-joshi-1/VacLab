import { NextResponse } from 'next/server';
import { Client } from 'ssh2';
import crypto from 'crypto';
import { setSession } from '../../lib/sessionStore';

// Generate a secure session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function POST(request: Request) {
  try {
    const { ip, hostname, password } = await request.json();
    console.log(`Attempting SSH connection to: ${ip} with username: ${hostname} using password authentication`);
    
    // Regular SSH authentication logic
    // Wrap in a Promise so Next.js waits for the SSH callbacks
    return new Promise<NextResponse>((resolve) => {
      const conn = new Client();

      // Set a timeout for the entire connection process - 10 seconds
      const timeoutId = setTimeout(() => {
        conn.end();
        console.error('SSH connection timeout');
        resolve(
          NextResponse.json(
            { error: true, message: `Connection timed out after 10 seconds. Please check if the server at ${ip} is reachable and that SSH is running on port 22.` },
            { status: 500 }
          )
        );
      }, 10000); // 10 seconds timeout
      
      conn
        .on('ready', () => {
          console.log('SSH connection successful');
          clearTimeout(timeoutId);
          conn.end();
          
          // Generate session token
          const sessionToken = generateSessionToken();
          const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
          
          // Store session data (without password)
          setSession(sessionToken, {
            ip,
            hostname,
            expiresAt
          });
          
          resolve(NextResponse.json({ 
            success: true, 
            sessionToken,
            expiresAt
          }));
        })
        .on('error', (err) => {
          clearTimeout(timeoutId);
          console.error('SSH connection error:', err.message);
          
          // Specific error messages based on common errors
          let statusMessage = err.message;
          let statusCode = 500;
          
          if (err.message.includes('timeout') || err.message.includes('Timed out')) {
            statusMessage = `Connection timed out. Please check if the server at ${ip} is reachable and that SSH is running on port 22.`;
          } else if (err.message.includes('authentication methods failed')) {
            statusMessage = 'Invalid credentials. Please check your username and password.';
            statusCode = 401;
          } else if (err.message.includes('ECONNREFUSED')) {
            statusMessage = `Connection refused. Please check if SSH is running on ${ip}:22.`;
          } else if (err.message.includes('connection reset by peer')) {
            statusMessage = 'Connection was reset by the server. This could be due to network issues or server configuration.';
          }
          
          resolve(
            NextResponse.json(
              { error: true, message: statusMessage, originalError: err.message },
              { status: statusCode }
            )
          );
        })
        .on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
          // If we have a password and this is a keyboard-interactive fallback
          if (password && prompts.length === 1) {
            finish([password]);
          } else {
            finish([]);
          }
        });
      
      // Build connection config for password authentication
      const connectionConfig = {
        host: ip,
        port: 22,
        username: hostname,
        password: password,
        readyTimeout: 8000, // Reduce the internal SSH2 library timeout
        keepaliveInterval: 2000, // Send keepalive every 2 seconds
        keepaliveCountMax: 3, // Allow 3 missed keepalives before considering connection dead
        // Try both password and keyboard-interactive
        tryKeyboard: true
      };
      
      // Connect with password authentication
      conn.connect(connectionConfig);
    });
  } catch (error) {
    console.error('Request processing error:', error);
    return NextResponse.json(
      { error: true, message: 'Failed to process request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}