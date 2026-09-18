import React from 'react';

// Minimal markdown renderer for tutor answers (headings, bullets, numbered
// lists, code blocks, bold, inline code, paragraphs). Built from React nodes —
// never innerHTML — so model text cannot inject markup.
function renderInline(text, keyPrefix) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return <strong key={key}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
      return <code key={key} className="md-code">{p.slice(1, -1)}</code>;
    }
    return <React.Fragment key={key}>{p}</React.Fragment>;
  });
}

export function Markdown({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let i = 0;

  const pushList = (ordered, items) => {
    const Tag = ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length} className="md-list">
        {items.map((it, j) => <li key={j}>{renderInline(it, `li${blocks.length}-${j}`)}</li>)}
      </Tag>
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i += 1; }
      i += 1;
      blocks.push(<pre key={blocks.length} className="md-pre"><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)/.exec(line);
    if (heading) {
      const Tag = `h${heading[1].length + 3}`;
      blocks.push(<Tag key={blocks.length} className="md-h">{renderInline(heading[2], `h${blocks.length}`)}</Tag>);
      i += 1;
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items = [];
      while (i < lines.length) {
        const m = ordered ? /^\s*\d+[.)]\s+(.*)/.exec(lines[i]) : /^\s*[-*]\s+(.*)/.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      pushList(ordered, items);
      continue;
    }
    if (line.trim()) {
      blocks.push(<p key={blocks.length} className="md-p">{renderInline(line, `p${blocks.length}`)}</p>);
    }
    i += 1;
  }
  return <>{blocks}</>;
}
