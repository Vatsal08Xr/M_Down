import { NextResponse } from 'next/server';
import { extractorManager } from '@/lib/extractors';
import { ExtractionError, RegionLockError } from '@/lib/errors';
import { Readable } from 'stream';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const title = searchParams.get('title') || 'song';

  if (!id) {
    return NextResponse.json({ error: 'Parameter "id" is required' }, { status: 400 });
  }

  try {
    const audioData = await extractorManager.extractAudio(id);

    // Convert NodeJS Readable to Web ReadableStream
    // yt-dlp exec returns a child process stdout which is a Socket (Readable)
    const stream = audioData.stream as Readable;
    
    // We can construct a Web ReadableStream manually if node doesn't natively cast it in Next.js Response
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() {
        stream.destroy();
      }
    });

    // Sanitize title for filename
    const sanitizedTitle = title.replace(/[^a-z0-9 -]/gi, '').trim();
    const filename = `${sanitizedTitle}.${audioData.ext}`;

    const headers = new Headers();
    headers.set('Content-Type', audioData.mimeType);
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    
    return new Response(webStream, { headers });

  } catch (error: any) {
    console.error('Download error:', error);
    if (error instanceof RegionLockError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ExtractionError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
