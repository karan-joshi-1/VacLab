import { NextRequest, NextResponse } from 'next/server';

// Add CORS headers to the response
function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

// Handle OPTIONS requests (preflight)
export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 204 }));
}

// Handle POST requests to search for runs by name
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const mlflowUri = url.searchParams.get('mlflowUri');
    
    if (!mlflowUri) {
      return corsHeaders(
        NextResponse.json(
          { error: true, message: 'Missing required parameter: mlflowUri' },
          { status: 400 }
        )
      );
    }

    // Get request body
    const requestBody = await request.json();
    const { experimentId = '0', runName } = requestBody;
    
    if (!runName) {
      return corsHeaders(
        NextResponse.json(
          { error: true, message: 'Missing required parameter: runName' },
          { status: 400 }
        )
      );
    }
    
    // Build the MLflow API URL for runs/search endpoint
    const mlflowUrl = `${mlflowUri}/api/2.0/mlflow/runs/search`;
    
    console.log(`Searching for run with name '${runName}' in experiment ${experimentId}`);
    
    // Forward the request to MLflow with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout
    
    try {
      // Create search payload with filter on run name
      const searchPayload = {
        experiment_ids: [experimentId],
        filter: `attributes.run_name = '${runName}'`
      };
      
      const mlflowResponse = await fetch(mlflowUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchPayload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!mlflowResponse.ok) {
        const errorText = await mlflowResponse.text().catch(() => 'No error details available');
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
      console.log('Search results:', data);
      // Check if any runs were found
      if (!data.runs || data.runs.length === 0) {
        return corsHeaders(
          NextResponse.json(
            { 
              error: true, 
              message: `No run found with name: ${runName}`,
              runs: []
            },
            { status: 404 }
          )
        );
      }
      
      return corsHeaders(NextResponse.json(data, { status: 200 }));
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError; // Re-throw to be caught by outer try-catch
    }
  } catch (error) {
    console.error('Error searching for run by name:', error);
    
    // error message based on error type
    let errorMessage = 'Failed to search for run by name';
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