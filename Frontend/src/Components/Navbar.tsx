import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Menu, ChevronDown } from 'lucide-react'
import { logout } from '../API/Login'
import AccountModal from './AccModal'
import { getCurrentUser } from '../Auth/authHelper'
import InPageSearch from './InPageSearch'

interface NavbarProps {
  dark: boolean
  setDark: (v: boolean) => void
  toggleSidebar: () => void
  chatTitle?: string
}

type Tab = 'details' | 'credentials' | 'accounts'

const Navbar = ({ dark, setDark, toggleSidebar, chatTitle }: NavbarProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalInitialTab, setModalInitialTab] = useState<Tab>('details')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [currentUser] = useState(getCurrentUser() || { name: 'Guest', email: '' })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openModal = (tab: Tab = 'details') => {
    setModalInitialTab(tab)
    setDropdownOpen(false)
    setModalOpen(true)
  }

  const handleSave = async (data: { name?: string; currentPassword?: string; newPassword?: string }) => {
    console.log('Saving:', data)
  }

  return (
    <>
      <div className="w-full h-14 px-4 flex items-center justify-between bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0 select-none">
        
        {/* Left Elements */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            className="sm:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer shrink-0"
            onClick={toggleSidebar}
          >
            <Menu size={18} />
          </button>
          {chatTitle && (
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-65 hidden sm:block">
              {chatTitle}
            </p>
          )}
        </div>

        {/* Center/Right Dynamic Actions Layout */}
        <div className="flex items-center gap-2">
          
          {/* DELEGATED SELF-CONTAINED SEARCH ELEMENT */}
          <InPageSearch chatTitle={chatTitle} />

          {/* Theme control toggle */}
          <button
            onClick={() => setDark(!dark)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* Avatar menu setup */}
          <div className="relative ml-1" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-semibold select-none">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <ChevronDown
                size={13}
                className={`text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-xl shadow-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 overflow-hidden z-50">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{currentUser.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{currentUser.email}</p>
                  </div>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => openModal('details')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    Account details
                  </button>
                  <button
                    onClick={() => openModal('accounts')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    Switch account
                  </button>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 py-1">
                  <button
                    onClick={() => { setDropdownOpen(false); logout() }}
                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                  >
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AccountModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        user={currentUser}
        onLogout={logout}
        onSave={handleSave}
        initialTab={modalInitialTab}
      />
    </>
  )
}

export default Navbar