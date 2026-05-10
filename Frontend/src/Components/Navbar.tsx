import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Menu, UserCircle, ChevronDown } from 'lucide-react'
import { logout } from '../API/Login'
import AccountModal from './AccModal'

interface NavbarProps {
  dark: boolean
  setDark: (v: boolean) => void
  toggleSidebar: () => void
  user?: { name: string; email: string }  // pass from your auth context
}

const Navbar = ({ dark, setDark, toggleSidebar, user }: NavbarProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentUser = user ?? { name: 'User', email: '' }

  const handleSave = async (data: { name?: string; currentPassword?: string; newPassword?: string }) => {
    // Wire this to your API
    // e.g. await updateAccount(data)
    console.log('Saving:', data)
  }

  const handleSwitchAccount = () => {
    setModalOpen(false)
    window.location.href = '/login'
  }

  return (
    <>
      <div className="w-full h-14 px-6 flex items-center justify-between
        bg-white text-black border-gray-200
        dark:text-white border-b dark:bg-gray-900 dark:border-gray-700"
      >
        {/* Left */}
        <div className="flex items-center gap-3">
          <button className="sm:hidden" onClick={toggleSidebar}>
            <Menu size={22} />
          </button>
          <h1 className="text-lg font-semibold">ChatAI</h1>
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
              <UserCircle size={28} />
              <ChevronDown
                size={14}
                className={`text-gray-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Dropdown */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl shadow-lg border
                bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800
                overflow-hidden z-50"
              >
                {/* User info preview */}
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {currentUser.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {currentUser.email}
                  </p>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button
                    onClick={() => { setDropdownOpen(false); setModalOpen(true) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300
                      hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                  >
                    Account Details
                  </button>

                  <button
                    onClick={() => { setDropdownOpen(false); handleSwitchAccount() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300
                      hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                  >
                    Switch Account
                  </button>

                  <div className="border-t border-gray-100 dark:border-gray-800 my-1" />

                  <button
                    onClick={() => { setDropdownOpen(false); logout() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-500
                      hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Account Modal */}
      <AccountModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        user={currentUser}
        onLogout={logout}
        onSwitchAccount={handleSwitchAccount}
        onSave={handleSave}
      />
    </>
  )
}

export default Navbar