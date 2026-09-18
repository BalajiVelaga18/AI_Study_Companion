import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Project from './pages/Project.jsx';
import Admin from './pages/Admin.jsx';
import Spaces from './pages/Spaces.jsx';
import './styles.css';

function Nav() {
  const nav = useNavigate();
  const logout = () => { localStorage.clear(); nav('/login'); };
  return <header><Link to="/">AI Study Companion</Link><nav><Link to="/">Dashboard</Link><Link to="/spaces">Spaces</Link><Link to="/admin">Admin</Link></nav><span style={{ marginLeft: 'auto' }}><button onClick={logout}>Logout</button></span></header>;
}
function Protected({ children }) {
  if (!localStorage.getItem('token')) return <Navigate to="/login" replace />;
  return children;
}
function App() {
  return <BrowserRouter><Nav /><div className="wrap"><Routes>
    <Route path="/" element={<Protected><Home /></Protected>} />
    <Route path="/dashboard" element={<Protected><Home /></Protected>} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Login mode="register" />} />
    <Route path="/spaces" element={<Protected><Spaces /></Protected>} />
    <Route path="/spaces/:spaceId" element={<Protected><Spaces detail /></Protected>} />
    <Route path="/projects/:projectId" element={<Protected><ProjectWrapper /></Protected>} />
    <Route path="/project/:id" element={<Protected><ProjectWrapper /></Protected>} />
    {['materials', 'tutor', 'quiz', 'mastery', 'growth', 'analytics'].map((t) => (
      <Route key={t} path={`/projects/:projectId/${t}`} element={<Protected><ProjectWrapper tab={t} /></Protected>} />
    ))}
    <Route path="/admin" element={<Protected><Admin /></Protected>} />
  </Routes></div></BrowserRouter>;
}
// Bridge: /projects/:projectId* uses param name projectId; Project expects :id
import { useParams } from 'react-router-dom';
function ProjectWrapper({ tab }) {
  const { projectId, id } = useParams();
  const realId = projectId || id;
  return <Project key={realId + (tab || '')} projectId={realId} initialTab={tab} />;
}
// Re-export with normalized param for the legacy /project/:id route
export function ProjectRouteShim() { return <ProjectWrapper />; }
createRoot(document.getElementById('root')).render(<App />);
