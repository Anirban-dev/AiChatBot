
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import { ChatProvider } from './Context/ChatContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
      <ChatProvider>
        <App />
      </ChatProvider>
  </BrowserRouter>
)

