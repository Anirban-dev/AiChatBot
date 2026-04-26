import { Routes, Route } from 'react-router-dom'
import Chat from './Routes/Chat'
import Login from './Routes/Login'
import ProtectedRoute from './Auth/ProtectedRoute'
import NewChat from './Routes/NewChat'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ProtectedRoute><NewChat /></ProtectedRoute>} />
      <Route path="/:chatId" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      {/* <Route path="/" element={<NewChat />} />
      <Route path="/:chatId" element={<Chat />} /> */}
      <Route path="/login" element={<Login />} />
    </Routes>
  )
}

export default App