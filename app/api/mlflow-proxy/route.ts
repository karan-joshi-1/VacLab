// app/api/mlflow-proxy/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Add CORS headers to the response
function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

// Handle OPTIONS requests (preflight)
export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 204 }));
}

// Handle POST requests
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get('run_id');
    const mlflowUri = url.searchParams.get('mlflowUri');
    
    if (!runId || !mlflowUri) {
      return corsHeaders(
        NextResponse.json(
          { error: true, message: 'Missing required parameters: run_id, mlflowUri' },
          { status: 400 }
        )
      );
    }
    
    // Build the MLflow API URL for runs/get endpoint
    const mlflowUrl = `${mlflowUri}/api/2.0/mlflow/runs/get?run_id=${runId}`;
    
    console.log(`Proxying request to MLflow server: ${mlflowUrl}`);
    
    // Forward the request to MLflow with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout
    
    try {
      // Get any additional request body
      const requestBody = request.headers.get('content-type')?.includes('application/json') 
        ? await request.json().catch(() => ({}))
        : {};
      
      const mlflowResponse = await fetch(mlflowUrl, {
        method: 'GET', // Using GET for runs/get endpoint
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle non-OK responses from MLflow
      if (!mlflowResponse.ok) {
        const errorText = await mlflowResponse.text();
        console.error(`MLflow server returned error: ${mlflowResponse.status} ${mlflowResponse.statusText}`);
        console.error(`Error details: ${errorText}`);
        
        return corsHeaders(
          NextResponse.json(
            { 
              error: true, 
              message: `MLflow server error: ${mlflowResponse.status} ${mlflowResponse.statusText}`,
              details: errorText
            },
            { status: mlflowResponse.status }
          )
        );
      }
      
      const data = await mlflowResponse.json();
      return corsHeaders(NextResponse.json(data, { status: 200 }));
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError; // Re-throw to be caught by outer try-catch
    }
  } catch (error) {
    console.error('Error proxying MLflow request:', error);
    
    //  error message based on error type
    let errorMessage = 'Failed to proxy request to MLflow server';
    let errorDetails = error instanceof Error ? error.message : String(error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      errorMessage = 'Connection to MLflow server timed out';
    } else if (error instanceof TypeError && error.message.includes('fetch')) {
      errorMessage = 'Cannot connect to MLflow server - server may be down or unreachable';
    }
    
    return corsHeaders(
      NextResponse.json(
        { 
          error: true, 
          message: errorMessage, 
          details: errorDetails
        },
        { status: 500 }
      )
    );
  }
}