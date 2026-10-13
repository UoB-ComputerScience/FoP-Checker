import farm from '../../farm-25-26/profile.js';
import diver from '../../diver-26-27/profile.js';

export const LIMITS = Object.freeze({ archiveBytes:25*1024*1024, expandedBytes:100*1024*1024, entryBytes:10*1024*1024, entries:4000, milliseconds:30000 });
// One entry per coursework, newest first. Each has a folder named after its id that
// holds its page and profile; the site build and the tests read this list.
export const COURSEWORKS = [diver, farm];
const PROFILES = [
  ...COURSEWORKS,
  {
    id:'java-general',
    checks:['java.sources','archive.extras'],
  },
];

export function getProfile(id) {
  const profile = PROFILES.find(p=>p.id===id);
  if (!profile) throw new Error('Choose a recognised coursework profile.');
  return profile;
}
