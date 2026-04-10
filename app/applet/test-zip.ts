import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

const output = fs.createWriteStream(path.join(process.cwd(), 'test.zip'));
const archive = archiver('zip', {
  zlib: { level: 9 }
});

output.on('close', function() {
  console.log(archive.pointer() + ' total bytes');
  console.log('archiver has been finalized and the output file descriptor has closed.');
});

archive.on('error', function(err) {
  console.error('ERROR:', err);
});

archive.pipe(output);

archive.glob('**/*', {
  cwd: process.cwd(),
  dot: true,
  ignore: [
    'node_modules/**', 
    'dist/**', 
    '.git/**', 
    '.env', 
    'uploads/**', 
    '*.sqlite', 
    '*.sqlite-journal', 
    '*.db', 
    'firebase-applet-config.json'
  ]
});

archive.finalize();
