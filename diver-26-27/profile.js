// SHA-256 of each starter source, after removing a leading BOM and turning every line ending
// into \n, as the fop.starter check does. The other sources are the same in every release.
const starter = {
  'src/uk/ac/bradford/divegame/Chest.java':
    'cb3e2cede43ab44d98a98ca193ef79166ac6eec169b4e90083036c7a244f49f5',
  'src/uk/ac/bradford/divegame/Diver.java':
    'dcd60eb7643f373dc623cfaab1666db8983acab0281d7532e8e9cb6264564b94',
  'src/uk/ac/bradford/divegame/Entity.java':
    'e94977b30761184a4d16efab5e126bed6b2c875922300524a0ad716061b1d9f0',
  // GameEngine.java changed between releases; an unchanged copy of any of them is the starter.
  'src/uk/ac/bradford/divegame/GameEngine.java': [
    'b5f3c0dfcbc249b9c847c168b26923bbfebf015b4f53c1a1a5e2de8d4096659b', // FoPCW2026.zip
    '9a85daf9fa63811ce6b9126c6c5feeeb31d066d84b008c2e09ad274cb0d4dccd', // FoPCW2026-1.zip (spec v1.1)
    '48c3a16e9458f542dea66bac20619723e5dba9c88867fca3d39f3a40b5d9d8c5', // FoPCW2026-2.zip (spec v1.2)
  ],
  'src/uk/ac/bradford/divegame/GameGUI.java':
    '4d3dbf5dda4d3c11e9999835c8b79e78378433483ec61385d5baf0b77852c4f6',
  'src/uk/ac/bradford/divegame/InputHandler.java':
    '663e886617e7a4c32185a3047900d2d7ad82d903729100e640ceb55553d59c9a',
  'src/uk/ac/bradford/divegame/Launcher.java':
    'b02db2bb8b2d1ec953056593554e5c29cd8e93d1e6ba23c57acdbe53d505305f',
  'src/uk/ac/bradford/divegame/MapTile.java':
    '5176e8ad3e0cd14208746c36ff485f03eabfced30fb62602e1305af5673b0e4e',
  'src/uk/ac/bradford/divegame/Shark.java':
    '087c8c09a0fcf3ace657b5ba7734557f956782ca62fbe5e7b867263ca1b5a494',
  'src/uk/ac/bradford/divegame/SubmarineLeft.java':
    '3e374f34a1e9f5ae7c6278059c1d759781578c7717f0376603ae6015f22f7ccc',
  'src/uk/ac/bradford/divegame/SubmarineRight.java':
    '72f3e1f9cd7388ea009debebaf71dde72995060b0db9df6a550116422363dc9c',
  'src/uk/ac/bradford/divegame/Urchin.java':
    '8716f53ebc4b50ade9b2983397405346f8c62203db9e0276df4de9fe2908e8ae',
};

export default {
  id: 'diver-26-27',
  rootMarker: 'src/uk/ac/bradford/divegame/GameEngine.java',
  checks: [
    'java.sources',
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
    'chest',
    'coral1',
    'coral2',
    'crab',
    'deepSea',
    'diver',
    'pearl',
    'rockWall',
    'ruby',
    'seaweed',
    'shallowSea',
    'shallowToDeepSea',
    'shark',
    'sky',
    'squid',
    'starfish',
    'submarineLeft',
    'submarineRight',
    'surface',
    'urchin',
  ].map(n => `assets/${n}.png`),
};
