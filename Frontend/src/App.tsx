import { Routes, Route } from 'react-router-dom'
import Chat from './Routes/Chat'
import Login from './Routes/Login'
import ProtectedRoute from './Auth/ProtectedRoute'
import AdminDashboard from './Routes/Admin/index'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/:chatId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      {/* <Route path="/" element={<NewChat />} />
      <Route path="/:chatId" element={<Chat />} /> */}
      <Route path="/login" element={<Login />} />
    </Routes>
  )
}

export default App