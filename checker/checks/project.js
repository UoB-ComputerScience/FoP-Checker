// Edit result titles, messages and severity here. No build step is needed.
// status: error = critical, warning = advisory, pass = passed, info = note.
// Keep keys, ids and {placeholders} unchanged; use an empty message for title only.
// Entries are possible outcomes, not a fixed list shown for every file.
// purpose and method document the reasoning for maintainers; they are not shown to students.
// These checks inspect coursework files inside a readable ZIP.
export default {
  "java.sources.error": {
    "id": "java.sources",
    "status": "error",
    "title": "Java source files: missing",
    "message": "Export the complete project, including .java files.",
    "purpose": "Ensure editable source code is included.",
    "method": "Count .java filenames throughout the ZIP; compiled classes and JARs do not count."
  },
  "java.sources.pass": {
    "id": "java.sources",
    "status": "pass",
    "title": "Java source files: {count} found",
    "message": "",
    "purpose": "Ensure editable source code is included.",
    "method": "Count .java filenames throughout the ZIP; compiled classes and JARs do not count."
  },
  "java.empty.warning": {
    "id": "java.empty",
    "status": "warning",
    "title": "Java source files: empty files found",
    "message": "Check the listed files.",
    "purpose": "Identify accidentally blank source files.",
    "method": "Check Java files for zero bytes or decoded text containing only whitespace."
  },
  "java.encoding.warning": {
    "id": "java.encoding",
    "status": "warning",
    "title": "Source encoding: not UTF-8",
    "message": "Confirm the encoding in your project.",
    "purpose": "Explain why source text cannot be inspected.",
    "method": "Attempt UTF-8 decoding; flag failures without treating the ZIP as damaged."
  },
  "archive.nested.warning": {
    "id": "archive.nested",
    "status": "warning",
    "title": "Nested archives: found",
    "message": "Check that these are needed, rather than older or unopened exports.",
    "purpose": "Identify older exports or projects still inside another archive.",
    "method": "Find archive extensions among ZIP entries; nested archives are not opened."
  },
  "archive.generated.warning": {
    "id": "archive.generated",
    "status": "warning",
    "title": "Development files: included",
    "message": "Remove unnecessary files; keep required libraries.",
    "purpose": "Identify potentially unnecessary development material.",
    "method": "Find .git, node_modules and target folders, plus .log files."
  },
  "archive.backups.warning": {
    "id": "archive.backups",
    "status": "warning",
    "title": "Backup files: found",
    "message": "Remove older copies if they are not needed.",
    "purpose": "Help students identify accidentally included older versions.",
    "method": "Find .bak, .old and .tmp extensions and filenames ending in a tilde."
  },
  "archive.portability.warning": {
    "id": "archive.portability",
    "status": "warning",
    "title": "Filenames: possible Windows incompatibility",
    "message": "Check the listed names before exporting.",
    "purpose": "Identify filenames likely to fail on Windows.",
    "method": "Check reserved names, invalid characters and trailing dots or spaces."
  },
  "netbeans.project.warning": {
    "id": "netbeans.project",
    "status": "warning",
    "title": "NetBeans project: not recognised",
    "message": "Export the complete project.",
    "purpose": "Ensure one identifiable project includes the files needed by its saved configuration.",
    "method": "Locate the project using NetBeans metadata, with build.xml and the coursework's main source file as fallbacks. A pass requires one root, all expected build files and a .java file under the configured source folder; wrapper and renamed folders are allowed."
  },
  "netbeans.project.warning.2": {
    "id": "netbeans.project",
    "status": "warning",
    "title": "NetBeans project: multiple projects found",
    "message": "Export your final project. Further project checks were skipped.",
    "purpose": "Ensure one identifiable project includes the files needed by its saved configuration.",
    "method": "Locate the project using NetBeans metadata, with build.xml and the coursework's main source file as fallbacks. A pass requires one root, all expected build files and a .java file under the configured source folder; wrapper and renamed folders are allowed."
  },
  "netbeans.project.pass": {
    "id": "netbeans.project",
    "status": "pass",
    "title": "NetBeans project: build files and source folder checked",
    "message": "",
    "purpose": "Ensure one identifiable project includes the files needed by its saved configuration.",
    "method": "Locate the project using NetBeans metadata, with build.xml and the coursework's main source file as fallbacks. A pass requires one root, all expected build files and a .java file under the configured source folder; wrapper and renamed folders are allowed."
  },
  "netbeans.files.warning": {
    "id": "netbeans.files",
    "status": "warning",
    "title": "NetBeans build files: missing files",
    "message": "Check the listed files, or confirm your custom build setup.",
    "purpose": "Identify incomplete project exports while allowing custom build setups.",
    "method": "Within the detected project, check build.xml and nbproject/project.xml, project.properties and build-impl.xml. List missing paths; do not emit the combined NetBeans pass."
  },
  "netbeans.source-path.error": {
    "id": "netbeans.source-path",
    "status": "error",
    "title": "Source folder: no Java files in {folder}",
    "message": "Include the Java files here or correct the project settings.",
    "purpose": "Catch Java files exported outside the source folder configured in NetBeans.",
    "method": "Read a simple relative src.dir property and look for .java files beneath it. Other files alone do not pass. Custom expressions are not resolved, so receive a note rather than a guessed failure."
  },
  "netbeans.source-path.info": {
    "id": "netbeans.source-path",
    "status": "info",
    "title": "Source folder: custom setting",
    "message": "Open the project in NetBeans to check it.",
    "purpose": "Catch Java files exported outside the source folder configured in NetBeans.",
    "method": "Read a simple relative src.dir property and look for .java files beneath it. Other files alone do not pass. Custom expressions are not resolved, so receive a note rather than a guessed failure."
  },
  "netbeans.java-version.pass": {
    "id": "netbeans.java-version",
    "status": "pass",
    "title": "Java version: {version} configured",
    "message": "",
    "purpose": "Identify settings that differ from the coursework Java environment.",
    "method": "Compare javac.source, javac.target and optional javac.release with the profile Java version. This reads saved settings; it does not compile."
  },
  "netbeans.java-version.warning": {
    "id": "netbeans.java-version",
    "status": "warning",
    "title": "Java version: expected {version}",
    "message": "Found source={source}, target={target}{releaseSetting}.",
    "purpose": "Identify settings that differ from the coursework Java environment.",
    "method": "Compare javac.source, javac.target and optional javac.release with the profile Java version. This reads saved settings; it does not compile."
  },
  "fop.files.info": {
    "id": "fop.files",
    "status": "info",
    "title": "Coursework files: not checked",
    "message": "A single project folder is needed.",
    "purpose": "Avoid guessing the coursework layout when the project root is ambiguous.",
    "method": "Skip expected coursework paths if no single project root was identified."
  },
  "fop.source-files.warning": {
    "id": "fop.source-files",
    "status": "warning",
    "title": "Starter source files: missing paths",
    "message": "Check the listed files. Intentional restructuring is allowed.",
    "purpose": "Identify original classes potentially omitted from an export.",
    "method": "Compare paths with the starter source paths in the coursework profile. Missing paths are advisory because intentional restructuring is allowed."
  },
  "fop.source-files.pass": {
    "id": "fop.source-files",
    "status": "pass",
    "title": "Starter source files: all {count} present",
    "message": "",
    "purpose": "Identify original classes potentially omitted from an export.",
    "method": "Compare paths with the starter source paths in the coursework profile. Missing paths are advisory because intentional restructuring is allowed."
  },
  "fop.assets.warning": {
    "id": "fop.assets",
    "status": "warning",
    "title": "Game images: missing files",
    "message": "Include the listed images or your replacements.",
    "purpose": "Identify supplied images potentially omitted from an export.",
    "method": "Compare paths with the original game images in the coursework profile. Replacements are allowed; image contents and custom references are not validated."
  },
  "fop.assets.pass": {
    "id": "fop.assets",
    "status": "pass",
    "title": "Game images: all {count} present",
    "message": "",
    "purpose": "Identify supplied images potentially omitted from an export.",
    "method": "Compare paths with the original game images in the coursework profile. Replacements are allowed; image contents and custom references are not validated."
  },
  "fop.availability.pass": {
    "id": "fop.availability",
    "status": "pass",
    "title": "Required code: all {count} items found",
    "message": "",
    "purpose": "Confirm that the classes, methods and attributes the coursework and its marking tests rely on are still present.",
    "method": "Parse the Java source without compiling or running it, then compare declarations with the coursework's availability.json: kind, names, parameter types, return and attribute types, and extends. Inherited members count; access, static, final and extra code are ignored. Items in a file with a syntax error are not reported; the syntax check names that file."
  },
  "fop.availability.warning": {
    "id": "fop.availability",
    "status": "warning",
    "title": "Required code: missing or changed",
    "message": "Compare the listed items with the starter project.",
    "list": "item",
    "purpose": "Confirm that the classes, methods and attributes the coursework and its marking tests rely on are still present.",
    "method": "Parse the Java source without compiling or running it, then compare declarations with the coursework's availability.json: kind, names, parameter types, return and attribute types, and extends. Inherited members count; access, static, final and extra code are ignored. Items in a file with a syntax error are not reported; the syntax check names that file."
  },
  "java.syntax.error": {
    "id": "java.syntax",
    "status": "error",
    "title": "Java syntax: errors found",
    "message": "Fix the errors NetBeans shows in the listed files.",
    "purpose": "Catch code that cannot compile because of a syntax mistake, such as a missing bracket or semicolon.",
    "method": "Parse every Java file in the project's source folder. List a file, with the line where reading first failed, when it contains text that is not valid Java. This finds syntax mistakes only: nothing is compiled, so other compile errors are not detected."
  },
  "java.syntax.pass": {
    "id": "java.syntax",
    "status": "pass",
    "title": "Java syntax: {count} file{plural} checked",
    "message": "",
    "purpose": "Catch code that cannot compile because of a syntax mistake, such as a missing bracket or semicolon.",
    "method": "Parse every Java file in the project's source folder. List a file, with the line where reading first failed, when it contains text that is not valid Java. This finds syntax mistakes only: nothing is compiled, so other compile errors are not detected."
  },
  "java.filename.error": {
    "id": "java.filename",
    "status": "error",
    "title": "Java file names: public class in the wrong file",
    "message": "A public class must be in a file of the same name. Rename the listed files or classes in NetBeans.",
    "purpose": "Catch code that cannot compile because a public class is not in a file named after it.",
    "method": "Parse every Java file in the project's source folder. List each public class, interface, enum or record declared at the top of a file whose name, including upper and lower case, is not the class name followed by .java. Nested and non-public classes are ignored, as are files with a syntax error."
  },
  "java.duplicate.error": {
    "id": "java.duplicate",
    "status": "error",
    "title": "Java methods: written twice",
    "message": "Delete one copy of each listed method.",
    "list": "method",
    "purpose": "Catch code that cannot compile because a class declares the same method or constructor twice.",
    "method": "Parse every Java file in the project's source folder. List a method or constructor when the same class declares another with the same name and identically written parameter types. Methods that differ in their parameter types are ignored, as are methods with their own type parameters and files with a syntax error."
  },
  "java.code.info": {
    "id": "java.code",
    "status": "info",
    "title": "Java code: not checked",
    "message": "This browser could not run the code checks.",
    "purpose": "Say plainly when the code checks did not run, without failing the other checks.",
    "method": "Shown once if the Java parser or availability.json cannot be loaded; the code checks are then skipped."
  },
  "fop.starter.error": {
    "id": "fop.starter",
    "status": "error",
    "title": "Starter code: unchanged",
    "message": "Export the project containing your own work.",
    "purpose": "Catch an untouched starter project.",
    "method": "Require the original Java file count and compare each original path against a SHA-256 fingerprint after normalising line endings and a leading BOM. Comments or extra Java files avoid this exact-match finding; it does not measure meaningful completion."
  },
  "submission.report.warning": {
    "id": "submission.report",
    "status": "warning",
    "title": "Report: included inside ZIP",
    "message": "Submit the report separately on Canvas as well.",
    "purpose": "Remind students that their report is submitted separately.",
    "method": "Look for DOC, DOCX, ODT or PDF filenames inside the ZIP; this does not inspect their contents."
  },
  "archive.integrity.pass": {
    "id": "archive.integrity",
    "status": "pass",
    "title": "ZIP integrity: {count} files verified",
    "message": "",
    "purpose": "Detect broken or incomplete ZIP exports.",
    "method": "Decompress every file, verify CRC checksums and expanded sizes, and reject malformed or overlapping entries. Coursework code is not executed."
  },
  "submission.extension.warning": {
    "id": "submission.extension",
    "status": "warning",
    "title": "ZIP filename: missing .zip extension",
    "message": "Add .zip to the filename.",
    "purpose": "Catch readable exports saved without a .zip filename extension.",
    "method": "Check the filename only after the archive has been read successfully; missing .zip is advisory."
  }
};
