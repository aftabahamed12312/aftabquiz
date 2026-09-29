import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, useAuth } from './AuthContext';
import Login from './pages/Login';

const Admin = lazy(() => import('./pages/Admin'));
const Host = lazy(() => import('./pages/Host'));
const HouseScreen = lazy(() => import('./pages/HouseScreen'));
const Display = lazy(() => import('./pages/Display'));

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Loading…</div>;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="splash">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Public, read-only screen for the projector */}
        <Route path="/display" element={<Display />} />
        <Route path="/admin" element={<Guard roles={['admin']}><Admin /></Guard>} />
        <Route path="/host" element={<Guard roles={['admin', 'host']}><Host /></Guard>} />
        <Route path="/house" element={<Guard roles={['house_leader']}><HouseScreen /></Guard>} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  );
}
