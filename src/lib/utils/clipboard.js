/**
 * Clipboard utilities for formatting tasks
 */

/**
 * Format a single task for clipboard in a readable, aesthetic format
 * @param {object} task - The task object
 * @param {object} options - Formatting options
 * @param {object[]} options.allTasks - All tasks (for resolving related task titles)
 * @param {object[]} options.sprints - All sprints (for resolving sprint names)
 * @returns {string} Formatted task string
 */
export function formatTaskForClipboard(task, options = {}) {
  const { allTasks = [], sprints = [] } = options;
  const lines = [];

  // Header with title and ID
  lines.push(`📋 ${task.title}`);
  lines.push(`${"─".repeat(Math.min(50, task.title.length + 3))}`);

  // Type, Priority, Status row
  const badges = [];
  if (task.type) {
    const typeEmoji = task.type === "bug" ? "🐛" : task.type === "chore" ? "🔧" : "📖";
    badges.push(`${typeEmoji} ${capitalize(task.type)}`);
  }
  if (task.priority) {
    const priorityEmoji = getPriorityEmoji(task.priority);
    badges.push(`${priorityEmoji} ${capitalize(task.priority)}`);
  }
  if (task.status) {
    badges.push(`📊 ${task.status}`);
  }
  if (badges.length > 0) {
    lines.push(badges.join("  •  "));
  }

  // Points and Time
  const metrics = [];
  if (task.points) {
    metrics.push(`🎯 ${task.points} points`);
  }
  if (task.time) {
    metrics.push(`⏱️ ${task.time}`);
  }
  if (task.elapsedSeconds && task.elapsedSeconds > 0) {
    metrics.push(`⏳ ${formatElapsedTime(task.elapsedSeconds)} tracked`);
  }
  if (metrics.length > 0) {
    lines.push(metrics.join("  •  "));
  }

  // Blocked status
  if (task.blocked) {
    lines.push(`🚫 BLOCKED${task.blocker ? `: ${task.blocker}` : ""}`);
  }

  // Assignee and Sprint
  const assignment = [];
  if (task.asign) {
    assignment.push(`👤 ${task.asign}`);
  }
  if (task.sprintId) {
    const sprint = sprints.find(s => s.id === task.sprintId);
    assignment.push(`🏃 ${sprint?.name || "Sprint"}`);
  }
  if (task.epic) {
    assignment.push(`🎯 ${task.epic}`);
  }
  if (assignment.length > 0) {
    lines.push(assignment.join("  •  "));
  }

  // Description
  if (task.description) {
    lines.push("");
    lines.push("📝 Description:");
    lines.push(task.description.trim());
  }

  // Acceptance Criteria
  if (task.acceptance) {
    lines.push("");
    lines.push("✅ Acceptance Criteria:");
    lines.push(task.acceptance.trim());
  }

  // Subtasks
  if (task.subtasks && Array.isArray(task.subtasks) && task.subtasks.length > 0) {
    lines.push("");
    const completedCount = task.subtasks.filter(s => s.completed).length;
    lines.push(`📋 Subtasks (${completedCount}/${task.subtasks.length}):`);
    task.subtasks.forEach(subtask => {
      const checkbox = subtask.completed ? "☑" : "☐";
      lines.push(`  ${checkbox} ${subtask.text}`);
    });
  }

  // Related Tasks
  if (task.relatedTasks && Array.isArray(task.relatedTasks) && task.relatedTasks.length > 0) {
    lines.push("");
    lines.push("🔗 Related Tasks:");
    task.relatedTasks.forEach(relatedId => {
      const relatedTask = allTasks.find(t => t.id === relatedId);
      if (relatedTask) {
        lines.push(`  → ${relatedTask.title}`);
      }
    });
  }

  // Tags
  if (task.tags && Array.isArray(task.tags) && task.tags.length > 0) {
    lines.push("");
    lines.push(`🏷️ Tags: ${task.tags.join(", ")}`);
  }

  // Footer with dates
  lines.push("");
  lines.push("─".repeat(30));
  const dates = [];
  if (task.created) {
    dates.push(`Created: ${formatDate(task.created)}`);
  }
  if (task.updated) {
    dates.push(`Updated: ${formatDate(task.updated)}`);
  }
  if (dates.length > 0) {
    lines.push(dates.join("  •  "));
  }
  lines.push(`ID: ${task.id}`);

  return lines.join("\n");
}

/**
 * Format multiple tasks as a board summary for clipboard
 * @param {object[]} tasks - Array of tasks
 * @param {object[]} statuses - Array of status objects
 * @param {object} options - Formatting options
 * @returns {string} Formatted summary string
 */
export function formatBoardSummaryForClipboard(tasks, statuses, options = {}) {
  const { sprints = [], showDetails = false, filters = [], project = "" } = options;
  const lines = [];

  // Header
  lines.push("📊 Task Board Summary");
  lines.push("═".repeat(40));
  if (project) lines.push(`Project: ${project}`);
  // Say what the numbers cover. Pasting a filtered summary with no note of the
  // filter reads as the whole board, which is how a partial count gets quoted
  // as if it were the total.
  if (filters.length > 0) {
    lines.push(`Filtered by: ${filters.join(" · ")}`);
  }
  lines.push("");

  // Overall stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === "DONE").length;
  const blockedTasks = tasks.filter(t => t.blocked).length;
  const totalPoints = tasks.reduce((sum, t) => sum + (Number(t.points) || 0), 0);

  lines.push(`📈 Overview:`);
  lines.push(`   Total: ${totalTasks} tasks  •  Done: ${completedTasks}  •  Points: ${totalPoints}`);
  if (blockedTasks > 0) {
    lines.push(`   🚫 Blocked: ${blockedTasks} tasks`);
  }
  lines.push("");

  // Tasks by status
  statuses.forEach(statusItem => {
    const statusTasks = tasks.filter(t => t.status === statusItem.status);
    const statusPoints = statusTasks.reduce((sum, t) => sum + (Number(t.points) || 0), 0);

    lines.push(`┌─ ${statusItem.status} (${statusTasks.length} tasks, ${statusPoints} pts)`);

    if (statusTasks.length === 0) {
      lines.push("│  (empty)");
    } else {
      statusTasks.forEach((task, index) => {
        const isLast = index === statusTasks.length - 1;
        const prefix = isLast ? "└" : "├";

        // Build task line
        const taskParts = [];

        // Priority indicator
        const priorityIndicator = getPriorityIndicator(task.priority);
        taskParts.push(priorityIndicator);

        // Title
        taskParts.push(task.title);

        // Points
        if (task.points) {
          taskParts.push(`[${task.points}pts]`);
        }

        // Blocked indicator
        if (task.blocked) {
          taskParts.push("🚫");
        }

        // Assignee
        if (task.asign) {
          taskParts.push(`@${task.asign}`);
        }

        lines.push(`${prefix}─ ${taskParts.join(" ")}`);

        // Show subtasks progress if any
        if (task.subtasks && task.subtasks.length > 0) {
          const completed = task.subtasks.filter(s => s.completed).length;
          const subPrefix = isLast ? "   " : "│  ";
          lines.push(`${subPrefix} └ Subtasks: ${completed}/${task.subtasks.length}`);
        }
      });
    }
    lines.push("");
  });

  // Footer
  lines.push("─".repeat(40));
  lines.push(`Generated: ${new Date().toLocaleString()}`);

  return lines.join("\n");
}

/**
 * Copy text to clipboard with fallback
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    return true;
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    return false;
  }
}

// Helper functions
function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function getPriorityEmoji(priority) {
  switch (priority?.toLowerCase()) {
    case "critical": return "🔴";
    case "high": return "🟠";
    case "medium": return "🟡";
    case "low": return "🔵";
    default: return "⚪";
  }
}

function getPriorityIndicator(priority) {
  switch (priority?.toLowerCase()) {
    case "critical": return "‼️";
    case "high": return "❗";
    case "medium": return "•";
    case "low": return "○";
    default: return "•";
  }
}

function formatElapsedTime(seconds) {
  if (!seconds || seconds <= 0) return "0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
