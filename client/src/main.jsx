import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Project from './pages/Project.jsx';
import Admin from './pages/Admin.jsx';
import Spaces from './pages/Spaces.jsx';
import './styles.css';

function AppNav() {
  const location = useLocation();
  const hideOn = ['/login', '/register'];
  if (hideOn.includes(location.pathname)) return null;

  const nav = useNavigate();
  const logout = () => {
    localStorage.clear();
    nav('/login');
  };

  return (
    <header>
      <Link to="/">AI Study Companion</Link>
      <nav>
        <Link to="/">Dashboard</Link>
        <Link to="/spaces">Spaces</Link>
        <Link to="/admin">Admin</Link>
      </nav>
      <span style={{ marginLeft: 'auto' }}>
        <button onClick={logout}>Logout</button>
      </span>
    </header>
  );
}

function Protected({ children }) {
  if (!localStorage.getItem('token')) return <Navigate to="/login" replace />;
  return children;
}

function ProjectWrapper({ tab }) {
  const { projectId, id } = useParams();
  const realId = projectId || id;
  return <Project key={realId + (tab || '')} projectId={realId} initialTab={tab} />;
}

function App() {
  return (
    <BrowserRouter>
      <AppNav />
      <div className="wrap">
        <Routes>
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
        </Routes>
      </div>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')).render(<App />);
