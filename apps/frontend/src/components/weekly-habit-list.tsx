import { addDays, format, isToday } from "date-fns";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { HabitWithLogs } from "@/lib/types";
import { SortableHabitRow } from "./habit-list";
import { MobileHabitCard } from "./mobile-habit-card";
import { HabitCategories } from "@/lib/types";
import { ChevronRight, Search, ChevronsUpDown, Filter } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WeeklyHabitListProps {
  habits: HabitWithLogs[];
  onToggleLog: (habitId: string, date: Date) => void;
  onEditHabit: (habit: HabitWithLogs) => void;
  onDeleteHabit: (habitId: string) => void;
  onReorder: (habits: HabitWithLogs[]) => void;
  weekStart: Date;
}

export function WeeklyHabitList({ 
  habits, 
  onToggleLog, 
  onEditHabit, 
  onDeleteHabit,
  onReorder,
  weekStart,
}: WeeklyHabitListProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  // State for expanded categories
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(HabitCategories)
  );

  // State for search and category filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(HabitCategories)
  );

  // State for active drag
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Toggle all categories
  const toggleAllCategories = () => {
    if (expandedCategories.size === HabitCategories.length) {
      setExpandedCategories(new Set());
    } else {
      setExpandedCategories(new Set(HabitCategories));
    }
  };

  // Filter habits based on search query and selected categories
  const filteredHabits = useMemo(() => {
    const query = searchQuery.toLowerCase();
    
    // If searching, temporarily include categories that match the search
    const effectiveCategories = new Set(selectedCategories);
    if (query) {
      HabitCategories.forEach(category => {
        if (category.toLowerCase().includes(query)) {
          effectiveCategories.add(category);
        }
      });
    }

    return habits.filter(habit => {
      const matchesSearch = !query || 
        habit.name.toLowerCase().includes(query) || 
        habit.description.toLowerCase().includes(query) ||
        habit.category.toLowerCase().includes(query);
      
      const matchesCategory = effectiveCategories.has(habit.category);
      
      return matchesSearch && matchesCategory;
    });
  }, [habits, searchQuery, selectedCategories]);

  // Get days in week
  const daysInWeek = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )

  useLayoutEffect(() => {
    if (!window.matchMedia("(min-width: 768px)").matches) {
      return
    }

    const todayIndex = daysInWeek.findIndex((day) => isToday(day))
    if (todayIndex < 0) {
      return
    }

    const container = scrollContainerRef.current
    const target = container?.querySelector<HTMLElement>(`[data-week-day-index="${todayIndex}"]`)
    if (!container || !target) {
      return
    }

    const scrollToToday = () => {
      target.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "center",
      })
    }

    const firstFrame = window.requestAnimationFrame(() => {
      scrollToToday()
      window.requestAnimationFrame(scrollToToday)
    })

    return () => window.cancelAnimationFrame(firstFrame)
  }, [daysInWeek])

  // Group habits by category
  const habitsByCategory = filteredHabits.reduce((acc, habit) => {
    const category = habit.category || "OTHER";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(habit);
    return acc;
  }, {} as Record<string, HabitWithLogs[]>);

  // Sort categories based on HabitCategories order and search relevance
  const sortedCategories = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return Object.keys(habitsByCategory).sort((a, b) => {
      // If searching, prioritize matching categories
      if (query) {
        const aMatches = a.toLowerCase().includes(query);
        const bMatches = b.toLowerCase().includes(query);
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
      }
      
      // Fall back to default category order
      const indexA = HabitCategories.indexOf(a as typeof HabitCategories[number]);
      const indexB = HabitCategories.indexOf(b as typeof HabitCategories[number]);
      return indexA - indexB;
    });
  }, [habitsByCategory, searchQuery]);

  // DnD sensors setup
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    
    // Find the category of the dragged habit
    for (const [category, categoryHabits] of Object.entries(habitsByCategory)) {
      if (categoryHabits.some(h => h.id === active.id)) {
        setActiveCategory(category);
        break;
      }
    }
  };

  // Handle DnD end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!active || !over || active.id === over.id) {
      setActiveId(null);
      setActiveCategory(null);
      return;
    }

    // Find target habit and its category
    let targetHabit: HabitWithLogs | null = null;
    let targetHabitCategory = "";

    // Find the target habit and its category
    for (const [category, categoryHabits] of Object.entries(habitsByCategory)) {
      const found = categoryHabits.find(h => h.id === over.id);
      if (found) {
        targetHabit = found;
        targetHabitCategory = category;
        break;
      }
    }

    if (!targetHabit) return;

    // Create new habits array with updated order and category
    const newHabits = [...habits];
    const oldIndex = habits.findIndex((h) => h.id === active.id);
    const newIndex = habits.findIndex((h) => h.id === over.id);
    
    // Update the category if it changed
    if (activeCategory !== targetHabitCategory) {
      newHabits[oldIndex] = {
        ...newHabits[oldIndex],
        category: targetHabitCategory
      };
    }

    // Reorder the array
    const [removed] = newHabits.splice(oldIndex, 1);
    newHabits.splice(newIndex, 0, removed);
    
    // Update orders and categories
    const updatedHabits = newHabits.map((habit, index) => ({
      ...habit,
      order: index
    }));
    
    onReorder(updatedHabits);
    setActiveId(null);
    setActiveCategory(null);
  };

  // Toggle category filter
  const toggleCategoryFilter = (category: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        if (next.size > 1) { // Prevent deselecting all categories
          next.delete(category);
        }
      } else {
        next.add(category);
      }
      return next;
    });
  };

  // Toggle all category filters
  const toggleAllCategoryFilters = () => {
    if (selectedCategories.size === HabitCategories.length) {
      setSelectedCategories(new Set([HabitCategories[0]])); // Keep at least one
    } else {
      setSelectedCategories(new Set(HabitCategories));
    }
  };

  return (
    <div className="rounded-md border relative isolate">
      <div className="sticky top-0 z-50 border-b bg-background p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search rituals and upkeep..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="icon"
                className={cn(
                  selectedCategories.size !== HabitCategories.length && "text-primary"
                )}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter Categories</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={selectedCategories.size === HabitCategories.length}
                onCheckedChange={toggleAllCategoryFilters}
              >
                All Categories
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {HabitCategories.map((category) => (
                <DropdownMenuCheckboxItem
                  key={category}
                  checked={selectedCategories.has(category)}
                  onCheckedChange={() => toggleCategoryFilter(category)}
                >
                  {category}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleAllCategories}
            title={expandedCategories.size === HabitCategories.length ? "Collapse all" : "Expand all"}
          >
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-4 p-3 md:hidden">
          {sortedCategories.map((category) => (
            <section
              key={category}
              className={cn(
                "overflow-hidden rounded-2xl border bg-white shadow-sm",
                activeCategory && activeCategory !== category && "opacity-50",
              )}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 bg-muted/50 px-4 py-3 text-left transition-colors hover:bg-muted/70"
                onClick={() => toggleCategory(category)}
              >
                <div className="flex items-center gap-2 font-medium">
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      expandedCategories.has(category) && "rotate-90",
                    )}
                  />
                  <span>{category}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {habitsByCategory[category]?.length ?? 0}
                </span>
              </button>
              {expandedCategories.has(category) && (
                <SortableContext
                  items={habitsByCategory[category].map((habit) => habit.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3 p-3">
                    {habitsByCategory[category].map((habit) => (
                      <MobileHabitCard
                        key={habit.id}
                        habit={habit}
                        days={daysInWeek}
                        onToggleLog={onToggleLog}
                        onEditHabit={onEditHabit}
                        onDeleteHabit={onDeleteHabit}
                        isToday={isToday}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </section>
          ))}
        </div>

        <div ref={scrollContainerRef} className="relative hidden overflow-x-auto scroll-px-20 md:block">
          <table className="w-full min-w-[920px]">
            <thead className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
              <tr className="border-b [&>th]:bg-background/95 [&>th]:backdrop-blur supports-[backdrop-filter]:[&>th]:bg-background/75">
                <th className="p-2 text-left">Habit</th>
                {daysInWeek.map((day, index) => (
                <th
                  key={day.toISOString()}
                  data-week-day-index={index}
                  className={cn(
                    "p-2 text-center transition-colors",
                    isToday(day) && "bg-muted text-foreground",
                  )}
                >
                    <div>{format(day, "EEE")}</div>
                    <div className="text-sm text-muted-foreground">
                      {format(day, "d")}
                    </div>
                  </th>
                ))}
                <th className="p-2 text-center">Actions</th>
              </tr>
            </thead>
            {sortedCategories.map((category) => (
              <tbody
                key={category}
                className={cn(
                  "relative transition-colors",
                  activeCategory && activeCategory !== category && "opacity-50",
                )}
              >
                <tr
                  className="sticky top-[49px] z-40 cursor-pointer bg-muted/100 transition-colors hover:bg-muted/70"
                  onClick={() => toggleCategory(category)}
                >
                  <td colSpan={9} className="p-2 font-medium">
                    <div className="flex items-center gap-2">
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          expandedCategories.has(category) && "rotate-90",
                        )}
                      />
                      {category}
                    </div>
                  </td>
                </tr>
                {expandedCategories.has(category) && (
                  <SortableContext
                    items={habitsByCategory[category].map((habit) => habit.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {habitsByCategory[category].map((habit) => (
                      <SortableHabitRow
                        key={habit.id}
                        habit={habit}
                        daysInMonth={daysInWeek}
                        onToggleLog={onToggleLog}
                        onEditHabit={onEditHabit}
                        onDeleteHabit={onDeleteHabit}
                        isToday={isToday}
                        interactionSize="full"
                      />
                    ))}
                  </SortableContext>
                )}
              </tbody>
            ))}
          </table>
        </div>
      </DndContext>
    </div>
  );
}
