import { Navigate } from 'react-router-dom'
import { getCookie } from "./authHelper"

const ProtectedRoute = ({ children }: any) => {
  const token = getCookie('token')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute