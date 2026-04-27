import { Sun, Moon, Menu, LogOut, UserCircle } from 'lucide-react'
import { logout } from '../API/Login'

const Navbar = ({ dark, setDark, toggleSidebar }: any) => {

  return (

    <div className="w-full h-14 px-6 flex items-center justify-between
      bg-white  text-black border-gray-200
      dark:text-white border-b dark:bg-gray-900 dark:border-gray-700"
    >

        {/* Mobile */}
        <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <button
            className="sm:hidden"
            onClick={toggleSidebar}
            >
            <Menu size={22} />
            </button>

            <h1 className="text-lg font-semibold">ChatAI</h1>
        </div>

      {/* Right Section */}
      <div className="flex items-center gap-6 pr-4">

        {/* Theme Toggle */}
        <button onClick={() => setDark(!dark)} className='cursor-pointer'>
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
            bg-red-500 hover:bg-red-600 text-white transition cursor-pointer"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Logout</span>
        </button>

        {/* Avatar */}
        <UserCircle size={28} className="cursor-pointer" />
      </div>
    </div>
  )
}

export default Navbar