const fs = require('fs');
const path = require('path');

// Create dist/templates directory if it doesn't exist
const templatesDir = path.join(__dirname, '..', 'dist', 'templates');
if (!fs.existsSync(templatesDir)) {
  fs.mkdirSync(templatesDir, { recursive: true });
}

// Copy template files
const sourceDir = path.join(__dirname, '..', 'src', 'templates');
const files = fs.readdirSync(sourceDir);

files.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);
  const destPath = path.join(templatesDir, file);
  fs.copyFileSync(sourcePath, destPath);
  console.log(`Copied ${file} to dist/templates/`);
});
