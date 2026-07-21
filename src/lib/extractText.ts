/**
 * Turns an uploaded file into plain text for the study-set generator.
 *
 * PDF parsing happens entirely in the browser via pdf.js — the file itself
 * never leaves the device; only the extracted text is sent to our server.
 * The pdf.js bundle is heavy (~300 KB), so it is imported lazily and costs
 * nothing until someone actually hands us a PDF.
 */

export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractError';
  }
}

export function isSupportedFile(file: File): boolean {
  return (
    /\.(pdf|txt|md|csv)$/i.test(file.name) ||
    file.type === 'application/pdf' ||
    file.type.startsWith('text/')
  );
}

export async function extractTextFromFile(file: File): Promise<string> {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    return extractPdfText(file);
  }
  if (/\.(txt|md|csv)$/i.test(file.name) || file.type.startsWith('text/')) {
    return file.text();
  }
  throw new ExtractError('Use a PDF or a plain-text file (.txt, .md, .csv).');
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Vite turns the worker into an asset URL; pdf.js needs it to parse off-thread.
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    throw new ExtractError('That PDF could not be opened — it may be corrupted or password-protected.');
  }

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) pages.push(line);
  }
  // Frees the worker and page caches; the extracted strings survive it.
  await task.destroy();

  const text = pages.join('\n\n').trim();
  if (!text) {
    throw new ExtractError(
      'No text found in that PDF. If it is a scan (images of pages), it has no selectable text to extract.',
    );
  }
  return text;
}
