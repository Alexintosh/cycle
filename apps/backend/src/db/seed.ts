import { eq } from "drizzle-orm"
import type { AppDatabase } from "./client.ts"
import { habits } from "./schema.ts"

type StarterHabit = {
  name: string
  description: string
  category: string
  frequency: string
  goal: number | null
  color: string
  emoji: string
  aliases?: string[]
}

export const starterHabits: StarterHabit[] = [
  {
    name: "Meditation",
    description: "10 minutes of mindfulness",
    category: "MORNING",
    frequency: "weekly",
    goal: 3,
    color: "#FF5733",
    emoji: "🧘‍♀️",
    aliases: ["Morning Meditation"],
  },
  {
    name: "Yogourt",
    description: "oats with milk",
    category: "BREAKFAST",
    frequency: "weekly",
    goal: 1,
    color: "#33FF57",
    emoji: "🍨",
  },
  {
    name: "Eggs",
    description: "Start the day with protein and fruits",
    category: "BREAKFAST",
    frequency: "weekly",
    goal: 1,
    color: "#33FF57",
    emoji: "🥚",
  },
  {
    name: "Oatmeal",
    description: "oats with milk",
    category: "BREAKFAST",
    frequency: "weekly",
    goal: 1,
    color: "#33FF57",
    emoji: "🥣",
  },
  {
    name: "Clean the car!!",
    description: "",
    category: "ADULTING",
    frequency: "monthly",
    goal: 1,
    color: "#C7D2FE",
    emoji: "🧽",
    aliases: ["Clean the car"],
  },
  {
    name: "Finger Stretch",
    description: "https://www.youtube.com/watch?v=H6y0D_8kRoU&list=PL2oUcIWbb-AONWoaGiwFCPth7xbXkUH1Q&index=85",
    category: "HEALTH",
    frequency: "weekly",
    goal: 1,
    color: "#A7F3D0",
    emoji: "🖖",
  },
  {
    name: "Check Up",
    description: "",
    category: "OTHER",
    frequency: "yearly",
    goal: 1,
    color: "#FECACA",
    emoji: "🩻",
  },
  {
    name: "Face cream",
    description: "",
    category: "HEALTH",
    frequency: "daily",
    goal: 20,
    color: "#FECACA",
    emoji: "😊",
  },
  {
    name: "No smoking",
    description: "",
    category: "SELF IMPROVEMENT",
    frequency: "daily",
    goal: 30,
    color: "#FECACA",
    emoji: "🚭",
  },
  {
    name: "2 min rule",
    description: "",
    category: "ADULTING",
    frequency: "daily",
    goal: 30,
    color: "#C7D2FE",
    emoji: "2️",
  },
  {
    name: "NP",
    description: "",
    category: "SELF IMPROVEMENT",
    frequency: "daily",
    goal: 30,
    color: "#FECACA",
    emoji: "🙅",
  },
  {
    name: "Make the bed",
    description: "",
    category: "ADULTING",
    frequency: "daily",
    goal: 25,
    color: "#FECACA",
    emoji: "🛏",
  },
  {
    name: "Floss",
    description: "",
    category: "MORNING",
    frequency: "daily",
    goal: 25,
    color: "#FECACA",
    emoji: "🦷",
  },
  {
    name: "ICU",
    description: "Bollo Auto",
    category: "ADULTING",
    frequency: "yearly",
    goal: 1,
    color: "#FECACA",
    emoji: "🚗",
  },
  {
    name: "Touch grass",
    description: "",
    category: "HEALTH",
    frequency: "weekly",
    goal: 3,
    color: "#FECACA",
    emoji: "🌲",
  },
  {
    name: "Empty sink",
    description: "",
    category: "ADULTING",
    frequency: "weekly",
    goal: 4,
    color: "#FECACA",
    emoji: "🧼",
  },
  {
    name: "Fold clothes ",
    description: "",
    category: "ADULTING",
    frequency: "weekly",
    goal: 5,
    color: "#FECACA",
    emoji: "👔",
  },
  {
    name: "Laundry",
    description: "",
    category: "OTHER",
    frequency: "weekly",
    goal: 1,
    color: "#FECACA",
    emoji: "👕",
  },
  {
    name: "Qi qong",
    description: "",
    category: "HEALTH",
    frequency: "weekly",
    goal: 4,
    color: "#FECACA",
    emoji: "🥷",
  },
  {
    name: "Tai chi",
    description: "",
    category: "OTHER",
    frequency: "weekly",
    goal: 1,
    color: "#FECACA",
    emoji: "🤺",
  },
  {
    name: "Move",
    description: "",
    category: "OTHER",
    frequency: "daily",
    goal: 25,
    color: "#FECACA",
    emoji: "🕺",
  },
  {
    name: "Big walk ",
    description: "",
    category: "OTHER",
    frequency: "weekly",
    goal: 2,
    color: "#BBF7D0",
    emoji: "🐕",
  },
  {
    name: "Modifica AAA",
    description: "",
    category: "SELF IMPROVEMENT",
    frequency: "weekly",
    goal: 2,
    color: "#FEF08A",
    emoji: "📖",
  },
]

export async function seedStarterHabitsForUser(db: AppDatabase, userId: string) {
  const existingHabits = await db.select().from(habits).where(eq(habits.userId, userId))
  const existingByName = new Map(existingHabits.map((habit) => [habit.name, habit]))

  const now = new Date()
  let inserted = 0
  let updated = 0

  for (const [order, habit] of starterHabits.entries()) {
    const match = existingByName.get(habit.name) ?? habit.aliases?.map((alias) => existingByName.get(alias)).find(Boolean)

    if (match) {
      const needsUpdate =
        match.name !== habit.name ||
        match.description !== (habit.description || null) ||
        match.category !== habit.category ||
        match.frequency !== habit.frequency ||
        match.goal !== habit.goal ||
        match.color !== habit.color ||
        (match.emoji ?? "✨") !== habit.emoji ||
        match.order !== order

      if (needsUpdate) {
        await db
          .update(habits)
          .set({
            name: habit.name,
            description: habit.description || null,
            category: habit.category,
            frequency: habit.frequency,
            goal: habit.goal,
            color: habit.color,
            emoji: habit.emoji,
            order,
            updatedAt: now,
          })
          .where(eq(habits.id, match.id))
        updated += 1
      }
      continue
    }

    await db.insert(habits).values({
      id: crypto.randomUUID(),
      userId,
      name: habit.name,
      description: habit.description || null,
      category: habit.category,
      frequency: habit.frequency,
      goal: habit.goal,
      color: habit.color,
      emoji: habit.emoji,
      order,
      createdAt: now,
      updatedAt: now,
    })
    inserted += 1
  }

  return { seeded: inserted > 0 || updated > 0, inserted, updated }
}
