import type React from "react"

import { useState } from "react"
import { useAuth } from "@/features/auth/auth-context"
import { Habit, Frequency, HabitCategories } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface HabitFormProps {
  habit?: Habit
  onCancel: () => void
  onSuccess?: () => Promise<void> | void
}

const COLORS = [
  "#FECACA", // red-200
  "#FED7AA", // orange-200
  "#FEF08A", // yellow-200
  "#D9F99D", // lime-200
  "#BBF7D0", // green-200
  "#A7F3D0", // emerald-200
  "#BAE6FD", // light-blue-200
  "#C7D2FE", // indigo-200
  "#DDD6FE", // purple-200
  "#FBCFE8", // pink-200
]

// Common emojis for rituals and upkeep
const COMMON_EMOJIS = [
  "✨", "💪", "🏃‍♂️", "🧘‍♀️", "📚", "💧", "🥗", "😴", 
  "🎯", "🎨", "🎸", "💻", "🧹", "🌱", "⭐", "❤️"
]

export function HabitForm({ habit, onCancel, onSuccess }: HabitFormProps) {
  const { api } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: habit?.name || "",
    description: habit?.description || "",
    frequency: habit?.frequency || ("daily" as Frequency),
    goal: habit?.goal?.toString() || "",
    color: habit?.color || COLORS[0],
    emoji: habit?.emoji || "✨",
    category: habit?.category || "OTHER",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleFrequencyChange = (value: string) => {
    setFormData((prev) => ({ ...prev, frequency: value as Frequency }))
  }

  const handleColorChange = (color: string) => {
    setFormData((prev) => ({ ...prev, color }))
  }

  const handleEmojiChange = (emoji: string) => {
    setFormData((prev) => ({ ...prev, emoji }))
  }

  const handleCategoryChange = (value: string) => {
    setFormData((prev) => ({ ...prev, category: value.toUpperCase()}))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const parsedGoal = formData.goal.trim() === "" ? null : Number(formData.goal)
      if (parsedGoal !== null && (!Number.isFinite(parsedGoal) || parsedGoal < 1)) {
        throw new Error("Goal must be a positive number or left empty")
      }

      const payload = {
        ...formData,
        goal: parsedGoal,
      }

      if (habit) {
        await api.updateHabit(habit.id, payload)
      } else {
        await api.createHabit(payload)
      }
      if (onSuccess) {
        await onSuccess()
      }
      onCancel()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save ritual"
      setError(message)
      console.error("Error saving habit:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>{habit ? "Edit Ritual" : "Add Ritual or Upkeep"}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="e.g., Morning stretch or Clean the car"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Instructions or Notes (Optional)</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="How to do it, what to remember, or why it matters..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={handleCategoryChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {HabitCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category.charAt(0) + category.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Timeframe</Label>
            <RadioGroup value={formData.frequency} onValueChange={handleFrequencyChange} className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="daily" id="daily" />
                <Label htmlFor="daily">Daily</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="weekly" id="weekly" />
                <Label htmlFor="weekly">Weekly</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="monthly" id="monthly" />
                <Label htmlFor="monthly">Monthly</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="yearly" id="yearly" />
                <Label htmlFor="yearly">Yearly</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="quarterly" id="quarterly" />
                <Label htmlFor="quarterly">Quarterly</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="semiannual" id="semiannual" />
                <Label htmlFor="semiannual">Semiannual</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">Goal (Optional)</Label>
            <Input
              id="goal"
              name="goal"
              type="number"
              min="1"
              value={formData.goal}
              onChange={handleChange}
              placeholder="Leave empty for open-ended check-ins"
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-8 h-8 rounded-full ${
                    formData.color === color ? "ring-2 ring-offset-2 ring-gray-400" : ""
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorChange(color)}
                  aria-label={`Select color ${color}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Emoji</Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`w-10 h-10 text-xl flex items-center justify-center rounded-lg hover:bg-gray-100 ${
                    formData.emoji === emoji ? "ring-2 ring-offset-2 ring-gray-400" : ""
                  }`}
                  onClick={() => handleEmojiChange(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <Input
              id="emoji"
              name="emoji"
              value={formData.emoji}
              onChange={handleChange}
              className="mt-2"
              placeholder="Or type your own emoji..."
              maxLength={2}
            />
          </div>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : habit ? "Update Ritual" : "Add Ritual"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
