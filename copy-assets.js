/**
 * Copies debug GUI files (HTML, JS) to the dist/gui folder
 * so they are included in the final published package.
 */
const fs = require('fs');
const path = require('path');

// Source files in src/gui that we need to copy
const filesToCopy = ['debugGui.html', 'debugGui.js'];

// Ensure dist/gui directory exists
const distGuiPath = path.join(__dirname, 'dist', 'gui');
if (!fs.existsSync(distGuiPath)) {
  fs.mkdirSync(distGuiPath, { recursive: true });
}

filesToCopy.forEach((file) => {
  const srcPath = path.join(__dirname, 'src', 'gui', file);
  const destPath = path.join(distGuiPath, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to dist/gui`);
  } else {
    console.error(`Source file not found: ${srcPath}`);
  }
});