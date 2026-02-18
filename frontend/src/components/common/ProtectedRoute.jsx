import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { token, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Block unverified users — redirect to verify-email (disabled for now)
  // if (user && !user.is_verified && location.pathname !== '/select-plan') {
  //   return <Navigate to="/verify-email" replace />;
  // }

  return children;
};

export default ProtectedRoute;
