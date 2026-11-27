// Checks a report: a PDF, or a Word (DOCX) or OpenDocument (ODT) file, which are ZIPs of XML.
// prepareReport runs in the worker: it reads a PDF completely, or unpacks a DOCX or ODT and
// checks its CRCs. Its XML then comes to the page, where inspectReport reads it with the
// browser's XML parser, which workers do not have.
import { makeFinding } from './findings.js';
import { readArchive, ArchiveError } from './archive.js';
import { checkPdfReport, countWords, wordCount } from './report-pdf.js';

const WORD_NS = [
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
];
const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const OFFICE_DOCUMENT_RELATIONSHIP =
  /^(http:\/\/schemas.openxmlformats.org\/officeDocument\/2006|http:\/\/purl.oclc.org\/ooxml\/officeDocument)\/relationships\/officeDocument$/;
const ODF_NS = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
const ODF_TEXT_NS = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const MANIFEST_NS = 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const ODT_TYPE = 'application/vnd.oasis.opendocument.text';
// The first bytes of an old binary Word (.doc) file.
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
// The total XML text passed to the page, whose XML parser runs synchronously.
const MAX_XML = 2 * 1024 * 1024;
// DOM node types. The Node interface itself does not exist in workers, which also load this file.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// The check stops with this one finding.
const stop = (report, key, values) => ({ ...report, complete: false, findings: [makeFinding(key, values)] });

// XML may be UTF-8 or UTF-16, which starts with a byte-order mark or with '<' as two bytes.
function xmlDecoder(chunk) {
  const little = (chunk[0] === 0xff && chunk[1] === 0xfe) || (chunk[0] === 0x3c && chunk[1] === 0);
  const big = (chunk[0] === 0xfe && chunk[1] === 0xff) || (chunk[0] === 0 && chunk[1] === 0x3c);
  return new TextDecoder(little ? 'utf-16le' : big ? 'utf-16be' : 'utf-8', { fatal: true });
}

// Returns {report} when the check is already finished (a PDF, or a file that could not be read),
// or {report, name, parts} for inspectReport to finish, where parts are the files' paths and text.
export async function prepareReport(file, options = {}) {
  const report = { findings: [], complete: false };
  const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const startsWith = bytes => bytes.every((byte, i) => header[i] === byte);
  const isZip = startsWith([0x50, 0x4b]);
  if (!isZip && (/%PDF-\d\.\d/.test(new TextDecoder().decode(header)) || /\.pdf$/i.test(file.name))) {
    return { report: await checkPdfReport(file, report, options) };
  }
  if (startsWith(OLE_SIGNATURE)) return { report: stop(report, 'report.unsupported.warning') };
  try {
    const archive = await readArchive(file, {
      ...options,
      textPattern: /\.(xml|rels)$|(^|\/)mimetype$/i,
      decoderFactory: xmlDecoder,
    });
    const files = [...archive.files.values()];
    const textLength = files.reduce((total, part) => total + (part.text?.length || 0), 0);
    if (textLength > MAX_XML) return { report: stop(report, 'report.limit.warning') };
    return { report, name: file.name, parts: files.map(({ path, text }) => ({ path, text })) };
  } catch (error) {
    if (!(error instanceof ArchiveError)) throw error;
    if (error.id === 'archive.encrypted') return { report: stop(report, 'report.encrypted.error') };
    if (error.id === 'archive.compression') return { report: stop(report, 'report.compression.warning') };
    if (error.id === 'archive.limit' || error.id === 'archive.timeout') {
      return { report: stop(report, 'report.limit.warning.2') };
    }
    return { report: stop(report, 'report.unreadable.error') };
  }
}

// Entity declarations, and a document type declaration with its own internal section, are
// refused: entities can expand without limit. A plain declaration naming an external DTD is
// allowed, since browsers never load it; OpenOffice and macOS TextEdit write one in an ODT's
// META-INF/manifest.xml.
function parseXml(text) {
  if (text == null || /<!DOCTYPE[^>]*\[|<!ENTITY/i.test(text)) throw new Error('xml');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || !doc.documentElement) throw new Error('xml');
  return doc;
}

// The path inside the package that a relationship's target names, relative to the part source.
// Throws for a target that is a URL or would leave the package.
function resolvePart(source, target) {
  if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.includes('\\')) throw new Error('path');
  const decoded = decodeURIComponent(target.split('#')[0]);
  const segments = decoded.startsWith('/') ? [] : source.split('/').slice(0, -1);
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) throw new Error('path');
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

// The text of the document body, with a line break after each paragraph.
function bodyText(body, format) {
  const isWord = node => format === 'DOCX' && WORD_NS.includes(node.namespaceURI);
  const isOdfText = node => format === 'ODT' && node.namespaceURI === ODF_TEXT_NS;
  let text = '';
  function walk(node) {
    if (node.nodeType === TEXT_NODE) {
      // Word keeps its text in <w:t> elements, so other text in its XML is not document text.
      if (format === 'ODT') text += node.nodeValue;
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;
    if (isWord(node)) {
      if (node.localName === 't') {
        text += node.textContent;
        return;
      }
      if (['tab', 'br', 'cr'].includes(node.localName)) text += ' ';
    }
    if (isOdfText(node) && ['s', 'tab', 'line-break'].includes(node.localName)) text += ' ';
    for (const child of node.childNodes) walk(child);
    const paragraph =
      (isWord(node) && node.localName === 'p') || (isOdfText(node) && ['p', 'h'].includes(node.localName));
    if (paragraph) text += '\n';
  }
  walk(body);
  return text.replace(/[​﻿]/g, '').trim();
}

// ODT encrypts individual parts rather than the ZIP itself, as its clear manifest says.
function isEncryptedOdt(files) {
  if (!files.has('META-INF/manifest.xml')) return false;
  const manifest = parseXml(files.get('META-INF/manifest.xml').text);
  return manifest.getElementsByTagNameNS(MANIFEST_NS, 'encryption-data').length > 0;
}

// The body of an ODT, after checking that every part its manifest lists is present.
// Throws when the structure is broken.
function odtBody(files, xmls) {
  const content = xmls.get('content.xml');
  const root = content?.documentElement;
  if (root?.namespaceURI !== ODF_NS || root.localName !== 'document-content') throw new Error('main');
  const body = content.getElementsByTagNameNS(ODF_NS, 'text')[0];
  const manifest = xmls.get('META-INF/manifest.xml');
  if (!manifest || !body) throw new Error('main');
  for (const entry of manifest.getElementsByTagNameNS(MANIFEST_NS, 'file-entry')) {
    const target = entry.getAttributeNS(MANIFEST_NS, 'full-path');
    if (target && !target.endsWith('/') && !files.has(resolvePart('', target))) throw new Error('missing');
  }
  return body;
}

// The body of a DOCX, after checking that every part a relationship names is present.
// Null when the main part is not a Word document (such as a macro-enabled .docm).
// Throws when the structure is broken.
function docxBody(files, xmls) {
  const relationships = xmls.get('_rels/.rels').getElementsByTagNameNS(RELATIONSHIPS_NS, 'Relationship');
  const office = [...relationships].find(r => OFFICE_DOCUMENT_RELATIONSHIP.test(r.getAttribute('Type')));
  if (!office || office.getAttribute('TargetMode') === 'External') throw new Error('main');
  const mainPath = resolvePart('', office.getAttribute('Target'));
  const overrides = xmls.get('[Content_Types].xml').getElementsByTagNameNS(CONTENT_TYPES_NS, 'Override');
  const mainType = [...overrides]
    .find(override => resolvePart('', override.getAttribute('PartName')) === mainPath)
    ?.getAttribute('ContentType');
  if (mainType !== DOCX_TYPE) return null;

  const main = xmls.get(mainPath);
  const root = main?.documentElement;
  if (!main || !WORD_NS.includes(root.namespaceURI) || root.localName !== 'document') throw new Error('main');
  const body = main.getElementsByTagNameNS(root.namespaceURI, 'body')[0];
  if (!body) throw new Error('main');

  // word/_rels/document.xml.rels holds the relationships of word/document.xml.
  for (const [name, doc] of xmls) {
    if (!name.endsWith('.rels')) continue;
    const source = name === '_rels/.rels' ? '' : name.replace(/(^|\/)_rels\//, '$1').replace(/\.rels$/, '');
    for (const relationship of doc.getElementsByTagNameNS(RELATIONSHIPS_NS, 'Relationship')) {
      if (relationship.getAttribute('TargetMode') === 'External') continue;
      if (!files.has(resolvePart(source, relationship.getAttribute('Target')))) throw new Error('missing');
    }
  }
  return body;
}

// A document with no words may still hold its work as images or equations.
function hasVisualContent(body, parts) {
  const visual = ['drawing', 'pict', 'object', 'frame', 'image', 'math', 'oMath'];
  return (
    [...body.getElementsByTagName('*')].some(node => visual.includes(node.localName)) ||
    parts.some(part => /^(word\/media|Pictures)\//.test(part.path))
  );
}

// Finishes the check that prepareReport started.
export function inspectReport(prepared) {
  const { report, name, parts } = prepared;
  if (!parts) return report;
  const files = new Map(parts.map(part => [part.path, part]));
  const isOdt = files.get('mimetype')?.text?.trim() === ODT_TYPE;
  // A ZIP that is neither a DOCX nor an ODT: a report, or the project, put in a ZIP.
  if (!isOdt && !(files.has('[Content_Types].xml') && files.has('_rels/.rels'))) {
    return stop(report, 'report.zipped.error');
  }
  let format;
  let body;
  try {
    // Read before the other XML, since an encrypted part cannot be parsed.
    if (isOdt && isEncryptedOdt(files)) return stop(report, 'report.encrypted.error');
    const xmls = new Map();
    for (const part of parts) {
      if (/\.(xml|rels)$/i.test(part.path)) xmls.set(part.path, parseXml(part.text));
    }
    if (isOdt) {
      format = 'ODT';
      body = odtBody(files, xmls);
    } else {
      format = 'DOCX';
      body = docxBody(files, xmls);
      if (!body) return stop(report, 'report.format.warning');
    }
  } catch {
    return stop(report, 'report.structure.error');
  }

  report.findings.push(makeFinding('report.readable.pass', { format }));
  if (format === 'ODT') report.findings.push(makeFinding('report.word-format.warning'));
  const extension = format.toLowerCase();
  if (!name.toLowerCase().endsWith('.' + extension)) {
    report.findings.push(makeFinding('report.extension.warning', { format, extension }));
  }
  const words = countWords(bodyText(body, format));
  if (words) report.findings.push(wordCount(words));
  else if (hasVisualContent(body, parts)) report.findings.push(makeFinding('report.empty.warning'));
  else report.findings.push(makeFinding('report.empty.error'));
  report.complete = true;
  return report;
}
