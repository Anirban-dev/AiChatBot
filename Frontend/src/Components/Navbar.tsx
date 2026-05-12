import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Menu, ChevronDown } from 'lucide-react'
import { logout } from '../API/Login'
import AccountModal from './AccModal'
import { getCurrentUser } from '../Auth/authHelper'

interface NavbarProps {
  dark: boolean
  setDark: (v: boolean) => void
  toggleSidebar: () => void
}

type Tab = 'details' | 'credentials' | 'accounts'

const Navbar = ({ dark, setDark, toggleSidebar }: NavbarProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalInitialTab, setModalInitialTab] = useState<Tab>('details') // ✅ track which tab to open on
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [currentUser, setCurrentUser] = useState(getCurrentUser() || { name: 'Guest', email: '' })

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
    // await updateAccount(data)
  }

  return (
    <>
      <div className="w-full h-14 px-6 flex items-center justify-between
        bg-white text-black border-gray-200
        dark:text-white border-b dark:bg-gray-900 dark:border-gray-700"
      >
        {/* Left */}
        <div className="flex items-center gap-3">
          <button className="sm:hidden cursor-pointer" onClick={toggleSidebar}>
            <Menu size={22} />
          </button>
          <h1 className="text-lg font-semibold cursor-default">ChatAI</h1>
        </div>

        {/* Right */}
        <div className="flex items-center gap-4 pr-2">

          {/* Theme Toggle */}
          <button onClick={() => setDark(!dark)} className="cursor-pointer">
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Avatar Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg font-bold select-none">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <ChevronDown
                size={14}
                className={`text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl shadow-lg border
                bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800
                overflow-hidden z-50"
              >
                {/* User info */}
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 cursor-default">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {currentUser.email}
                  </p>
                </div>

                <div className="py-1">
                  {/* Opens modal on 'details' tab */}
                  <button
                    onClick={() => openModal('details')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300
                      hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer"
                  >
                    Account Details
                  </button>

                  {/* ✅ Opens modal directly on 'accounts' tab */}
                  <button
                    onClick={() => openModal('accounts')}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300
                      hover:bg-gray-200 dark:hover:bg-gray-700 transition cursor-pointer"
                  >
                    Switch Account
                  </button>

                  <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

                  <button
                    onClick={() => { setDropdownOpen(false); logout() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500
                      hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer"
                  >
                    Logout
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
        initialTab={modalInitialTab} // ✅ pass the tab down
      />
    </>
  )
}

export default Navbar