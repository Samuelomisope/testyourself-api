import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

function ProtectedRoute({ children }) {
  const { user, emailVerified } = useAuth();

  if (!user) return <Navigate to="/" />;
  if (!emailVerified) return <Navigate to="/verify-email" />;

  return children;
}

export default ProtectedRoute;
