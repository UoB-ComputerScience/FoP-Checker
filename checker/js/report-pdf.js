// Reads a PDF report with PDF.js, inside the report worker, and counts its words.
import { makeFinding } from './findings.js';
import { LIMITS } from './profiles.js';

const MAX_PAGES = 200;
const MAX_TEXT = 2 * 1024 * 1024; // characters of text

// The check stops with this one finding.
const stop = (report, key, values) => ({ ...report, complete: false, findings: [makeFinding(key, values)] });

export function countWords(text) {
  if (typeof Intl.Segmenter !== 'function') return (text.match(/\S+/g) || []).length;
  let words = 0;
  for (const segment of new Intl.Segmenter('en', { granularity: 'word' }).segment(text)) {
    if (segment.isWordLike) words++;
  }
  return words;
}

export async function checkPdfReport(file, report, { progress = () => {}, limits = LIMITS } = {}) {
  if (file.size > limits.archiveBytes) return stop(report, 'report.limit.warning.3');
  // PDF.js 5.6.205, distributed under Apache-2.0; see vendor/pdfjs/LICENSE.
  // Its parser is registered in this worker rather than in a nested one, which
  // could outlive the cancellation of the report check.
  await import('../vendor/pdfjs/pdf.worker.js');
  const { getDocument } = await import('../vendor/pdfjs/pdf.js');

  // PDF.js 5.6 still substitutes an empty stream for some decoder failures, even with
  // stopAtErrors. Its warning is watched for so that lost page data cannot pass as a
  // successful check. This console belongs to the worker, so nothing else is affected.
  let invalidStream = false;
  const originalWarn = console.warn;
  const captureWarning = (...args) => {
    if (args.some(value => typeof value === 'string' && value.startsWith('Warning: Invalid stream:'))) {
      invalidStream = true;
    }
    originalWarn.apply(console, args);
  };
  console.warn = captureWarning;

  let task;
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('checker-timeout')), limits.milliseconds);
  });
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    task = getDocument({
      data,
      stopAtErrors: true,
      // Nothing from the document is run or fetched.
      isEvalSupported: false,
      enableXfa: false,
      disableFontFace: true,
      useSystemFonts: false,
      useWasm: false,
      useWorkerFetch: true,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      cMapUrl: new URL('../vendor/pdfjs/cmaps/', import.meta.url).href,
      cMapPacked: true,
      standardFontDataUrl: new URL('../vendor/pdfjs/standard_fonts/', import.meta.url).href,
    });

    const inspect = async () => {
      const pdf = await task.promise;
      if (pdf.numPages > MAX_PAGES) return stop(report, 'report.limit.warning.4');
      let characters = 0;
      let words = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        if (invalidStream) throw new Error('invalid-pdf-stream');
        const text = content.items
          .map(item => (typeof item.str === 'string' ? item.str : ''))
          .join(' ')
          .trim();
        characters += text.length;
        if (characters > MAX_TEXT) return stop(report, 'report.limit.warning.5');
        words += countWords(text);
        page.cleanup();
        progress({ completed: number, total: pdf.numPages, unit: 'page' });
      }

      const pages = pdf.numPages;
      report.findings.push(makeFinding('report.readable.pass.2', { pages, plural: pages === 1 ? '' : 's' }));
      report.findings.push(makeFinding('report.word-format.warning.2'));
      if (!/\.pdf$/i.test(file.name)) report.findings.push(makeFinding('report.extension.warning.2'));
      if (!words) report.findings.push(makeFinding('report.pdf-text.warning'));
      else report.findings.push(makeFinding('report.words.pass.2', { count: words.toLocaleString() }));
      report.complete = true;
      report.pageCount = pages;
      return report;
    };
    return await Promise.race([inspect(), timedOut]);
  } catch (error) {
    if (error.message === 'checker-timeout') return stop(report, 'report.limit.warning.6');
    if (error.name === 'PasswordException') return stop(report, 'report.encrypted.error');
    return stop(report, 'report.pdf-unreadable.error');
  } finally {
    clearTimeout(timer);
    if (task) await task.destroy().catch(() => {});
    if (console.warn === captureWarning) console.warn = originalWarn;
  }
}
