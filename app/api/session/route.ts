import { NextResponse } from 'next/server';
import { getSession, deleteSession } from '../../lib/sessionStore';

export async function POST(request: Request) {
  try {
    const { sessionToken } = await request.json();
    
    if (!sessionToken) {
      return NextResponse.json(
        { error: true, message: 'Session token required' },
        { status: 400 }
      );
    }
    
    const session = getSession(sessionToken);
    
    if (!session) {
      return NextResponse.json(
        { error: true, message: 'Invalid session token' },
        { status: 401 }
      );
    }
    
    // Check if session has expired
    if (Date.now() > session.expiresAt) {
      deleteSession(sessionToken);
      return NextResponse.json(
        { error: true, message: 'Session expired' },
        { status: 401 }
      );
    }
    
    // Return session data 
    return NextResponse.json({
      success: true,
      sessionData: {
        ip: session.ip,
        hostname: session.hostname,
        expiresAt: session.expiresAt,
        isAuthenticated: true
      }
    });
    
  } catch (error) {
    console.error('Session validation error:', error);
    return NextResponse.json(
      { error: true, message: 'Failed to validate session' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { sessionToken } = await request.json();
    
    if (sessionToken) {
      deleteSession(sessionToken);
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Session deletion error:', error);
    return NextResponse.json(
      { error: true, message: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
