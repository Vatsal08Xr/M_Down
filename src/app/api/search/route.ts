import { NextResponse } from 'next/server';
import { searchManager } from '@/lib/search';
import { ProviderError } from '@/lib/errors';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  try {
    const tracks = await searchManager.search(query);
    return NextResponse.json({ tracks });
  } catch (error: any) {
    console.error('Search error:', error);
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
