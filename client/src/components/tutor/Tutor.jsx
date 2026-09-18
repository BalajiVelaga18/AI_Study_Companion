import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Markdown } from './markdown.jsx';

const QUICK = ['Explain this simply', 'Give me an example', 'Quiz me on this', 'What am I weak at?', 'Help me revise'];
const EXAMPLE_PROMPTS = ['Explain this simply', 'Give me an example', 'Quiz me'];
const FRIENDLY_ERROR = "I couldn't generate a response right now. Please try again.";

function dedupeCites(cites) {
  const seen = new Set();
  return (cites || []).filter((c) => {
    const key = `${c.filename}::${c.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dayBucket(iso) {
  const d = new Date(iso);
  const now = new Date();
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (day === today) return 'TODAY';
  if (day === today - 86400000) return 'YESTERDAY';
  return 'OLDER';
}

export default function Tutor({ projectId, mats = [], growth = [], onViewMaterial }) {
  const [convs, setConvs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [project, setProject] = useState(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const inputRef = useRef(null);

  const loadConvs = useCallback(async () => {
    const list = await api(`/api/learn/${projectId}/conversations`).catch(() => []);
    setConvs(Array.isArray(list) ? list : []);
    return Array.isArray(list) ? list : [];
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, proj] = await Promise.all([
        loadConvs(),
        api(`/api/projects/${projectId}`).catch(() => null),
      ]);
      if (cancelled) return;
      if (proj) setProject(proj);
      if (list.length && !activeId) {
        setActiveId(list[0].id);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadMessages = useCallback(async (cid, before) => {
    if (!cid) { setMessages([]); setHasMore(false); return; }
    if (before) setLoadingOlder(true);
    try {
      const q = before ? `?limit=50&before=${encodeURIComponent(before)}` : '?limit=50';
      const r = await api(`/api/learn/${projectId}/conversations/${cid}/messages${q}`);
      stickRef.current = !before;
      setMessages((prev) => (before ? [...r.messages, ...prev] : r.messages));
      setHasMore(Boolean(r.hasMore));
    } catch {
      if (!before) setMessages([{ role: 'assistant', error: true, text: FRIENDLY_ERROR, retry: null }]);
    } finally {
      setLoadingOlder(false);
    }
  }, [projectId]);

  useEffect(() => { loadMessages(activeId); }, [activeId, loadMessages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  const touchConv = useCallback((cid) => {
    setConvs((cs) => {
      const found = cs.find((c) => String(c.id) === String(cid));
      const rest = cs.filter((c) => String(c.id) !== String(cid));
      if (!found) return cs;
      const nextCount = Math.max(2, (found.messageCount || 0) + 2);
      return [{ ...found, messageCount: nextCount, updatedAt: new Date().toISOString() }, ...rest];
    });
  }, []);

  const send = async (raw) => {
    const question = String(raw ?? input).trim();
    if (!question || sending) return;
    setInput('');
    stickRef.current = true;
    let cid = activeId;
    try {
      if (!cid) {
        const c = await api(`/api/learn/${projectId}/conversations`, {
          method: 'POST', body: JSON.stringify({ title: question.slice(0, 60) }),
        });
        cid = c.id;
        setConvs((cs) => [c, ...cs]);
        setActiveId(cid);
        setMessages([]);
      }
      setSending(true);
      setMessages((m) => [...m, { role: 'user', text: question, _tmp: `u${Date.now()}` }, { role: 'assistant', thinking: true, _tmp: `t${Date.now()}` }]);
      const r = await api(`/api/learn/${projectId}/tutor`, {
        method: 'POST', body: JSON.stringify({ question, conversationId: cid }),
      });
      setMessages((m) => [...m.filter((x) => !x.thinking), {
        role: 'assistant', text: r.answer, citations: r.citations,
        grounded: r.grounded, basis: r.basis, _tmp: `a${Date.now()}`,
      }]);
      touchConv(r.conversationId || cid);
    } catch {
      setMessages((m) => [...m.filter((x) => !x.thinking), { role: 'assistant', error: true, text: FRIENDLY_ERROR, retry: question, _tmp: `e${Date.now()}` }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const newConversation = async () => {
    const c = await api(`/api/learn/${projectId}/conversations`, { method: 'POST', body: JSON.stringify({}) }).catch(() => null);
    if (!c) return;
    setConvs((cs) => [c, ...cs]);
    setActiveId(c.id);
    setMessages([]);
    setLeftOpen(false);
  };

  const deleteConversation = async (cid, e) => {
    e.stopPropagation();
    await api(`/api/learn/${projectId}/conversations/${cid}`, { method: 'DELETE' }).catch(() => null);
    setConvs((cs) => {
      const rest = cs.filter((c) => String(c.id) !== String(cid));
      if (String(activeId) === String(cid)) {
        setActiveId(rest.length ? rest[0].id : null);
        setMessages([]);
      }
      return rest;
    });
  };

  const selectConversation = (cid) => {
    setActiveId(cid);
    setLeftOpen(false);
  };

  const visibleConvs = convs.filter((c) => (c.messageCount || 0) > 0);
  const groups = { TODAY: [], YESTERDAY: [], OLDER: [] };
  for (const c of visibleConvs) groups[dayBucket(c.updatedAt)].push(c);
  const active = convs.find((c) => String(c.id) === String(activeId));

  const concepts = Array.isArray(growth) ? growth : [];
  const sorted = [...concepts].sort((a, b) => a.mastery - b.mastery);
  const focus = sorted[0] || null;
  const weak = sorted.filter((c) => c.mastery < 0.5).slice(0, 4);
  const topMastery = [...concepts].sort((a, b) => b.mastery - a.mastery).slice(0, 5);
  const readyMats = mats.filter((m) => m.status === 'ready').length;

  return (
    <div className={`tutor-layout${leftCollapsed ? ' left-collapsed' : ''}${rightCollapsed ? ' right-collapsed' : ''}`}>
      {leftOpen && <div className="drawer-scrim" onClick={() => setLeftOpen(false)} />}
      <aside className={`tutor-side left${leftOpen ? ' open' : ''}`}>
        <div className="side-head">
          <span className="side-title">Conversations</span>
          <div className="side-actions">
            <button className="side-collapse" title="Collapse" onClick={() => setLeftCollapsed(true)}>‹</button>
            <button className="drawer-close" title="Close" onClick={() => setLeftOpen(false)}>×</button>
          </div>
        </div>
        <button className="new-conv" onClick={newConversation}>+ New Conversation</button>
        <div className="conv-list">
          {visibleConvs.length === 0 && <p className="conv-empty"><small>No conversations yet.</small></p>}
          {['TODAY', 'YESTERDAY', 'OLDER'].map((g) => groups[g].length ? (
            <div key={g}>
              <div className="conv-group">{g}</div>
              {groups[g].map((c) => (
                <div key={c.id} className={`conv-item${String(activeId) === String(c.id) ? ' active' : ''}`} onClick={() => selectConversation(c.id)}>
                  <span className="conv-title">{c.title}</span>
                  <button className="conv-del" title="Delete conversation" onClick={(e) => deleteConversation(c.id, e)}>×</button>
                </div>
              ))}
            </div>
          ) : null)}
        </div>
      </aside>

      <section className="tutor-center">
        <div className="tutor-topbar">
          <div className="tutor-topbar-actions left-actions">
            {leftCollapsed && (
              <button className="expand-btn" title="Show conversations" onClick={() => setLeftCollapsed(false)}>›</button>
            )}
            <button className="drawer-btn" onClick={() => setLeftOpen(true)}>☰</button>
          </div>
          <div className="tutor-title-block">
            <span className="tutor-title">AI Tutor</span>
            <span className="tutor-subtitle">Grounded in your project materials</span>
          </div>
          <div className="tutor-topbar-actions">
            {rightCollapsed && (
              <button className="expand-btn" title="Show learning context" onClick={() => setRightCollapsed(false)}>‹</button>
            )}
            <button className="drawer-btn right" title="Learning context" onClick={() => setRightOpen(true)}>ⓘ</button>
            <button className="side-collapse" title="Hide learning context" onClick={() => setRightCollapsed(true)}>›</button>
          </div>
        </div>
        <div className="tutor-messages" ref={scrollRef}>
          {hasMore && (
            <div className="load-older">
              <button className="ghost-btn" disabled={loadingOlder} onClick={() => messages.length && loadMessages(activeId, messages[0].createdAt)}>
                {loadingOlder ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}
          {messages.length === 0 && !sending && (
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true">🎓</div>
              <h4>AI Tutor</h4>
              <p>Ask questions about your learning material, request examples, simplify concepts, or test your understanding.</p>
              <div className="empty-prompts">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button key={p} className="chip" onClick={() => send(p)}>{p}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={m._id || m._tmp || i} className={`bubble-row ${m.role}`}>
              <div className={`bubble ${m.role}${m.error ? ' error' : ''}`}>
                {m.thinking && <span className="thinking"><i /><i /><i /></span>}
                {!m.thinking && m.role === 'user' && m.text}
                {!m.thinking && m.role === 'assistant' && !m.error && <Markdown text={m.text} />}
                {!m.thinking && m.role === 'assistant' && !m.error && m.grounded === false && !m.basis && (
                  <div className="cite-note">⚠ Not enough evidence in your project materials for this one.</div>
                )}
                {!m.thinking && !m.error && dedupeCites(m.citations).length > 0 && (
                  <div className="sources">
                    <div className="sources-title">Sources</div>
                    <div className="source-chips">
                      {dedupeCites(m.citations).map((c, j) => (
                        <button
                          key={j}
                          className="source-chip"
                          disabled={!c.materialId || !onViewMaterial}
                          title={c.materialId ? 'Open material' : c.filename}
                          onClick={() => c.materialId && onViewMaterial && onViewMaterial(c.materialId)}
                        >
                          📄 {c.filename} · Page {c.page}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {m.error && (
                  <div>
                    <div>{m.text}</div>
                    {m.retry && <p><button onClick={() => send(m.retry)}>Retry</button></p>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="composer">
          <div className="quick-chips">
            {QUICK.map((s) => <button key={s} className="chip" disabled={sending} onClick={() => send(s)}>{s}</button>)}
          </div>
          <div className="composer-row">
            <input
              ref={inputRef}
              type="text"
              value={input}
              placeholder="Ask about your material..."
              disabled={sending}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="send-btn" onClick={() => send()} disabled={sending || !input.trim()} aria-label="Send">
              {sending ? '…' : '➤'}
            </button>
          </div>
        </div>
      </section>

      {rightOpen && <div className="drawer-scrim" onClick={() => setRightOpen(false)} />}
      <aside className={`tutor-side right${rightOpen ? ' open' : ''}`}>
        <div className="side-head">
          <span className="side-title">Learning Context</span>
          <div className="side-actions">
            <button className="side-collapse" title="Collapse" onClick={() => { setRightCollapsed(true); setRightOpen(false); }}>›</button>
            <button className="drawer-close" title="Close" onClick={() => setRightOpen(false)}>×</button>
          </div>
        </div>
        {project && (
          <div className="ctx-block">
            <div className="ctx-label">Project</div>
            <div className="ctx-value">{project.name}</div>
          </div>
        )}
        {project && (project.learningGoal || project.goal) && (
          <div className="ctx-block">
            <div className="ctx-label">Goal</div>
            <div className="ctx-value">{project.learningGoal || project.goal}</div>
          </div>
        )}
        <div className="ctx-block">
          <div className="ctx-label">Materials</div>
          <div className="ctx-value">{readyMats} of {mats.length} ready</div>
        </div>
        {focus && (
          <div className="ctx-block">
            <div className="ctx-label">Current focus</div>
            <div className="ctx-value">{focus.name} <small>· {Math.round(focus.mastery * 100)}%</small></div>
          </div>
        )}
        {topMastery.length > 0 && (
          <div className="ctx-block">
            <div className="ctx-label">Mastery</div>
            {topMastery.map((c) => (
              <div key={c.name} className="ctx-mastery">
                <div className="ctx-mastery-head">
                  <span>{c.name}</span>
                  <small>{Math.round(c.mastery * 100)}%</small>
                </div>
                <div className="bar"><i style={{ width: `${Math.round(c.mastery * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        )}
        {weak.length > 0 && (
          <div className="ctx-block">
            <div className="ctx-label">Areas to review</div>
            {weak.map((c) => <div key={c.name} className="ctx-weak">⚠ {c.name}</div>)}
          </div>
        )}
      </aside>
    </div>
  );
}
