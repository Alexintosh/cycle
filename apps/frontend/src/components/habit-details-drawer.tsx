import type { HabitWithLogs } from "@/lib/types"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

export function HabitDetailsDrawer({ 
  habit, 
  open, 
  onOpenChange 
}: { 
  habit: HabitWithLogs
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const extractYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
    const match = url.match(regExp)
    return match && match[2].length === 11 ? match[2] : null
  }

  const youtubeId = habit.description ? extractYouTubeId(habit.description) : null
  const goal = habit.goal ?? 0

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <span className="text-2xl">{habit.emoji || '✨'}</span>
            <span>{habit.name}</span>
          </DrawerTitle>
        </DrawerHeader>
        <div className="space-y-4 p-4">
          <h3 className="font-medium">Progress</h3>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div 
                className="h-full rounded-full transition-all"
                style={{ 
                  width: goal > 0 ? `${Math.min((habit.achieved / goal) * 100, 100)}%` : "0%",
                  backgroundColor: habit.color
                }}
              />
            </div>
            <span className="text-sm text-gray-600">{habit.achieved}{goal > 0 ? `/${goal}` : ""}</span>
          </div>
        </div>
        <div className="space-y-4 p-4">
          {youtubeId ? (
            <div className="space-y-2">
              <h3 className="font-medium">Video</h3>
              <div className="flex justify-center">
                <div className="relative w-full max-w-[50%] pt-[28.125%]">
                  <iframe
                    className="absolute left-0 top-0 h-full w-full rounded-lg"
                    src={`https://www.youtube.com/embed/${youtubeId}`}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          ) : 
            <div className="space-y-2">
              <h3 className="font-medium">Description</h3>
              <p className="text-sm text-gray-600">{habit.description}</p>
            </div>
          }
        </div>
      </DrawerContent>
    </Drawer>
  )
}
