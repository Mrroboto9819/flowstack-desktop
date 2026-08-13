<script lang="ts">
  import {
    BarChart3,
    TrendingDown,
    Award,
    Target,
    Calendar,
    Users,
    PieChart,
    Clock,
    Tag,
    TrendingUp,
    CheckCircle,
    AlertCircle,
    Filter,
    Timer,
    GitCompare,
    BarChart2,
    ArrowRightLeft,
    Undo2,
  } from "lucide-svelte";
  import { onMount, onDestroy } from "svelte";
  import { Chart, registerables } from "chart.js";
  import { sprintStore, taskStore, userStore, settingsStore } from "../../lib/stores/index.js";
  import { _ } from "$lib/i18n";
  import * as Select from "$lib/components/ui/select/index.svelte";

  // Get methodology from settings
  let methodology = $derived(settingsStore.settings.methodology || "agile");

  /**
   * Story points as a number.
   *
   * The task form stores `points` as a STRING, so `sum + pts(t)`
   * concatenates instead of adding - that is what turned Total Points into
   * "0885553138211313". Every arithmetic use of points must go through here.
   *
   * @param {any} task
   * @returns {number}
   */
  function pts(task: any): number {
    const n = parseInt(task?.points, 10);
    return Number.isFinite(n) ? n : 0;
  }

  // Register Chart.js components
  Chart.register(...registerables);

  // Canvas refs
  let velocityCanvas: HTMLCanvasElement;
  let burndownCanvas: HTMLCanvasElement;
  let monthlyCanvas: HTMLCanvasElement;
  let taskTypeCanvas: HTMLCanvasElement;
  let priorityCanvas: HTMLCanvasElement;
  let teamCanvas: HTMLCanvasElement;

  // Chart instances
  let velocityChart: Chart | null = null;
  let burndownChart: Chart | null = null;
  let monthlyChart: Chart | null = null;
  let taskTypeChart: Chart | null = null;
  let priorityChart: Chart | null = null;
  let teamChart: Chart | null = null;

  let mounted = $state(false);
  let activeTab = $state("overview"); // overview, monthly, team, analysis, metrics

  // ============ FILTERS ============
  let filterDateRange = $state("all"); // all, week, month, quarter, year
  let filterSprint = $state("all");
  let filterMember = $state("all");

  // Date range helpers
  function getDateRangeStart(): Date | null {
    const now = new Date();
    switch (filterDateRange) {
      case "week":
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      case "month":
        return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      case "quarter":
        return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      case "year":
        return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      default:
        return null;
    }
  }

  // Data
  let allTasks = $derived(taskStore.tasks);
  let allSprints = $derived(sprintStore.sprints);
  let allUsers = $derived(userStore.users);

  // Filtered tasks based on filters
  let filteredTasks = $derived(() => {
    let tasks = allTasks;
    const dateStart = getDateRangeStart();

    // Filter by date range
    if (dateStart) {
      tasks = tasks.filter((t) => new Date(t.created) >= dateStart);
    }

    // Filter by sprint
    if (filterSprint !== "all") {
      if (filterSprint === "backlog") {
        tasks = tasks.filter((t) => !t.sprintId);
      } else {
        tasks = tasks.filter((t) => t.sprintId === filterSprint);
      }
    }

    // Filter by member
    if (filterMember !== "all") {
      tasks = tasks.filter((t) => t.asign === filterMember);
    }

    return tasks;
  });

  let completedSprints = $derived(
    allSprints
      .filter((s) => s.status === "closed")
      .sort((a, b) => new Date(a.end || a.created).getTime() - new Date(b.end || b.created).getTime())
  );
  let activeSprint = $derived(sprintStore.getActive());

  // Sprint filter options
  let sprintFilterOptions = $derived([
    { value: "all", label: $_("common.all") },
    { value: "backlog", label: $_("tasks.backlog") },
    ...allSprints.map((s) => ({ value: s.id, label: s.name || `Sprint ${s.id.slice(0, 4)}` })),
  ]);

  // Member filter options
  let memberFilterOptions = $derived([
    { value: "all", label: $_("common.all") },
    ...allUsers.map((u) => ({ value: u.name, label: u.name })),
  ]);

  // Date range filter options
  let dateRangeOptions = $derived([
    { value: "all", label: $_("reports.allTime") },
    { value: "week", label: $_("reports.lastWeek") },
    { value: "month", label: $_("reports.lastMonth") },
    { value: "quarter", label: $_("reports.lastQuarter") },
    { value: "year", label: $_("reports.lastYear") },
  ]);

  // Helper to get selected label
  function getSelectedLabel(options: { value: string; label: string }[], value: string): string {
    return options.find((o) => o.value === value)?.label || value;
  }

  // ============ OVERVIEW STATS ============
  let overviewStats = $derived(() => {
    const tasks = filteredTasks();
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === "DONE").length;
    const totalPoints = tasks.reduce((sum, t) => sum + pts(t), 0);
    const completedPoints = tasks
      .filter((t) => t.status === "DONE")
      .reduce((sum, t) => sum + pts(t), 0);
    const avgVelocity = completedSprints.length > 0
      ? Math.round(completedPoints / completedSprints.length)
      : 0;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Calculate average time spent (from timer)
    const tasksWithTime = tasks.filter((t) => t.elapsedSeconds && t.elapsedSeconds > 0);
    const totalTimeSpent = tasksWithTime.reduce((sum, t) => sum + (t.elapsedSeconds || 0), 0);
    const avgTimePerTask = tasksWithTime.length > 0
      ? Math.round(totalTimeSpent / tasksWithTime.length / 60) // in minutes
      : 0;

    return {
      totalTasks,
      completedTasks,
      totalPoints,
      completedPoints,
      completedSprints: completedSprints.length,
      avgVelocity,
      completionRate,
      avgTimePerTask,
      activeSprint: activeSprint?.name || null,
    };
  });

  // ============ ADVANCED METRICS ============
  function getAdvancedMetrics() {
    const tasks = filteredTasks();
    const now = new Date();

    // Lead Time: time from creation to completion (in days)
    const completedTasksWithDates = tasks.filter((t) => t.status === "DONE" && t.created && t.updated);
    const leadTimes = completedTasksWithDates.map((t) => {
      const created = new Date(t.created);
      const completed = new Date(t.updated);
      return (completed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24); // days
    });
    const avgLeadTime = leadTimes.length > 0 ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length * 10) / 10 : 0;

    // Cycle Time: approximation using elapsed seconds (active work time)
    const tasksWithTime = tasks.filter((t) => t.status === "DONE" && t.elapsedSeconds && t.elapsedSeconds > 0);
    const avgCycleTime = tasksWithTime.length > 0
      ? Math.round(tasksWithTime.reduce((sum, t) => sum + (t.elapsedSeconds || 0), 0) / tasksWithTime.length / 3600 * 10) / 10 // hours
      : 0;

    // Work in Progress (WIP): tasks not in BACKLOG or DONE
    const wipTasks = tasks.filter((t) => t.status !== "BACKLOG" && t.status !== "DONE");
    const wipCount = wipTasks.length;
    const wipPoints = wipTasks.reduce((sum, t) => sum + pts(t), 0);

    // Blocked tasks
    const blockedTasks = tasks.filter((t) => t.blocked);
    const blockedCount = blockedTasks.length;

    // Bug ratio
    const totalTasks = tasks.length;
    const bugCount = tasks.filter((t) => t.type === "bug").length;
    const bugRatio = totalTasks > 0 ? Math.round((bugCount / totalTasks) * 100) : 0;

    // Task age (days since creation for open tasks)
    const openTasks = tasks.filter((t) => t.status !== "DONE");
    const taskAges = openTasks.map((t) => {
      const created = new Date(t.created);
      return (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24); // days
    });
    const avgTaskAge = taskAges.length > 0 ? Math.round(taskAges.reduce((a, b) => a + b, 0) / taskAges.length * 10) / 10 : 0;
    const oldestTaskAge = taskAges.length > 0 ? Math.round(Math.max(...taskAges)) : 0;

    // Throughput: completed tasks per week (last 4 weeks)
    const fourWeeksAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);
    const recentCompleted = tasks.filter((t) => t.status === "DONE" && t.updated && new Date(t.updated) >= fourWeeksAgo);
    const weeklyThroughput = Math.round(recentCompleted.length / 4 * 10) / 10;

    // Sprint commitment vs delivered
    let sprintCommitment = { planned: 0, delivered: 0, rate: 0 };
    if (activeSprint) {
      const sprintTasks = allTasks.filter((t) => t.sprintId === activeSprint.id);
      sprintCommitment.planned = sprintTasks.reduce((sum, t) => sum + pts(t), 0);
      sprintCommitment.delivered = sprintTasks.filter((t) => t.status === "DONE").reduce((sum, t) => sum + pts(t), 0);
      sprintCommitment.rate = sprintCommitment.planned > 0 ? Math.round((sprintCommitment.delivered / sprintCommitment.planned) * 100) : 0;
    }

    // Work distribution (Gini-like coefficient for task distribution)
    const memberTasks: Record<string, number> = {};
    tasks.forEach((t) => {
      if (t.asign) {
        memberTasks[t.asign] = (memberTasks[t.asign] || 0) + 1;
      }
    });
    const memberCounts = Object.values(memberTasks);
    const totalAssigned = memberCounts.reduce((a, b) => a + b, 0);
    const avgPerMember = memberCounts.length > 0 ? totalAssigned / memberCounts.length : 0;
    const variance = memberCounts.length > 0
      ? memberCounts.reduce((sum, c) => sum + Math.pow(c - avgPerMember, 2), 0) / memberCounts.length
      : 0;
    const distributionBalance = avgPerMember > 0 ? Math.max(0, 100 - Math.round(Math.sqrt(variance) / avgPerMember * 100)) : 100;

    return {
      avgLeadTime,
      avgCycleTime,
      wipCount,
      wipPoints,
      blockedCount,
      bugRatio,
      avgTaskAge,
      oldestTaskAge,
      weeklyThroughput,
      sprintCommitment,
      distributionBalance,
      memberTasks,
    };
  }

  // ============ SPILLOVER DATA ============
  interface SpilloverTask {
    id: string;
    title: string;
    originalSprintId: string | null;
    originalSprintName: string;
    currentSprintId: string | null;
    currentSprintName: string;
    movedToBacklog: boolean;
    movedOn: string;
    status: string;
    points: number;
  }

  function getSpilloverData(): { tasks: SpilloverTask[]; movedToBacklog: number; movedToNewSprint: number; spilloverRate: number } {
    const spilloverTasks: SpilloverTask[] = [];

    allTasks.forEach((task) => {
      if (!task.history || !Array.isArray(task.history)) return;

      // Find sprint changes in history
      const sprintChanges = task.history.filter(
        (h: any) => h.field === "sprintId" && h.action === "update" && h.from !== null
      );

      // Only consider tasks that moved FROM a sprint (not initial assignment)
      sprintChanges.forEach((change: any) => {
        // Skip if task was completed in the original sprint (it's not spillover)
        // We check if the task is NOT done when it was moved
        const changeIndex = task.history.indexOf(change);
        const statusAtMove = task.history
          .slice(0, changeIndex + 1)
          .reverse()
          .find((h: any) => h.field === "status");

        // If task was already DONE when moved, it's not spillover
        if (statusAtMove && statusAtMove.to === "DONE") return;

        const originalSprint = allSprints.find((s) => s.id === change.from);
        const newSprint = change.to ? allSprints.find((s) => s.id === change.to) : null;

        spilloverTasks.push({
          id: task.id,
          title: task.title || "Untitled Task",
          originalSprintId: change.from,
          originalSprintName: originalSprint?.name || "Unknown Sprint",
          currentSprintId: change.to,
          currentSprintName: newSprint?.name || "Backlog",
          movedToBacklog: change.to === null,
          movedOn: change.timestamp,
          status: task.status || "BACKLOG",
          points: pts(task),
        });
      });
    });

    // Sort by most recent first
    spilloverTasks.sort((a, b) => new Date(b.movedOn).getTime() - new Date(a.movedOn).getTime());

    // Calculate stats
    const movedToBacklog = spilloverTasks.filter((t) => t.movedToBacklog).length;
    const movedToNewSprint = spilloverTasks.filter((t) => !t.movedToBacklog).length;

    // Calculate spillover rate: tasks spilled / total tasks in completed sprints
    const completedSprintIds = completedSprints.map((s) => s.id);
    const tasksInCompletedSprints = allTasks.filter((t) => completedSprintIds.includes(t.sprintId)).length;
    const uniqueSpilledTaskIds = [...new Set(spilloverTasks.map((t) => t.id))];
    const spilloverRate = tasksInCompletedSprints > 0
      ? Math.round((uniqueSpilledTaskIds.length / tasksInCompletedSprints) * 100)
      : 0;

    return {
      tasks: spilloverTasks,
      movedToBacklog,
      movedToNewSprint,
      spilloverRate,
    };
  }

  // ============ MONTHLY DATA ============
  function getMonthlyData() {
    const tasks = filteredTasks();
    const monthlyStats: Record<string, { completed: number; created: number; points: number }> = {};
    const now = new Date();

    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthlyStats[key] = { completed: 0, created: 0, points: 0 };
    }

    tasks.forEach((task) => {
      const createdDate = new Date(task.created);
      const createdKey = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`;

      if (monthlyStats[createdKey]) {
        monthlyStats[createdKey].created++;
      }

      if (task.status === "DONE" && task.updated) {
        const completedDate = new Date(task.updated);
        const completedKey = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, "0")}`;
        if (monthlyStats[completedKey]) {
          monthlyStats[completedKey].completed++;
          monthlyStats[completedKey].points += pts(task);
        }
      }
    });

    const labels = Object.keys(monthlyStats).map((key) => {
      const [year, month] = key.split("-");
      return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    });

    return {
      labels,
      created: Object.values(monthlyStats).map((s) => s.created),
      completed: Object.values(monthlyStats).map((s) => s.completed),
      points: Object.values(monthlyStats).map((s) => s.points),
    };
  }

  // ============ TASK TYPE DISTRIBUTION ============
  function getTaskTypeData() {
    const tasks = filteredTasks();
    const types = { story: 0, bug: 0, chore: 0 };
    tasks.forEach((task) => {
      const type = task.type || "story";
      if (types[type] !== undefined) {
        types[type]++;
      }
    });
    return types;
  }

  // ============ PRIORITY DISTRIBUTION ============
  function getPriorityData() {
    const tasks = filteredTasks();
    const priorities = { critical: 0, high: 0, medium: 0, low: 0 };
    tasks.forEach((task) => {
      const priority = task.priority || "medium";
      if (priorities[priority] !== undefined) {
        priorities[priority]++;
      }
    });
    return priorities;
  }

  // ============ TEAM PERFORMANCE ============
  function getTeamData() {
    const tasks = filteredTasks();
    const teamStats: Record<string, { tasks: number; points: number; completed: number; completedPoints: number; timeSpent: number; bugs: number; stories: number; chores: number }> = {};

    tasks.forEach((task) => {
      const assignee = task.asign || "Unassigned";
      if (!teamStats[assignee]) {
        teamStats[assignee] = { tasks: 0, points: 0, completed: 0, completedPoints: 0, timeSpent: 0, bugs: 0, stories: 0, chores: 0 };
      }
      teamStats[assignee].tasks++;
      teamStats[assignee].points += pts(task);
      teamStats[assignee].timeSpent += task.elapsedSeconds || 0;

      // Track task types
      const taskType = task.type || "story";
      if (taskType === "bug") teamStats[assignee].bugs++;
      else if (taskType === "chore") teamStats[assignee].chores++;
      else teamStats[assignee].stories++;

      if (task.status === "DONE") {
        teamStats[assignee].completed++;
        teamStats[assignee].completedPoints += pts(task);
      }
    });

    // Sort by completed tasks
    const sorted = Object.entries(teamStats)
      .sort((a, b) => b[1].completed - a[1].completed)
      .slice(0, 8); // Top 8

    return {
      labels: sorted.map(([name]) => name),
      tasks: sorted.map(([, data]) => data.tasks),
      completed: sorted.map(([, data]) => data.completed),
      points: sorted.map(([, data]) => data.points),
      completedPoints: sorted.map(([, data]) => data.completedPoints),
      timeSpent: sorted.map(([, data]) => data.timeSpent),
      bugs: sorted.map(([, data]) => data.bugs),
      stories: sorted.map(([, data]) => data.stories),
      chores: sorted.map(([, data]) => data.chores),
    };
  }

  // Get detailed member productivity
  function getMemberProductivity() {
    const tasks = filteredTasks();
    const members: Array<{
      name: string;
      tasks: number;
      completed: number;
      completionRate: number;
      points: number;
      completedPoints: number;
      avgTimePerTask: number;
      bugs: number;
      stories: number;
      chores: number;
    }> = [];

    const teamStats: Record<string, { tasks: number; completed: number; points: number; completedPoints: number; timeSpent: number; bugs: number; stories: number; chores: number }> = {};

    tasks.forEach((task) => {
      const assignee = task.asign;
      if (!assignee) return; // Skip unassigned

      if (!teamStats[assignee]) {
        teamStats[assignee] = { tasks: 0, completed: 0, points: 0, completedPoints: 0, timeSpent: 0, bugs: 0, stories: 0, chores: 0 };
      }
      teamStats[assignee].tasks++;
      teamStats[assignee].points += pts(task);
      teamStats[assignee].timeSpent += task.elapsedSeconds || 0;

      const taskType = task.type || "story";
      if (taskType === "bug") teamStats[assignee].bugs++;
      else if (taskType === "chore") teamStats[assignee].chores++;
      else teamStats[assignee].stories++;

      if (task.status === "DONE") {
        teamStats[assignee].completed++;
        teamStats[assignee].completedPoints += pts(task);
      }
    });

    Object.entries(teamStats).forEach(([name, data]) => {
      members.push({
        name,
        tasks: data.tasks,
        completed: data.completed,
        completionRate: data.tasks > 0 ? Math.round((data.completed / data.tasks) * 100) : 0,
        points: data.points,
        completedPoints: data.completedPoints,
        avgTimePerTask: data.completed > 0 ? Math.round(data.timeSpent / data.completed / 60) : 0, // minutes
        bugs: data.bugs,
        stories: data.stories,
        chores: data.chores,
      });
    });

    // Sort by completed points (productivity)
    return members.sort((a, b) => b.completedPoints - a.completedPoints);
  }

  // ============ VELOCITY DATA ============
  function getVelocityData() {
    const labels: string[] = [];
    const completedPoints: number[] = [];
    const plannedPoints: number[] = [];

    completedSprints.forEach((sprint) => {
      labels.push(sprint.name || "Sprint");
      const sprintTasks = allTasks.filter((t) => t.sprintId === sprint.id);
      const completed = sprintTasks
        .filter((t) => t.status === "DONE")
        .reduce((sum, t) => sum + pts(t), 0);
      const planned = sprintTasks.reduce((sum, t) => sum + pts(t), 0);
      completedPoints.push(completed);
      plannedPoints.push(planned);
    });

    return { labels, completedPoints, plannedPoints };
  }

  // ============ BURNDOWN DATA ============
  function getBurndownData() {
    const sprint = activeSprint;
    if (!sprint || !sprint.start || !sprint.end) {
      return { labels: [], ideal: [], actual: [] };
    }

    const startDate = new Date(sprint.start);
    const endDate = new Date(sprint.end);
    const today = new Date();

    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const sprintTasks = allTasks.filter((t) => t.sprintId === sprint.id);
    const totalPoints = sprintTasks.reduce((sum, t) => sum + pts(t), 0);

    const labels: string[] = [];
    const ideal: number[] = [];
    const actual: (number | null)[] = [];
    const pointsPerDay = totalPoints / (totalDays - 1 || 1);

    for (let i = 0; i < totalDays; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);

      labels.push(currentDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
      ideal.push(Math.max(0, totalPoints - (pointsPerDay * i)));

      if (currentDate <= today) {
        const remainingPoints = sprintTasks
          .filter((t) => t.status !== "DONE")
          .reduce((sum, t) => sum + pts(t), 0);
        actual.push(remainingPoints);
      } else {
        actual.push(null);
      }
    }

    return { labels, ideal, actual };
  }

  // ============ CHART CREATION ============
  function createVelocityChart() {
    if (!velocityCanvas || completedSprints.length === 0) return;
    const data = getVelocityData();
    if (velocityChart) velocityChart.destroy();

    velocityChart = new Chart(velocityCanvas, {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: $_("reports.completed"),
            data: data.completedPoints,
            backgroundColor: "rgba(16, 185, 129, 0.8)",
            borderColor: "rgb(16, 185, 129)",
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: $_("reports.planned"),
            data: data.plannedPoints,
            backgroundColor: "rgba(59, 130, 246, 0.5)",
            borderColor: "rgb(59, 130, 246)",
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { color: "rgb(156, 163, 175)", font: { size: 12 } } },
        },
        scales: {
          x: { ticks: { color: "rgb(156, 163, 175)" }, grid: { color: "rgba(156, 163, 175, 0.1)" } },
          y: { beginAtZero: true, ticks: { color: "rgb(156, 163, 175)" }, grid: { color: "rgba(156, 163, 175, 0.1)" } },
        },
      },
    });
  }

  function createBurndownChart() {
    if (!burndownCanvas || !activeSprint) return;
    const data = getBurndownData();
    if (data.labels.length === 0) return;
    if (burndownChart) burndownChart.destroy();

    burndownChart = new Chart(burndownCanvas, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          { label: "Ideal", data: data.ideal, borderColor: "rgba(156, 163, 175, 0.5)", borderDash: [5, 5], fill: false, tension: 0, pointRadius: 0 },
          { label: "Actual", data: data.actual, borderColor: "rgb(16, 185, 129)", backgroundColor: "rgba(16, 185, 129, 0.1)", fill: true, tension: 0.2, pointRadius: 3, pointBackgroundColor: "rgb(16, 185, 129)" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { color: "rgb(156, 163, 175)", font: { size: 12 } } } },
        scales: {
          x: { ticks: { color: "rgb(156, 163, 175)" }, grid: { color: "rgba(156, 163, 175, 0.1)" } },
          y: { beginAtZero: true, ticks: { color: "rgb(156, 163, 175)" }, grid: { color: "rgba(156, 163, 175, 0.1)" } },
        },
      },
    });
  }

  function createMonthlyChart() {
    if (!monthlyCanvas) return;
    const data = getMonthlyData();
    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(monthlyCanvas, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          { label: $_("reports.tasksCreated"), data: data.created, borderColor: "rgb(59, 130, 246)", backgroundColor: "rgba(59, 130, 246, 0.1)", fill: true, tension: 0.3 },
          { label: $_("reports.tasksCompleted"), data: data.completed, borderColor: "rgb(16, 185, 129)", backgroundColor: "rgba(16, 185, 129, 0.1)", fill: true, tension: 0.3 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { color: "rgb(156, 163, 175)", font: { size: 12 } } } },
        scales: {
          x: { ticks: { color: "rgb(156, 163, 175)" }, grid: { color: "rgba(156, 163, 175, 0.1)" } },
          y: { beginAtZero: true, ticks: { color: "rgb(156, 163, 175)" }, grid: { color: "rgba(156, 163, 175, 0.1)" } },
        },
      },
    });
  }

  function createTaskTypeChart() {
    if (!taskTypeCanvas) return;
    const data = getTaskTypeData();
    if (taskTypeChart) taskTypeChart.destroy();

    taskTypeChart = new Chart(taskTypeCanvas, {
      type: "doughnut",
      data: {
        labels: [$_("tasks.types.story"), $_("tasks.types.bug"), $_("tasks.types.chore")],
        datasets: [{
          data: [data.story, data.bug, data.chore],
          backgroundColor: ["rgba(59, 130, 246, 0.8)", "rgba(239, 68, 68, 0.8)", "rgba(156, 163, 175, 0.8)"],
          borderColor: ["rgb(59, 130, 246)", "rgb(239, 68, 68)", "rgb(156, 163, 175)"],
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "rgb(156, 163, 175)", font: { size: 12 }, padding: 20 } },
        },
      },
    });
  }

  function createPriorityChart() {
    if (!priorityCanvas) return;
    const data = getPriorityData();
    if (priorityChart) priorityChart.destroy();

    priorityChart = new Chart(priorityCanvas, {
      type: "doughnut",
      data: {
        labels: [$_("tasks.priority.critical"), $_("tasks.priority.high"), $_("tasks.priority.medium"), $_("tasks.priority.low")],
        datasets: [{
          data: [data.critical, data.high, data.medium, data.low],
          backgroundColor: ["rgba(239, 68, 68, 0.8)", "rgba(249, 115, 22, 0.8)", "rgba(234, 179, 8, 0.8)", "rgba(59, 130, 246, 0.8)"],
          borderColor: ["rgb(239, 68, 68)", "rgb(249, 115, 22)", "rgb(234, 179, 8)", "rgb(59, 130, 246)"],
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "rgb(156, 163, 175)", font: { size: 12 }, padding: 20 } },
        },
      },
    });
  }

  function createTeamChart() {
    if (!teamCanvas) return;
    const data = getTeamData();
    if (data.labels.length === 0) return;
    if (teamChart) teamChart.destroy();

    teamChart = new Chart(teamCanvas, {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [
          { label: $_("reports.tasksCompleted"), data: data.completed, backgroundColor: "rgba(16, 185, 129, 0.8)", borderRadius: 4 },
          { label: $_("reports.totalPoints"), data: data.points, backgroundColor: "rgba(139, 92, 246, 0.8)", borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { color: "rgb(156, 163, 175)", font: { size: 12 } } } },
        scales: {
          x: { beginAtZero: true, ticks: { color: "rgb(156, 163, 175)" }, grid: { color: "rgba(156, 163, 175, 0.1)" } },
          y: { ticks: { color: "rgb(156, 163, 175)" }, grid: { color: "rgba(156, 163, 175, 0.1)" } },
        },
      },
    });
  }

  function createChartsForTab(tab: string) {
    setTimeout(() => {
      if (tab === "overview") {
        createVelocityChart();
        createBurndownChart();
      } else if (tab === "monthly") {
        createMonthlyChart();
      } else if (tab === "team") {
        createTeamChart();
      } else if (tab === "analysis") {
        createTaskTypeChart();
        createPriorityChart();
      }
    }, 50);
  }

  onMount(() => {
    mounted = true;
    // Create charts for initial tab
    createChartsForTab(activeTab);
  });

  onDestroy(() => {
    [velocityChart, burndownChart, monthlyChart, taskTypeChart, priorityChart, teamChart].forEach((c) => c?.destroy());
  });

  // Recreate charts when tab changes
  $effect(() => {
    if (mounted) {
      createChartsForTab(activeTab);
    }
  });

  // Recreate charts when data changes
  $effect(() => {
    if (mounted && allTasks) {
      createChartsForTab(activeTab);
    }
  });

  // Handle methodology change - switch to valid tab if current tab is not available
  $effect(() => {
    if (methodology !== "agile" && activeTab === "overview") {
      activeTab = "monthly";
    }
  });
</script>

<main class="w-full px-6 pt-6 pb-10">
  <!-- Header -->
  <header class="mb-6">
    <div class="flex items-center gap-3 mb-2">
      <div class="rounded-xl bg-primary/10 border border-primary/30 p-2.5">
        <BarChart3 size={24} class="text-primary" />
      </div>
      <div>
        <h1 class="text-3xl font-bold text-foreground">{$_("reports.title")}</h1>
        <p class="text-muted-foreground mt-1">
          {#if methodology === "agile"}
            {$_("reports.descriptionAgile")}
          {:else if methodology === "kanban"}
            {$_("reports.descriptionKanban")}
          {:else}
            {$_("reports.descriptionWaterfall")}
          {/if}
        </p>
      </div>
    </div>
  </header>

  <!-- Tabs -->
  <div class="mb-4 border-b border-border">
    <div class="flex gap-1">
      {#each [
        { id: "overview", label: $_("reports.overview"), icon: BarChart3, methodologies: ["agile"] },
        { id: "monthly", label: $_("reports.monthly"), icon: Calendar, methodologies: ["agile", "kanban", "waterfall"] },
        { id: "team", label: $_("reports.team"), icon: Users, methodologies: ["agile", "kanban", "waterfall"] },
        { id: "analysis", label: $_("reports.analysis"), icon: PieChart, methodologies: ["agile", "kanban", "waterfall"] },
        { id: "metrics", label: $_("reports.metrics"), icon: Timer, methodologies: ["agile", "kanban", "waterfall"] },
      ].filter(tab => tab.methodologies.includes(methodology)) as tab}
        <button
          type="button"
          class="px-4 py-3 text-sm font-semibold transition-all border-b-2 flex items-center gap-2"
          class:border-primary={activeTab === tab.id}
          class:text-primary={activeTab === tab.id}
          class:border-transparent={activeTab !== tab.id}
          class:text-muted-foreground={activeTab !== tab.id}
          onclick={() => (activeTab = tab.id)}
        >
          <svelte:component this={tab.icon} size={16} />
          {tab.label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Filters -->
  <div class="mb-6 flex flex-wrap items-center gap-3 p-4 rounded-xl bg-card border border-border">
    <div class="flex items-center gap-2 text-sm text-muted-foreground">
      <Filter size={16} />
      <span>{$_("reports.filters")}:</span>
    </div>

    <!-- Date Range Filter -->
    <div class="relative min-w-[140px]">
      <Select.Root onValueChange={(v) => (filterDateRange = v)}>
        <Select.Trigger class="h-9 text-sm bg-muted">
          {getSelectedLabel(dateRangeOptions, filterDateRange)}
        </Select.Trigger>
        <Select.Content>
          {#each dateRangeOptions as option}
            <Select.Item value={option.value}>{option.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <!-- Sprint Filter (Agile only) -->
    {#if methodology === "agile"}
      <div class="relative min-w-[140px]">
        <Select.Root onValueChange={(v) => (filterSprint = v)}>
          <Select.Trigger class="h-9 text-sm bg-muted">
            {getSelectedLabel(sprintFilterOptions, filterSprint)}
          </Select.Trigger>
          <Select.Content>
            {#each sprintFilterOptions as option}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    {/if}

    <!-- Member Filter -->
    <div class="relative min-w-[140px]">
      <Select.Root onValueChange={(v) => (filterMember = v)}>
        <Select.Trigger class="h-9 text-sm bg-muted">
          {getSelectedLabel(memberFilterOptions, filterMember)}
        </Select.Trigger>
        <Select.Content>
          {#each memberFilterOptions as option}
            <Select.Item value={option.value}>{option.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <!-- Clear Filters -->
    {#if filterDateRange !== "all" || filterSprint !== "all" || filterMember !== "all"}
      <button
        type="button"
        class="px-3 py-1.5 text-sm rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors"
        onclick={() => { filterDateRange = "all"; filterSprint = "all"; filterMember = "all"; }}
      >
        {$_("tasks.clearFilters")}
      </button>
    {/if}

    <!-- Active filters count -->
    {#if filterDateRange !== "all" || filterSprint !== "all" || filterMember !== "all"}
      <span class="text-xs text-muted-foreground">
        ({filteredTasks().length} {$_("reports.tasks")})
      </span>
    {/if}
  </div>

  <div class="space-y-6 max-w-7xl">
    <!-- ============ OVERVIEW TAB ============ -->
    {#if activeTab === "overview"}
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <CheckCircle size={18} class="text-emerald-500" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.completionRate")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{overviewStats().completionRate}%</p>
          <p class="text-xs text-muted-foreground mt-1">{overviewStats().completedTasks}/{overviewStats().totalTasks} {$_("reports.tasks")}</p>
        </div>

        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Target size={18} class="text-primary" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.avgVelocity")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{overviewStats().avgVelocity}</p>
          <p class="text-xs text-muted-foreground mt-1">{$_("reports.pointsPerSprint")}</p>
        </div>

        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Award size={18} class="text-amber-500" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.totalPoints")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{overviewStats().completedPoints}</p>
          <p class="text-xs text-muted-foreground mt-1">{$_("reports.delivered")}</p>
        </div>

        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Clock size={18} class="text-violet-500" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.avgTime")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{overviewStats().avgTimePerTask}</p>
          <p class="text-xs text-muted-foreground mt-1">{$_("reports.minutesPerTask")}</p>
        </div>
      </div>

      <!-- Velocity & Burndown -->
      <div class="grid md:grid-cols-2 gap-6">
        <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center gap-3 mb-4">
            <TrendingUp size={20} class="text-primary" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">{$_("reports.velocity")}</h2>
              <p class="text-sm text-muted-foreground">{$_("reports.velocityDesc")}</p>
            </div>
          </div>
          {#if completedSprints.length === 0}
            <div class="flex items-center justify-center h-64 text-muted-foreground">
              <p>{$_("reports.noData")}</p>
            </div>
          {:else}
            <div class="h-64"><canvas bind:this={velocityCanvas}></canvas></div>
          {/if}
        </section>

        <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center gap-3 mb-4">
            <TrendingDown size={20} class="text-primary" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">{$_("reports.burndown")}</h2>
              <p class="text-sm text-muted-foreground">{$_("reports.burndownDesc")}</p>
            </div>
          </div>
          {#if !activeSprint}
            <div class="flex items-center justify-center h-64 text-muted-foreground">
              <p>{$_("sprint.noActiveSprint")}</p>
            </div>
          {:else}
            <div class="mb-2 text-sm">
              <span class="font-medium text-foreground">{activeSprint.name}</span>
              {#if activeSprint.start && activeSprint.end}
                <span class="text-muted-foreground ml-2">
                  {new Date(activeSprint.start).toLocaleDateString()} - {new Date(activeSprint.end).toLocaleDateString()}
                </span>
              {/if}
            </div>
            <div class="h-56"><canvas bind:this={burndownCanvas}></canvas></div>
          {/if}
        </section>
      </div>

      <!-- Spillover Report -->
      {@const spilloverData = getSpilloverData()}
      <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="flex items-center gap-3 mb-4">
          <ArrowRightLeft size={20} class="text-amber-500" />
          <div>
            <h2 class="text-lg font-semibold text-foreground">{$_("reports.spillover")}</h2>
            <p class="text-sm text-muted-foreground">{$_("reports.spilloverDesc")}</p>
          </div>
        </div>

        <!-- Spillover Stats -->
        <div class="grid grid-cols-3 gap-4 mb-6">
          <div class="p-4 rounded-lg bg-muted/30 text-center">
            <p class="text-3xl font-bold text-amber-500">{spilloverData.tasks.length}</p>
            <p class="text-xs text-muted-foreground mt-1">{$_("reports.spilloverTasks")}</p>
          </div>
          <div class="p-4 rounded-lg bg-muted/30 text-center">
            <p class="text-3xl font-bold text-rose-500">{spilloverData.movedToBacklog}</p>
            <p class="text-xs text-muted-foreground mt-1">{$_("reports.movedToBacklog")}</p>
          </div>
          <div class="p-4 rounded-lg bg-muted/30 text-center">
            <p class="text-3xl font-bold text-blue-500">{spilloverData.movedToNewSprint}</p>
            <p class="text-xs text-muted-foreground mt-1">{$_("reports.movedToNewSprint")}</p>
          </div>
        </div>

        <!-- Spillover Tasks List -->
        {#if spilloverData.tasks.length === 0}
          <div class="flex items-center justify-center py-8 text-muted-foreground">
            <CheckCircle size={18} class="mr-2 text-emerald-500" />
            <p>{$_("reports.noSpillover")}</p>
          </div>
        {:else}
          <div class="space-y-3 max-h-80 overflow-y-auto">
            {#each spilloverData.tasks.slice(0, 10) as task}
              <div class="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div class="flex-shrink-0">
                  {#if task.movedToBacklog}
                    <Undo2 size={16} class="text-rose-500" />
                  {:else}
                    <ArrowRightLeft size={16} class="text-blue-500" />
                  {/if}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-foreground truncate">{task.title}</p>
                  <p class="text-xs text-muted-foreground">
                    {$_("reports.fromSprint")} <span class="text-primary">{task.originalSprintName}</span>
                    {#if task.movedToBacklog}
                      {$_("reports.toBacklog")}
                    {:else}
                      {$_("reports.toSprint")} <span class="text-primary">{task.currentSprintName}</span>
                    {/if}
                  </p>
                </div>
                <div class="flex-shrink-0 text-right">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {task.status === 'DONE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'}">
                    {task.status}
                  </span>
                  {#if pts(task) > 0}
                    <p class="text-xs text-muted-foreground mt-1">{task.points} {$_("reports.points")}</p>
                  {/if}
                </div>
              </div>
            {/each}
            {#if spilloverData.tasks.length > 10}
              <p class="text-center text-sm text-muted-foreground py-2">
                +{spilloverData.tasks.length - 10} more...
              </p>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    <!-- ============ MONTHLY TAB ============ -->
    {#if activeTab === "monthly"}
      <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="flex items-center gap-3 mb-4">
          <Calendar size={20} class="text-primary" />
          <div>
            <h2 class="text-lg font-semibold text-foreground">{$_("reports.monthlyTrend")}</h2>
            <p class="text-sm text-muted-foreground">{$_("reports.monthlyTrendDesc")}</p>
          </div>
        </div>
        <div class="h-80"><canvas bind:this={monthlyCanvas}></canvas></div>
      </section>

      <!-- Monthly Stats Grid -->
      {#if true}
        {@const monthlyData = getMonthlyData()}
        {@const thisMonth = monthlyData.completed[monthlyData.completed.length - 1] || 0}
        {@const lastMonth = monthlyData.completed[monthlyData.completed.length - 2] || 0}
        {@const trend = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0}
        <div class="grid md:grid-cols-3 gap-4">
          <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-muted-foreground">{$_("reports.thisMonth")}</span>
              {#if trend !== 0}
                <span class="text-xs px-2 py-0.5 rounded-full {trend > 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}">
                  {trend > 0 ? "+" : ""}{trend}%
                </span>
              {/if}
            </div>
            <p class="text-3xl font-bold text-foreground">{thisMonth}</p>
            <p class="text-xs text-muted-foreground">{$_("reports.tasksCompleted")}</p>
          </div>

          <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span class="text-sm text-muted-foreground">{$_("reports.avgMonthly")}</span>
            <p class="text-3xl font-bold text-foreground mt-2">
              {Math.round(monthlyData.completed.reduce((a, b) => a + b, 0) / 12)}
            </p>
            <p class="text-xs text-muted-foreground">{$_("reports.tasksPerMonth")}</p>
          </div>

          <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span class="text-sm text-muted-foreground">{$_("reports.bestMonth")}</span>
            <p class="text-3xl font-bold text-foreground mt-2">
              {Math.max(...monthlyData.completed)}
            </p>
            <p class="text-xs text-muted-foreground">{$_("reports.tasksCompleted")}</p>
          </div>
        </div>
      {/if}
    {/if}

    <!-- ============ TEAM TAB ============ -->
    {#if activeTab === "team"}
      {@const teamData = getTeamData()}
      {@const memberProductivity = getMemberProductivity()}
      <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="flex items-center gap-3 mb-4">
          <Users size={20} class="text-primary" />
          <div>
            <h2 class="text-lg font-semibold text-foreground">{$_("reports.teamPerformance")}</h2>
            <p class="text-sm text-muted-foreground">{$_("reports.teamPerformanceDesc")}</p>
          </div>
        </div>
        {#if teamData.labels.length === 0}
          <div class="flex items-center justify-center h-64 text-muted-foreground">
            <p>{$_("reports.noTeamData")}</p>
          </div>
        {:else}
          <div class="h-80"><canvas bind:this={teamCanvas}></canvas></div>
        {/if}
      </section>

      <!-- Team Leaderboard -->
      <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 class="text-lg font-semibold text-foreground mb-4">{$_("reports.leaderboard")}</h3>
        <div class="space-y-3">
          {#each teamData.labels.slice(0, 5) as member, i}
            {@const completed = teamData.completed[i]}
            {@const points = teamData.points[i]}
            <div class="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold {i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-gray-400 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'bg-muted text-muted-foreground'}">
                {i + 1}
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-foreground truncate">{member}</p>
                <p class="text-xs text-muted-foreground">{completed} {$_("reports.tasksCompleted")} · {points} {$_("reports.points")}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Member Productivity Stats -->
      {#if memberProductivity.length > 0}
        <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center gap-3 mb-4">
            <Target size={20} class="text-primary" />
            <div>
              <h3 class="text-lg font-semibold text-foreground">{$_("reports.memberProductivity")}</h3>
              <p class="text-sm text-muted-foreground">{$_("reports.memberProductivityDesc")}</p>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border">
                  <th class="text-left py-3 px-2 font-semibold text-muted-foreground">{$_("reports.member")}</th>
                  <th class="text-center py-3 px-2 font-semibold text-muted-foreground">{$_("reports.assigned")}</th>
                  <th class="text-center py-3 px-2 font-semibold text-muted-foreground">{$_("reports.done")}</th>
                  <th class="text-center py-3 px-2 font-semibold text-muted-foreground">{$_("reports.rate")}</th>
                  <th class="text-center py-3 px-2 font-semibold text-muted-foreground">{$_("reports.pointsDelivered")}</th>
                  <th class="text-center py-3 px-2 font-semibold text-muted-foreground">{$_("reports.avgTime")}</th>
                  <th class="text-center py-3 px-2 font-semibold text-muted-foreground">{$_("reports.taskBreakdown")}</th>
                </tr>
              </thead>
              <tbody>
                {#each memberProductivity as member}
                  <tr class="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td class="py-3 px-2">
                      <span class="font-medium text-foreground">{member.name}</span>
                    </td>
                    <td class="text-center py-3 px-2 text-muted-foreground">{member.tasks}</td>
                    <td class="text-center py-3 px-2">
                      <span class="text-emerald-500 font-medium">{member.completed}</span>
                    </td>
                    <td class="text-center py-3 px-2">
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {member.completionRate >= 80 ? 'bg-emerald-500/10 text-emerald-500' : member.completionRate >= 50 ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'}">
                        {member.completionRate}%
                      </span>
                    </td>
                    <td class="text-center py-3 px-2">
                      <span class="text-violet-500 font-medium">{member.completedPoints}</span>
                    </td>
                    <td class="text-center py-3 px-2 text-muted-foreground">
                      {member.avgTimePerTask > 0 ? `${member.avgTimePerTask}m` : "-"}
                    </td>
                    <td class="text-center py-3 px-2">
                      <div class="flex items-center justify-center gap-2 text-xs">
                        <span class="text-blue-500" title={$_("tasks.types.story")}>{member.stories}S</span>
                        <span class="text-rose-500" title={$_("tasks.types.bug")}>{member.bugs}B</span>
                        <span class="text-gray-500" title={$_("tasks.types.chore")}>{member.chores}C</span>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}
    {/if}

    <!-- ============ ANALYSIS TAB ============ -->
    {#if activeTab === "analysis"}
      <div class="grid md:grid-cols-2 gap-6">
        <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center gap-3 mb-4">
            <PieChart size={20} class="text-primary" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">{$_("reports.taskTypes")}</h2>
              <p class="text-sm text-muted-foreground">{$_("reports.taskTypesDesc")}</p>
            </div>
          </div>
          <div class="h-64"><canvas bind:this={taskTypeCanvas}></canvas></div>
        </section>

        <section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center gap-3 mb-4">
            <AlertCircle size={20} class="text-primary" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">{$_("reports.priorityDist")}</h2>
              <p class="text-sm text-muted-foreground">{$_("reports.priorityDistDesc")}</p>
            </div>
          </div>
          <div class="h-64"><canvas bind:this={priorityCanvas}></canvas></div>
        </section>
      </div>

      <!-- Insights -->
      {#if true}
        {@const types = getTaskTypeData()}
        {@const priorities = getPriorityData()}
        {@const stats = overviewStats()}
        <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h3 class="text-lg font-semibold text-foreground mb-4">{$_("reports.insights")}</h3>
          <div class="grid md:grid-cols-2 gap-4">
          <div class="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <p class="text-sm text-blue-400 font-medium mb-1">{$_("reports.taskFocus")}</p>
            <p class="text-foreground">
              {#if types.story > types.bug && types.story > types.chore}
                {$_("reports.insightFeatures")}
              {:else if types.bug > types.story}
                {$_("reports.insightBugs")}
              {:else}
                {$_("reports.insightMaintenance")}
              {/if}
            </p>
          </div>
          <div class="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p class="text-sm text-amber-400 font-medium mb-1">{$_("reports.priorityHealth")}</p>
            <p class="text-foreground">
              {#if priorities.critical + priorities.high > priorities.medium + priorities.low}
                {$_("reports.insightHighPriority")}
              {:else}
                {$_("reports.insightBalanced")}
              {/if}
            </p>
          </div>
          <div class="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <p class="text-sm text-emerald-400 font-medium mb-1">{$_("reports.productivityTip")}</p>
            <p class="text-foreground">
              {#if stats.completionRate >= 80}
                {$_("reports.insightGreatProgress")}
              {:else if stats.completionRate >= 50}
                {$_("reports.insightGoodProgress")}
              {:else}
                {$_("reports.insightNeedsAttention")}
              {/if}
            </p>
          </div>
          {#if methodology === "agile"}
            <div class="p-4 rounded-lg bg-violet-500/10 border border-violet-500/30">
              <p class="text-sm text-violet-400 font-medium mb-1">{$_("reports.sprintHealth")}</p>
              <p class="text-foreground">
                {#if stats.activeSprint}
                  {$_("reports.insightActiveSprint", { values: { name: stats.activeSprint } })}
                {:else}
                  {$_("reports.insightNoSprint")}
                {/if}
              </p>
            </div>
          {/if}
          </div>
        </div>
      {/if}
    {/if}

    <!-- ============ METRICS TAB ============ -->
    {#if activeTab === "metrics"}
      {@const metrics = getAdvancedMetrics()}

      <!-- Time Metrics -->
      <div class="grid md:grid-cols-4 gap-4">
        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Timer size={18} class="text-blue-500" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.leadTime")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{metrics.avgLeadTime}</p>
          <p class="text-xs text-muted-foreground mt-1">{$_("reports.daysAvg")}</p>
        </div>

        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <Clock size={18} class="text-violet-500" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.cycleTime")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{metrics.avgCycleTime}</p>
          <p class="text-xs text-muted-foreground mt-1">{$_("reports.hoursAvg")}</p>
        </div>

        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <TrendingUp size={18} class="text-emerald-500" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.throughput")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{metrics.weeklyThroughput}</p>
          <p class="text-xs text-muted-foreground mt-1">{$_("reports.tasksPerWeek")}</p>
        </div>

        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <AlertCircle size={18} class="text-amber-500" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.taskAge")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{metrics.avgTaskAge}</p>
          <p class="text-xs text-muted-foreground mt-1">{$_("reports.daysAvgOpen")}</p>
        </div>
      </div>

      <!-- WIP & Health Metrics -->
      <div class="grid md:grid-cols-3 gap-4">
        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <BarChart2 size={18} class="text-primary" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.wip")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{metrics.wipCount}</p>
          <p class="text-xs text-muted-foreground mt-1">{metrics.wipPoints} {$_("reports.points")} {$_("reports.inProgress")}</p>
        </div>

        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <AlertCircle size={18} class="text-rose-500" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.blocked")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{metrics.blockedCount}</p>
          <p class="text-xs text-muted-foreground mt-1">{$_("reports.tasksBlocked")}</p>
        </div>

        <div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div class="flex items-center gap-2 mb-2">
            <GitCompare size={18} class="text-orange-500" />
            <span class="text-xs text-muted-foreground uppercase tracking-wide">{$_("reports.bugRatio")}</span>
          </div>
          <p class="text-3xl font-bold text-foreground">{metrics.bugRatio}%</p>
          <p class="text-xs text-muted-foreground mt-1">{$_("reports.ofAllTasks")}</p>
        </div>
      </div>

      <!-- Sprint Commitment (Agile only) -->
      {#if methodology === "agile" && activeSprint}
        <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div class="flex items-center gap-3 mb-4">
            <Target size={20} class="text-primary" />
            <div>
              <h2 class="text-lg font-semibold text-foreground">{$_("reports.sprintCommitment")}</h2>
              <p class="text-sm text-muted-foreground">{activeSprint.name}</p>
            </div>
          </div>
          <div class="grid md:grid-cols-3 gap-6">
            <div class="text-center">
              <p class="text-4xl font-bold text-muted-foreground">{metrics.sprintCommitment.planned}</p>
              <p class="text-sm text-muted-foreground mt-1">{$_("reports.planned")} {$_("reports.points")}</p>
            </div>
            <div class="text-center">
              <p class="text-4xl font-bold text-emerald-500">{metrics.sprintCommitment.delivered}</p>
              <p class="text-sm text-muted-foreground mt-1">{$_("reports.delivered")} {$_("reports.points")}</p>
            </div>
            <div class="text-center">
              <p class="text-4xl font-bold {metrics.sprintCommitment.rate >= 80 ? 'text-emerald-500' : metrics.sprintCommitment.rate >= 50 ? 'text-amber-500' : 'text-rose-500'}">{metrics.sprintCommitment.rate}%</p>
              <p class="text-sm text-muted-foreground mt-1">{$_("reports.deliveryRate")}</p>
            </div>
          </div>
          <!-- Progress Bar -->
          <div class="mt-4">
            <div class="h-3 bg-muted rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all {metrics.sprintCommitment.rate >= 80 ? 'bg-emerald-500' : metrics.sprintCommitment.rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}"
                style="width: {Math.min(100, metrics.sprintCommitment.rate)}%"
              ></div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Work Distribution -->
      <div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div class="flex items-center gap-3 mb-4">
          <Users size={20} class="text-primary" />
          <div>
            <h2 class="text-lg font-semibold text-foreground">{$_("reports.workDistribution")}</h2>
            <p class="text-sm text-muted-foreground">{$_("reports.workDistributionDesc")}</p>
          </div>
        </div>
        <div class="flex items-center gap-4 mb-4">
          <div class="flex-1">
            <div class="flex justify-between mb-1">
              <span class="text-sm text-muted-foreground">{$_("reports.balance")}</span>
              <span class="text-sm font-medium {metrics.distributionBalance >= 80 ? 'text-emerald-500' : metrics.distributionBalance >= 50 ? 'text-amber-500' : 'text-rose-500'}">{metrics.distributionBalance}%</span>
            </div>
            <div class="h-2 bg-muted rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all {metrics.distributionBalance >= 80 ? 'bg-emerald-500' : metrics.distributionBalance >= 50 ? 'bg-amber-500' : 'bg-rose-500'}"
                style="width: {metrics.distributionBalance}%"
              ></div>
            </div>
          </div>
        </div>
        {#if Object.keys(metrics.memberTasks).length > 0}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {#each Object.entries(metrics.memberTasks).sort((a, b) => b[1] - a[1]) as [member, count]}
              <div class="p-3 rounded-lg bg-muted/50">
                <p class="font-medium text-foreground truncate text-sm">{member}</p>
                <p class="text-2xl font-bold text-primary">{count}</p>
                <p class="text-xs text-muted-foreground">{$_("reports.tasks")}</p>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Aging Tasks Alert -->
      {#if metrics.oldestTaskAge > 30}
        <div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div class="flex items-start gap-3">
            <AlertCircle size={20} class="text-amber-500 mt-0.5" />
            <div>
              <p class="font-medium text-foreground">{$_("reports.agingAlert")}</p>
              <p class="text-sm text-muted-foreground mt-1">
                {$_("reports.agingAlertDesc", { values: { days: metrics.oldestTaskAge } })}
              </p>
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</main>
