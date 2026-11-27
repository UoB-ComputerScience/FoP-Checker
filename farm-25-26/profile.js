// SHA-256 of each starter source's code, without comments and with uniform layout, as the
// fop.starter check reads it (codeOnly in checker/js/checker.js).
const starter = {
  'src/uk/ac/bradford/farmgame/Entity.java':
    '485b6bb1da956007486cab82701f6dcd15ca23bfcb501ae3f59d57538f303145',
  'src/uk/ac/bradford/farmgame/GameEngine.java':
    '306edca467834bded70ba7ecb0321c8c7af2ad3f476c44cc61caecbd9df4d73d',
  'src/uk/ac/bradford/farmgame/GameGUI.java':
    'c3e58d361ebc6625ab6078cf1dee31d2a96c460a14b217fd94aaca2533a20591',
  'src/uk/ac/bradford/farmgame/InputHandler.java':
    '56693f32d1fad770518aed7ae2bc22c23b2ad47666891cba51979a9a7ac5e757',
  'src/uk/ac/bradford/farmgame/Launcher.java':
    '1912b81287ecfaf97213982e0004ca02e0679df1f93ed4cba9faa18e11a0b851',
  'src/uk/ac/bradford/farmgame/Pest.java': 'e97e7ce5037443fa00dd7d02d9ab91f8d2dbe2de52e7b3ea25d109309ecd72da',
  'src/uk/ac/bradford/farmgame/Player.java':
    '95f7d4fd11ec391b26e60094aeef007272f327cdb213350ec126d8e4f4f51ef2',
  'src/uk/ac/bradford/farmgame/Rock.java': '75f6b59a988c318981f2241f875b5a6132d95be1c635d761fd95a87b6831f864',
  'src/uk/ac/bradford/farmgame/Tile.java': '0e962a87fba4ece4c4aa6366df7596bafddd838f404d0b8a717b0f16875e9275',
  'src/uk/ac/bradford/farmgame/Tree.java': '09bf9c2e5281e95eb777a736152b5a8c85e8788926745a4eb17cf87107d32cd6',
};

export default {
  id: 'farm-25-26',
  title: 'Farm',
  package: 'uk.ac.bradford.farmgame',
  rootMarker: 'src/uk/ac/bradford/farmgame/GameEngine.java',
  checks: [
    'java.sources',
    'fop.package',
    'archive.extras',
    'netbeans.project',
    'fop.files',
    'java.syntax',
    'java.declarations',
    'fop.availability',
    'fop.starter',
    'submission.report',
  ],
  expectedProjectFiles: [
    'build.xml',
    'nbproject/project.xml',
    'nbproject/project.properties',
    'nbproject/build-impl.xml',
  ],
  expectedSourceFiles: Object.keys(starter),
  javaVersion: '24',
  starter,
  availability: new URL('./availability.json', import.meta.url),
  assets: [
    'axeBox',
    'bed',
    'crop',
    'dirt',
    'hoeBox',
    'houseFloor',
    'pest',
    'pickaxeBox',
    'player',
    'playerWithAxe',
    'playerWithHoe',
    'playerWithPick',
    'playerWithSeeds',
    'rock',
    'seedBox',
    'sowedDirt',
    'stoneGround',
    'tilledDirt',
    'tree',
    'wall',
  ].map(n => `assets/${n}.png`),
};
