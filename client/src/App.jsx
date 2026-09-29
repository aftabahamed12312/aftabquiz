import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, useAuth } from './AuthContext';
import Login from './pages/Login';
import Admin from './pages/Admin';
import Host from './pages/Host';
import HouseScreen from './pages/HouseScreen';
import Display from './pages/Display';

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
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public, read-only screen for the projector */}
      <Route path="/display" element={<Display />} />
      <Route path="/admin" element={<Guard roles={['admin']}><Admin /></Guard>} />
      <Route path="/host" element={<Guard roles={['admin', 'host']}><Host /></Guard>} />
      <Route path="/house" element={<Guard roles={['house_leader']}><HouseScreen /></Guard>} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
