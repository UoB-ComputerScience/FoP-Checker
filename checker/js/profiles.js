import farm from '../../farm-25-26/profile.js';
import diver from '../../diver-26-27/profile.js';

export const LIMITS = Object.freeze({
  archiveBytes: 25 * 1024 * 1024, // the file chosen, ZIP or report
  expandedBytes: 100 * 1024 * 1024, // everything in the ZIP once decompressed
  entryBytes: 10 * 1024 * 1024, // any one file in the ZIP once decompressed
  entries: 4000, // files and folders in the ZIP
  milliseconds: 30000, // the whole check
});

// One entry per coursework, newest first. Each has a folder named after its id that
// holds its page and profile; the site build and the tests read this list.
export const COURSEWORKS = [diver, farm];

const PROFILES = [
  ...COURSEWORKS,
  // The packaging checks only, with no coursework details. No page uses it; the tests do.
  { id: 'java-general', checks: ['java.sources', 'archive.extras'] },
];

export function getProfile(id) {
  const profile = PROFILES.find(candidate => candidate.id === id);
  if (!profile) throw new Error('Choose a recognised coursework profile.');
  return profile;
}
