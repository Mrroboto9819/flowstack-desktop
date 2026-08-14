<script lang="ts">
  import { Calendar, ChevronLeft, ChevronRight } from "$lib/icons";
  import { clickOutside } from "../clickOutside.js";
  import { tick } from "svelte";

  let {
    value = $bindable(""),
    placeholder = "Select date",
    disabled = false,
    class: className = "",
  } = $props();

  let isOpen = $state(false);
  let pickerRef: HTMLDivElement | null = $state(null);
  let buttonRef: HTMLButtonElement | null = $state(null);
  let dropdownRef: HTMLDivElement | null = $state(null);
  let dropdownPosition = $state({ top: -9999, left: -9999, width: 320 });

  // Current view date (used for navigation)
  let viewDate = $state(new Date());

  // Helper to parse "YYYY-MM-DD" as local date (00:00:00)
  function parseDateFromISO(dateStr: string | null): Date | null {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  // Parse the value to a Date object
  let selectedDate = $derived(parseDateFromISO(value));

  // Update view date when value changes
  $effect(() => {
    const date = parseDateFromISO(value);
    if (date && !isNaN(date.getTime())) {
      viewDate = date;
    }
  });

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  async function togglePicker() {
    if (!disabled) {
      if (!isOpen) {
        isOpen = true;
        await tick();

        if (buttonRef && dropdownRef) {
          const buttonRect = buttonRef.getBoundingClientRect();
          const dropdownRect = dropdownRef.getBoundingClientRect();

          const spaceBelow = window.innerHeight - buttonRect.bottom;
          const spaceAbove = buttonRect.top;

          let top;
          let left = buttonRect.left;

          // Default to bottom
          top = buttonRect.bottom + 8;

          // If not enough space below, and enough space above, go up
          if (
            spaceBelow < dropdownRect.height &&
            spaceAbove > dropdownRect.height
          ) {
            top = buttonRect.top - dropdownRect.height - 8;
          }

          // Clamp left to not overflow window width
          if (left + dropdownRect.width > window.innerWidth) {
            left = window.innerWidth - dropdownRect.width - 8;
          }
          // Clamp left to not be negative
          if (left < 8) left = 8;

          dropdownPosition = {
            top,
            left,
            width: Math.max(buttonRect.width, 320),
          };
        }
      } else {
        isOpen = false;
      }
    }
  }

  function handleClickOutside() {
    isOpen = false;
  }

  function formatDisplayDate(dateStr: string) {
    if (!dateStr) return placeholder;
    const date = parseDateFromISO(dateStr);
    if (!date || isNaN(date.getTime())) return placeholder;
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatDateToISO(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function selectDate(day: any) {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    value = formatDateToISO(newDate);
    isOpen = false;
  }

  function previousMonth() {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  }

  function nextMonth() {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  }

  function clearDate() {
    value = "";
    isOpen = false;
  }

  function goToToday() {
    const today = new Date();
    value = formatDateToISO(today);
    viewDate = today;
    isOpen = false;
  }

  // Get calendar days for current view
  function getCalendarDays() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    // First day of the month
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = firstDay.getDay();

    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    const lastDate = lastDay.getDate();

    // Days from previous month
    const prevMonthDays = [];
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      prevMonthDays.push({
        day: prevMonthLastDay - i,
        isCurrentMonth: false,
        isPrevMonth: true,
      });
    }

    // Days of current month
    const currentMonthDays = [];
    for (let day = 1; day <= lastDate; day++) {
      currentMonthDays.push({
        day,
        isCurrentMonth: true,
        isPrevMonth: false,
      });
    }

    // Days from next month
    const nextMonthDays = [];
    const totalDays = prevMonthDays.length + currentMonthDays.length;
    const remainingDays = totalDays % 7 === 0 ? 0 : 7 - (totalDays % 7);
    for (let day = 1; day <= remainingDays; day++) {
      nextMonthDays.push({
        day,
        isCurrentMonth: false,
        isPrevMonth: false,
      });
    }

    return [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];
  }

  function isToday(day: any) {
    const today = new Date();
    return (
      day.isCurrentMonth &&
      day.day === today.getDate() &&
      viewDate.getMonth() === today.getMonth() &&
      viewDate.getFullYear() === today.getFullYear()
    );
  }

  function isSelected(day: any) {
    if (!selectedDate || !day.isCurrentMonth) return false;
    return (
      day.day === selectedDate.getDate() &&
      viewDate.getMonth() === selectedDate.getMonth() &&
      viewDate.getFullYear() === selectedDate.getFullYear()
    );
  }

  let calendarDays = $derived(getCalendarDays());
</script>

<div
  bind:this={pickerRef}
  class={className}
  use:clickOutside={handleClickOutside}
>
  <!-- Date Input Button -->
  <button
    bind:this={buttonRef}
    type="button"
    class={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 ${
      disabled
        ? "cursor-not-allowed opacity-50 bg-muted border-border"
        : isOpen
          ? "border-primary bg-background text-foreground ring-2 ring-primary/20"
          : "border-border bg-background text-foreground hover:border-primary/50"
    }`}
    onclick={togglePicker}
    {disabled}
    aria-haspopup="dialog"
    aria-expanded={isOpen}
  >
    <span class={value ? "text-foreground" : "text-muted-foreground"}>
      {formatDisplayDate(value)}
    </span>
    <Calendar size={16} class="text-muted-foreground" />
  </button>

  <!-- Calendar Dropdown -->
  {#if isOpen}
    <div
      bind:this={dropdownRef}
      class="fixed z-[100] rounded-lg border border-border bg-card shadow-lg overflow-hidden"
      style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {dropdownPosition.width}px;"
      role="dialog"
      aria-label="Date picker"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30"
      >
        <button
          type="button"
          class="rounded p-1 hover:bg-muted transition-colors"
          onclick={previousMonth}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} class="text-foreground" />
        </button>
        <div class="text-sm font-semibold text-foreground">
          {monthNames[viewDate.getMonth()]}
          {viewDate.getFullYear()}
        </div>
        <button
          type="button"
          class="rounded p-1 hover:bg-muted transition-colors"
          onclick={nextMonth}
          aria-label="Next month"
        >
          <ChevronRight size={16} class="text-foreground" />
        </button>
      </div>

      <!-- Calendar Grid -->
      <div class="p-2">
        <!-- Day names -->
        <div class="grid grid-cols-7 gap-1 mb-2">
          {#each dayNames as dayName}
            <div
              class="text-center text-xs font-medium text-muted-foreground py-1"
            >
              {dayName}
            </div>
          {/each}
        </div>

        <!-- Days -->
        <div class="grid grid-cols-7 gap-1">
          {#each calendarDays as day}
            <button
              type="button"
              class={`aspect-square flex items-center justify-center text-sm rounded transition-colors ${
                !day.isCurrentMonth
                  ? "text-muted-foreground/40 hover:bg-muted/50"
                  : isSelected(day)
                    ? "bg-primary text-primary-foreground font-semibold"
                    : isToday(day)
                      ? "bg-primary/10 text-primary font-medium border border-primary/30"
                      : "text-foreground hover:bg-muted"
              }`}
              onclick={() => {
                if (day.isCurrentMonth) {
                  selectDate(day.day);
                } else if (day.isPrevMonth) {
                  previousMonth();
                } else {
                  nextMonth();
                }
              }}
            >
              {day.day}
            </button>
          {/each}
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex items-center gap-2 px-2 py-2 border-t border-border bg-muted/30"
      >
        <button
          type="button"
          class="flex-1 btn btn-secondary text-xs py-1"
          onclick={goToToday}
        >
          Today
        </button>
        <button
          type="button"
          class="flex-1 btn btn-ghost text-xs py-1"
          onclick={clearDate}
        >
          Clear
        </button>
      </div>
    </div>
  {/if}
</div>
