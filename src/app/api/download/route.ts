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
    // extractAudio now writes to a temp file first, then returns a file read stream.
    // This is reliable across all environments (no subprocess stdout pipe issues).
    const audioData = await extractorManager.extractAudio(id);

    const nodeStream = audioData.stream as Readable;

    // Convert Node.js Readable to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      }
    });

    // Sanitize title for filename (strip characters unsafe in filenames)
    const sanitizedTitle = title.replace(/[^\w\s\-().]/g, '').trim() || 'song';
    const filename = `${sanitizedTitle}.${audioData.ext}`;

    const headers = new Headers();
    headers.set('Content-Type', audioData.mimeType);
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    // Set Content-Length so the browser shows accurate download progress
    if (audioData.size) {
      headers.set('Content-Length', String(audioData.size));
    }

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
