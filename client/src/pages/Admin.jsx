import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import AdminLayout from '../components/admin/AdminLayout.jsx';
import OverviewTab from '../components/admin/OverviewTab.jsx';
import UsersTab from '../components/admin/UsersTab.jsx';
import JourneyTab from '../components/admin/JourneyTab.jsx';
import ActivityTab from '../components/admin/ActivityTab.jsx';
import AiTab from '../components/admin/AiTab.jsx';
import JobsTab from '../components/admin/JobsTab.jsx';
import HealthTab from '../components/admin/HealthTab.jsx';
import Loading from '../components/admin/Loading.jsx';
import ErrorState from '../components/admin/ErrorState.jsx';

export default function Admin() {
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState([]);
  const [uid, setUid] = useState('');
  const [journey, setJourney] = useState(null);
  const [filters, setFilters] = useState({ type: '', userId: '', projectId: '', from: '', to: '' });
  const [activity, setActivity] = useState([]);
  const [jobs, setJobs] = useState([]);

  const loadOverview = useCallback(async () => {
    setErr('');
    try {
      const d = await api('/api/analytics/admin/overview');
      setData(d);
      setJobs(d.jobs?.recent || []);
    } catch (e) {
      setErr(e.message || 'Unable to load admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await api('/api/analytics/admin/users'));
    } catch (e) {
      setErr(e.message || 'Unable to load users.');
    }
  }, []);

  const loadJourney = useCallback(async (id) => {
    if (!id) return;
    try {
      const j = await api(`/api/analytics/admin/users/${encodeURIComponent(id)}`);
      setJourney(j);
    } catch (e) {
      setErr(e.message || 'Unable to load journey.');
      setJourney(null);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const q = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString();
      setActivity(await api(`/api/analytics/admin/activity?${q}`));
    } catch (e) {
      setErr(e.message || 'Unable to load activity.');
    }
  }, [filters]);

  const loadJobs = useCallback(async () => {
    try {
      setJobs(await api('/api/analytics/admin/jobs'));
    } catch (e) {
      setErr(e.message || 'Unable to load jobs.');
    }
  }, []);

  const handleTabChange = useCallback((t) => {
    setTab(t);
    setErr('');
    if (t === 'users' && users.length === 0) loadUsers();
    if (t === 'activity' && activity.length === 0) loadActivity();
    if (t === 'jobs') loadJobs();
  }, [users.length, activity.length, loadUsers, loadActivity, loadJobs]);

  const handleInspectUser = useCallback((id) => {
    setUid(id);
    setTab('journey');
    loadJourney(id);
  }, [loadJourney]);

  if (loading) return <div className="wrap"><Loading cards={4} /></div>;
  if (err && !data) {
    return (
      <div className="wrap">
        <ErrorState
          title="Admin load failed"
          message={err}
          onRetry={loadOverview}
        />
        <p className="admin-note">Login as admin@demo.local / admin123 and run <code>npm --workspace server run seed</code> if DB was reset.</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="wrap">
      <AdminLayout tab={tab} setTab={handleTabChange}>
        {tab === 'overview' && <OverviewTab data={data} />}
        {tab === 'users' && <UsersTab users={users} onInspect={handleInspectUser} />}
        {tab === 'journey' && <JourneyTab uid={uid} setUid={setUid} journey={journey} loadJourney={loadJourney} />}
        {tab === 'activity' && <ActivityTab filters={filters} setFilters={setFilters} activity={activity} loadActivity={loadActivity} />}
        {tab === 'ai' && <AiTab data={data} />}
        {tab === 'jobs' && <JobsTab jobs={jobs} loadJobs={loadJobs} />}
        {tab === 'health' && <HealthTab data={data} />}
      </AdminLayout>
    </div>
  );
}
