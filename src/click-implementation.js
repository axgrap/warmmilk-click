/**
 * Click Implementation
 * Timeline view and interactive navigation for temporal project data
 */

// Initialize the Warmmilk Click Client
const client = new WarmmilkClickClient(
  "https://axgrap.github.io/warmmilk-click/temporal-data.json"
);

// Timeline view state
const timeline = {
  events: [],
  commitToElement: new Map(),
  lineToCommits: new Map(), // Maps line content hash to array of commit elements
};

// Load data when page loads
document.addEventListener("DOMContentLoaded", async () => {
  try {
    console.log("Loading temporal data...");
    await client.load();
    console.log("Data loaded successfully!");

    // Log some basic information about the loaded data
    const metadata = client.getMetadata();
    console.log("Data generated at:", metadata?.generatedAt);

    const projects = client.getProjects();
    console.log(`Found ${projects.length} project(s)`);

    projects.forEach((project) => {
      const stats = project.getStats();
      console.log(`\nProject: ${stats.name}`);
      console.log(`  - Total commits: ${stats.totalCommits}`);
      console.log(`  - Click file commits: ${stats.clickFileCommits}`);
      console.log(`  - Total images: ${stats.totalImages}`);
      console.log(`  - Authors: ${stats.authors.join(", ")}`);
      console.log(
        `  - Date range: ${stats.dateRange.first} to ${stats.dateRange.last}`
      );
    });

    // Render the timeline view
    renderTimeline();

    // Make client available globally for easy console access
    window.clickClient = client;
    window.timeline = timeline;
    console.log("\nClient available as window.clickClient");
    console.log(
      "Try: clickClient.getProjects(), clickClient.getAllCommits(), etc."
    );
  } catch (error) {
    console.error("Failed to load temporal data:", error);
  }
});

function renderTimeline() {
  const contentArea = document.querySelector(".content-area");
  if (!contentArea) return;

  // Clear existing content
  contentArea.innerHTML = "";
  contentArea.style.height = "auto";

  // Get all commits sorted by date (newest first)
  const allCommits = client.getAllCommits();

  if (allCommits.length === 0) {
    contentArea.innerHTML =
      '<div style="padding: 40px; color: #666;">No commits found</div>';
    return;
  }

  console.log(`Rendering ${allCommits.length} commits in timeline...`);

  // Create timeline container
  const timelineContainer = document.createElement("div");
  timelineContainer.className = "timeline-container";

  // Process each commit
  allCommits.forEach((commit, index) => {
    const commitElement = createCommitElement(commit, index);
    timeline.commitToElement.set(commit.sha, commitElement);
    timeline.events.push({ commit, element: commitElement });
    timelineContainer.appendChild(commitElement);

    // Track lines for navigation
    const project = commit.getProject();
    const blameLines = project
      .getBlameHistory()
      .filter((line) => line.commit === commit.sha);

    blameLines.forEach((line) => {
      const lineHash = hashLine(line);
      if (!timeline.lineToCommits.has(lineHash)) {
        timeline.lineToCommits.set(lineHash, []);
      }
      timeline.lineToCommits.get(lineHash).push({
        commit,
        element: commitElement,
        line,
      });
    });
  });

  contentArea.appendChild(timelineContainer);
  console.log("Timeline rendered successfully!");
}

function createCommitElement(commit, index) {
  const el = document.createElement("div");
  el.className = "timeline-event";
  el.setAttribute("data-commit-sha", commit.sha);
  el.setAttribute("data-index", index);

  const project = commit.getProject();
  const date = new Date(commit.date);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Get blame lines for this commit
  const blameLines = project
    .getBlameHistory()
    .filter((line) => line.commit === commit.sha);

  let linesHTML = "";
  if (blameLines.length > 0) {
    const linesContent = blameLines
      .map((line) => {
        const lineHash = hashLine(line);
        const hasPrevious = hasEarlierCommit(line, commit);
        const clickable = hasPrevious ? "line-clickable" : "";

        return `<div class="blame-line ${clickable}" 
                   data-line-hash="${lineHash}" 
                   data-commit="${commit.sha}"
                   data-line-range="${line.lineStart}-${line.lineEnd}">
        <span class="line-number">${line.lineStart}${
          line.lineEnd > line.lineStart ? "-" + line.lineEnd : ""
        }</span>
        <span class="line-content">${escapeHtml(line.content)}</span>
      </div>`;
      })
      .join("");

    linesHTML = `
      <div class="commit-lines">
        <div class="lines-header">Modified Lines (${blameLines.length}):</div>
        ${linesContent}
      </div>
    `;
  }

  // Get modified files
  const filesHTML =
    commit.files.length > 0
      ? `
    <div class="commit-files">
      <strong>Files:</strong> ${commit.files
        .map((f) => `<code>${f}</code>`)
        .join(", ")}
    </div>
  `
      : "";

  el.innerHTML = `
    <div class="commit-header">
      <div class="commit-meta">
        <span class="commit-sha">${commit.getShortSha()}</span>
        <span class="commit-author">${escapeHtml(commit.author)}</span>
        <span class="commit-date">${formattedDate}</span>
        <span class="commit-project">${escapeHtml(project.name)}</span>
      </div>
      <div class="commit-message">${escapeHtml(commit.message)}</div>
    </div>
    ${filesHTML}
    ${linesHTML}
  `;

  // Add click handlers for lines
  setTimeout(() => {
    el.querySelectorAll(".line-clickable").forEach((lineEl) => {
      lineEl.addEventListener("click", () => {
        handleLineClick(lineEl);
      });
    });
  }, 0);

  return el;
}

function hashLine(line) {
  // Create a hash based on line content (normalized)
  return line.content.trim().substring(0, 100);
}

function hasEarlierCommit(line, currentCommit) {
  const lineHash = hashLine(line);
  const allCommitsForLine = client.getAllCommits().filter((c) => {
    const project = c.getProject();
    return project
      .getBlameHistory()
      .some(
        (bl) =>
          hashLine(bl) === lineHash &&
          new Date(c.date) < new Date(currentCommit.date)
      );
  });
  return allCommitsForLine.length > 0;
}

function handleLineClick(lineElement) {
  const lineHash = lineElement.getAttribute("data-line-hash");
  const currentCommitSha = lineElement.getAttribute("data-commit");
  const currentCommit = client
    .getAllCommits()
    .find((c) => c.sha === currentCommitSha);

  if (!currentCommit) return;

  // Find all commits that modified this line, earlier than current
  const allCommits = client.getAllCommits();
  const earlierCommits = allCommits.filter((c) => {
    const project = c.getProject();
    const hasLine = project
      .getBlameHistory()
      .some((bl) => hashLine(bl) === lineHash);
    return hasLine && new Date(c.date) < new Date(currentCommit.date);
  });

  if (earlierCommits.length === 0) return;

  // Get the most recent earlier commit (closest in time)
  earlierCommits.sort((a, b) => new Date(b.date) - new Date(a.date));
  const targetCommit = earlierCommits[0];

  // Find and scroll to the target element
  const targetElement = timeline.commitToElement.get(targetCommit.sha);
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

    // Add highlight effect
    targetElement.classList.add("highlight");
    setTimeout(() => {
      targetElement.classList.remove("highlight");
    }, 2000);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
