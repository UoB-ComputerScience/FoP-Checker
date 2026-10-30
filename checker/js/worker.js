// Runs one check off the page, so the page stays responsive and the check can be stopped
// by ending the worker. Sends progress messages, then one result or an error.
import { checkSubmission } from './checker.js';
import { prepareReport } from './report.js';

self.onmessage = async event => {
  const { file, profileId, kind } = event.data;
  const progress = update => self.postMessage({ type: 'progress', ...update });
  try {
    if (kind === 'report') {
      // The report is unpacked here and finished on the page; see report.js.
      const prepared = await prepareReport(file, { progress });
      self.postMessage({ type: 'report-package', prepared });
      return;
    }
    const report = await checkSubmission(file, profileId, { progress });
    self.postMessage({ type: 'result', report });
  } catch {
    self.postMessage({ type: 'error' });
  }
};
