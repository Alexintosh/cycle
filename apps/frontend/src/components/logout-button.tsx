import { LogOut } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/features/auth/auth-context"
import { Button } from "./ui/button"

export function LogoutButton() {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate("/login", { replace: true })
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full border bg-white/80 shadow-sm hover:bg-white">
      <LogOut className="h-5 w-5" />
      <span className="sr-only">Logout</span>
    </Button>
  )
}
