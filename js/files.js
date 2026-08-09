(function (SW) {
  'use strict';

  const util = SW.util;

  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function exportFountain(project) {
    download(util.slugify(project.title) + '.fountain',
      new Blob([project.content], { type: 'text/plain' }));
  }

  function exportTxt(project) {
    download(util.slugify(project.title) + '.txt',
      new Blob([project.content], { type: 'text/plain' }));
  }

  function exportJson(projects) {
    const payload = {
      app: 'swriter',
      version: 1,
      exportedAt: new Date().toISOString(),
      projects: projects
    };
    download('swriter-backup.json',
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  }

  function exportPdf(project, opts) {
    return SW.pdf.ensureTamilFont().then(function () {
      const parsed = SW.fountain.parseFountain(project.content);
      const bytes = SW.pdf.buildPdf(parsed, opts);
      download(util.slugify(project.title) + '.pdf',
        new Blob([bytes], { type: 'application/pdf' }));
    });
  }

  function titleFromContent(text) {
    const m = text.match(/^Title:\s*(.+)$/im);
    return m && m[1].trim() ? m[1].trim() : 'Imported script';
  }

  function importFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read file')); };
      reader.onload = function () {
        const name = file.name.toLowerCase();
        const text = String(reader.result);
        if (name.endsWith('.json')) {
          try {
            const data = JSON.parse(text);
            if (data && data.app === 'swriter' && Array.isArray(data.projects)) {
              const projects = data.projects.map(function (p) {
                return {
                  id: p.id || util.uid(),
                  title: p.title || 'Imported',
                  content: p.content == null ? '' : p.content,
                  createdAt: p.createdAt || Date.now(),
                  updatedAt: p.updatedAt || Date.now(),
                  archived: !!p.archived
                };
              });
              resolve({ kind: 'json', projects: projects });
            } else if (data && typeof data.content === 'string') {
              resolve({ kind: 'json', projects: [normalize(data)] });
            } else {
              reject(new Error('Not a valid SWriter backup file'));
            }
          } catch (e) {
            reject(new Error('Invalid JSON file'));
          }
        } else {
          resolve({ kind: 'script', content: text, title: titleFromContent(text) });
        }
      };
      reader.readAsText(file);
    });
  }

  function normalize(data) {
    return {
      id: data.id || util.uid(),
      title: data.title || 'Imported',
      content: data.content == null ? '' : data.content,
      createdAt: data.createdAt || Date.now(),
      updatedAt: data.updatedAt || Date.now(),
      archived: !!data.archived
    };
  }

  SW.files = {
    exportFountain: exportFountain,
    exportTxt: exportTxt,
    exportJson: exportJson,
    exportPdf: exportPdf,
    importFile: importFile
  };
})(window.SW = window.SW || {});
