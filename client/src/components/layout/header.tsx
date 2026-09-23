import { Bell, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useLocation } from "wouter";

interface HeaderProps {
  title: string;
  breadcrumb: string;
}

export default function Header({ title, breadcrumb }: HeaderProps) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <nav className="flex mt-2" aria-label="Breadcrumb">
            <ol className="flex items-center space-x-2 text-sm text-gray-500">
              <li>
                <a href="#" className="hover:text-primary">Home</a>
              </li>
              <li>
                <span className="mx-2">/</span>
              </li>
              <li className="text-gray-900 font-medium">{breadcrumb}</li>
            </ol>
          </nav>
        </div>
        
        <div className="flex items-center space-x-4">
        
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center space-x-3 cursor-pointer select-none">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary text-white">
                    {user?.username?.[0]?.toUpperCase() || 'A'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-gray-700 font-medium hidden sm:block">
                  {user?.username || 'Admin User'}
                </span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex flex-col items-center py-3">
                <Avatar className="w-12 h-12 mb-2">
                  <AvatarFallback className="bg-primary text-white text-lg">
                    {user?.username?.[0]?.toUpperCase() || 'A'}
                  </AvatarFallback>
                </Avatar>
                <span className="font-semibold text-gray-900">{user?.username || 'Admin User'}</span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/profile/user-profile')}>
                Edit Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => logout('manual')} className="text-red-600 focus:text-red-700">
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
