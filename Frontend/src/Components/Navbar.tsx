import { Sun, Moon, Menu } from 'lucide-react'

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
      <div className="flex items-center gap-4">

        {/* Theme Toggle */}
        <button onClick={() => setDark(!dark)} className='cursor-pointer'>
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Auth Section */}
        <img
          src="https://i.pravatar.cc/40"
          alt="user"
          className="w-10 h-10 rounded-full cursor-pointer"
        />
      </div>
    </div>
  )
}

export default Navbar