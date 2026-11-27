// SHA-256 of each starter source's code, without comments and with uniform layout, as the
// fop.starter check reads it (codeOnly in checker/js/checker.js). Only GameEngine.java differs
// between releases.
const starter = {
  'src/uk/ac/bradford/divegame/Chest.java':
    '8197033755303793fc2c4e6147289e82bd339d7083446dc376b367ea7f03ce8c',
  'src/uk/ac/bradford/divegame/Diver.java':
    '04987e5eb0361a51ae8d36c37ee50a49e3d14edbe70121878c54ccba137ea7ac',
  'src/uk/ac/bradford/divegame/Entity.java':
    'f6f327211a9f4e289dd2f7bdca2b628def8e7b9635f4d5658de50a57f0fd85fa',
  // GameEngine.java changed between releases; an unchanged copy of any of them is the starter.
  'src/uk/ac/bradford/divegame/GameEngine.java': [
    'a4df53462ba9e5280f12b550244031c3b9819bac4a06cba20037b9c91d51a354', // FoPCW2026.zip
    'aaa1c6e8b70c1f11b71f08abea046702ab2b02a8588210736945c11de974dd90', // FoPCW2026-1.zip (spec v1.1)
    'b7c139c095616cd812cf83e970aac92bd722673971a3da7369e1009f537dc753', // FoPCW2026-2.zip (spec v1.2)
  ],
  'src/uk/ac/bradford/divegame/GameGUI.java':
    'e20b611e06d4271e8bd51674ea550a7f50d7028a53e3a0d64489f5678a3c9ec1',
  'src/uk/ac/bradford/divegame/InputHandler.java':
    'e4c9e265c20acbbacdc30df2a0217e8d9e658d07249cac6d9af3f4006425a3bd',
  'src/uk/ac/bradford/divegame/Launcher.java':
    '2f6be8a554e206a721926d1e1a69658ce757849f9330e91d4eb5a0ffeeb2a4bd',
  'src/uk/ac/bradford/divegame/MapTile.java':
    '649752ad30257141ad15898ab38d34d4240e718a99e2308497fe40236b649bf0',
  'src/uk/ac/bradford/divegame/Shark.java':
    '5ab2f3514a63d8d6a2515fd8ed90db294dfe8ba9e48b74b00883e93f7c078524',
  'src/uk/ac/bradford/divegame/SubmarineLeft.java':
    '060f0330a0bbd3a2b5226b231b1acf3d3deaed440072ba391c5e2981e859c4d2',
  'src/uk/ac/bradford/divegame/SubmarineRight.java':
    '467a495f0deffd86d71ea1413e6b5116fb91219097fd25e46d32dc926c9b4359',
  'src/uk/ac/bradford/divegame/Urchin.java':
    '0ab28ffc3abb9143bfb74800554bfba064e9210e858a36e1dd6129ce5c6cf5b8',
};

export default {
  id: 'diver-26-27',
  title: 'Diver',
  package: 'uk.ac.bradford.divegame',
  rootMarker: 'src/uk/ac/bradford/divegame/GameEngine.java',
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
