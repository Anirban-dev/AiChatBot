import { Routes, Route, Navigate } from 'react-router-dom'
import Chat from './Routes/Chat'
import Login from './Routes/Login'
import ProtectedRoute from './Auth/ProtectedRoute'
import AdminDashboard from './Routes/Admin/index'
import User from './Routes/User'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/:chatId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      {/* <Route path="/" element={<NewChat />} />
      <Route path="/:chatId" element={<Chat />} /> */}
      <Route path="/login" element={<Login />} />
      <Route path="/user" element={<ProtectedRoute><User /></ProtectedRoute>} />
      <Route path="/usage" element={<Navigate to="/user" replace />} />
    </Routes>
  )
}

export default App