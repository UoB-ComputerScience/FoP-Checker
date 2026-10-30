// The page script. A coursework page has two checkers: one for the ZIP and one for the report.
// Each checks its file in a worker that can be stopped, then shows the findings it sends back.
import { getProfile, LIMITS } from './profiles.js';
import { inspectReport } from './report.js';

const SYMBOLS = { error: '!', warning: '!', pass: '✓', info: '—' };
const UNFINISHED =
  'The check did not finish. Reload the page or ask your module team for help. No file was uploaded.';

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function displaySize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function resultsTitle(complete, errors, warnings) {
  if (!complete) return 'Check incomplete';
  if (errors) return 'Files need attention';
  if (warnings) return 'Check these items';
  return 'No file issues found';
}

function findingCard(finding) {
  const card = element('article', undefined, `finding ${finding.status}`);
  const line = element('p', undefined, 'finding-line');
  const icon = element('span', SYMBOLS[finding.status], 'finding-symbol');
  icon.setAttribute('aria-hidden', 'true');
  line.append(icon, element('strong', finding.title));
  if (finding.message) line.append(document.createTextNode(' — ' + finding.message));
  card.append(line);
  if (finding.paths.length) card.append(pathList(finding));
  return card;
}

// A finding can name thousands of files, so its list is only filled in when first opened.
function pathList(finding) {
  const details = element('details', undefined, 'finding-paths');
  const noun = finding.list || 'file path';
  details.append(element('summary', `Show ${plural(finding.paths.length, noun)}`));
  const list = element('ul');
  details.append(list);
  details.addEventListener('toggle', () => {
    if (!details.open || list.childElementCount) return;
    for (const path of finding.paths) list.append(element('li', path));
  });
  return details;
}

function collapsedGroup(label, findings) {
  const details = element('details', undefined, 'result-details');
  details.append(element('summary', `${label} (${findings.length})`));
  for (const finding of findings) details.append(findingCard(finding));
  return details;
}

// prefix: the start of the ids of this checker's elements ('' for the ZIP, 'report-' for the report).
function createChecker(prefix, kind) {
  const byId = name => document.getElementById(prefix + name);
  const isReport = kind === 'report';
  const resultsPanel = byId('results-title').closest('.results-panel');
  const dropZone = byId('drop-zone');
  let worker = null;
  let deadline = null;
  let profile = null;

  function stop() {
    worker?.terminate();
    worker = null;
    clearTimeout(deadline);
    byId('cancel').hidden = true;
    resultsPanel.setAttribute('aria-busy', 'false');
  }

  function clearResults() {
    byId('findings').replaceChildren();
    if (!isReport) {
      byId('inventory').hidden = true;
      byId('file-list').replaceChildren();
    }
  }

  function showProblem(title, message) {
    stop();
    clearResults();
    byId('empty-state').hidden = true;
    byId('results-title').textContent = title;
    byId('status').textContent = message;
  }

  function showResults(result) {
    stop();
    byId('empty-state').hidden = true;
    const errors = result.findings.filter(finding => finding.status === 'error');
    const warnings = result.findings.filter(finding => finding.status === 'warning');
    byId('results-title').textContent = resultsTitle(result.complete, errors.length, warnings.length);

    const counts = [
      errors.length ? `${errors.length} critical` : null,
      warnings.length ? `${warnings.length} advisory` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    let status;
    if (!result.complete) status = `${counts}. Further checks were not run.`;
    else if (errors.length || warnings.length) status = counts;
    else status = isReport ? 'Report file checks complete.' : 'ZIP file checks complete.';
    if (isReport && result.pageCount) status += ` · ${plural(result.pageCount, 'page')}`;
    byId('status').textContent = status;

    const findings = byId('findings');
    findings.replaceChildren();
    const issueGroups = [
      [errors, 'Critical — fix before submitting'],
      [warnings, 'Advisory — please review'],
    ];
    for (const [group, heading] of issueGroups) {
      if (!group.length) continue;
      const section = element('section', undefined, 'issue-group');
      section.append(element('h3', heading));
      for (const finding of group) section.append(findingCard(finding));
      findings.append(section);
    }
    const notes = result.findings.filter(finding => finding.status === 'info');
    if (notes.length) findings.append(collapsedGroup('Notes', notes));
    const passes = result.findings.filter(finding => finding.status === 'pass');
    if (passes.length) findings.append(collapsedGroup('Passed checks', passes));

    if (!isReport && result.files.length) showInventory(result.files);
  }

  function showInventory(files) {
    const inventory = byId('inventory');
    inventory.hidden = false;
    inventory.open = false;
    byId('file-count').textContent = `(${files.length})`;
    byId('file-list').replaceChildren(
      ...files.map(file => element('li', `${file.path} · ${displaySize(file.size)}`)),
    );
  }

  function handleMessage(message) {
    if (message.type === 'progress') {
      const unit = message.unit === 'page' ? 'page' : 'file';
      byId('status').textContent = `Reading ${unit} ${message.completed} of ${message.total}…`;
    } else if (message.type === 'report-package') {
      // The worker has unpacked the report; its XML is read here, where the browser's XML parser is.
      try {
        showResults(inspectReport(message.prepared));
      } catch {
        showProblem(
          'The report check did not finish',
          'Open your report in its editor to check it, or try saving a fresh copy.',
        );
      }
    } else if (message.type === 'result') {
      showResults(message.report);
    } else {
      showProblem('The checker encountered a problem', UNFINISHED);
    }
  }

  function run(file) {
    if (!profile) return;
    stop();
    clearResults();
    byId('selected-file').hidden = false;
    byId('filename').textContent = file.name;
    byId('file-details').textContent = displaySize(file.size);
    byId('empty-state').hidden = true;
    if (file.size > LIMITS.archiveBytes) {
      showProblem('File too large', 'Choose a file up to 25 MiB.');
      return;
    }
    // The ZIP check fingerprints the starter files with Web Crypto.
    if (!globalThis.Worker || (!isReport && !globalThis.crypto?.subtle)) {
      showProblem(
        'This browser cannot run the checker',
        'Open the checker in an up-to-date browser using the link provided by your module team.',
      );
      return;
    }
    byId('results-title').textContent = 'Checking…';
    byId('status').textContent = isReport ? 'Reading your report.' : 'Reading your ZIP file.';
    byId('cancel').hidden = false;
    resultsPanel.setAttribute('aria-busy', 'true');

    let current;
    try {
      current = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch {
      showProblem(
        'The checker could not start',
        'Reload the page or try another current browser. No file was uploaded.',
      );
      return;
    }
    // Messages from a worker that has since been stopped or replaced are ignored.
    worker = current;
    deadline = setTimeout(() => {
      if (worker !== current) return;
      showProblem(
        'The check was stopped',
        'Checking exceeded 30 seconds. Try a smaller export or ask your module team for help.',
      );
    }, LIMITS.milliseconds);
    current.onmessage = event => {
      if (worker === current) handleMessage(event.data);
    };
    current.onerror = () => {
      if (worker === current) showProblem('The checker encountered a problem', UNFINISHED);
    };
    current.postMessage({ file, profileId: profile.id, kind });
  }

  byId('file').addEventListener('change', event => {
    if (event.target.files.length) run(event.target.files[0]);
    // Cleared so that choosing the same file again checks it again.
    event.target.value = '';
  });
  byId('cancel').addEventListener('click', () => {
    showProblem('Check cancelled', 'Choose another file, or select the same file to check it again.');
  });
  for (const type of ['dragenter', 'dragover']) {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      if (profile) dropZone.classList.add('drag-over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    dropZone.addEventListener(type, event => {
      event.preventDefault();
      dropZone.classList.remove('drag-over');
    });
  }
  dropZone.addEventListener('drop', event => {
    if (!profile) return;
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      const what = isReport ? 'the report' : 'the coursework ZIP';
      showProblem('Choose one file at a time', `Drop ${what} you want to check.`);
      return;
    }
    run(files[0]);
  });

  try {
    profile = getProfile(document.body.dataset.coursework);
  } catch {
    byId('file').disabled = true;
    dropZone.setAttribute('aria-disabled', 'true');
    showProblem('Coursework checker unavailable', 'Ask your module team for the correct checker link.');
  }
}

// A file dropped outside a drop zone would otherwise be opened by the browser, leaving the page.
// Refusing the drop there shows a "not allowed" cursor instead.
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, event => {
    if (event.target instanceof Element && event.target.closest('.drop-zone')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'none';
  });
}

createChecker('', 'zip');
createChecker('report-', 'report');
