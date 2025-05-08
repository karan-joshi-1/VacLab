import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {

        

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
    }

}